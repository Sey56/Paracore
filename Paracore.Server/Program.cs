using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Paracore.Server.Services;
using CoreScript.Engine.Globals;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using System.Text.Json;
using System.IO;
using System;

var configuredLogDir = Environment.GetEnvironmentVariable("PARACORE_SIDECAR_LOG_DIR");
var logDir = string.IsNullOrWhiteSpace(configuredLogDir)
    ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs")
    : configuredLogDir;
Directory.CreateDirectory(logDir);
var logPath = Path.Combine(logDir, "CoreScriptServerLog.txt");

void Log(string message)
{
    try
    {
        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
    }
    catch { }
}

try
{
    Log("--- Paracore Sidecar Starting ---");

    // Lifecycle Hardening: Monitor parent process if PID is provided
    var parentPidArg = args.FirstOrDefault(a => a.StartsWith("--parent-pid"));
    int parentPid = 0;
    if (parentPidArg != null)
    {
        var parts = parentPidArg.Split(' ');
        if (parts.Length > 1) int.TryParse(parts[1], out parentPid);
        else
        {
            // Handle case where it might be "--parent-pid", "1234"
            int index = Array.IndexOf(args, "--parent-pid");
            if (index >= 0 && index < args.Length - 1) int.TryParse(args[index + 1], out parentPid);
        }
    }

    if (parentPid > 0)
    {
        Log($"Parent PID provided: {parentPid}. Starting watcher...");
        _ = Task.Run(async () =>
        {
            try
            {
                using var parent = System.Diagnostics.Process.GetProcessById(parentPid);
                Log($"Monitoring parent process: {parent.ProcessName} (PID: {parentPid})");
                await parent.WaitForExitAsync();
                Log("Parent process exited. Shutting down sidecar...");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Log($"Watcher error: {ex}");
            }
        });
    }

    var builder = WebApplication.CreateBuilder(args);

    // Ensure we only use HTTP/2 for gRPC.
    // ⚠ CLOUD SEAM (Phase 0): the bind address comes from PARACORE_SIDECAR_BIND.
    // Default is localhost:50051 (unchanged). Set it to e.g. "0.0.0.0:50051" or this machine's
    // Tailscale IP so an add-in running on ANOTHER machine can reach this sidecar.
    var bindSpec = Environment.GetEnvironmentVariable("PARACORE_SIDECAR_BIND");
    if (string.IsNullOrWhiteSpace(bindSpec)) bindSpec = "localhost:50051";
    bindSpec = bindSpec.Trim();

    string bindHost = bindSpec;
    int bindPort = 50051;
    var lastColon = bindSpec.LastIndexOf(':');
    if (lastColon > 0)
    {
        bindHost = bindSpec.Substring(0, lastColon);
        if (!int.TryParse(bindSpec.Substring(lastColon + 1), out bindPort) || bindPort <= 0)
            bindPort = 50051;
    }
    bindHost = bindHost.Trim().Trim('[', ']');

    builder.WebHost.ConfigureKestrel(options =>
    {
        if (bindHost.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            Log($"Configuring Kestrel for localhost:{bindPort} (HTTP/2)...");
            options.ListenLocalhost(bindPort, o => o.Protocols = HttpProtocols.Http2);
        }
        else if (bindHost == "0.0.0.0" || bindHost == "*" || bindHost == "+")
        {
            Log($"Configuring Kestrel for ANY IP on port {bindPort} (HTTP/2)...");
            options.ListenAnyIP(bindPort, o => o.Protocols = HttpProtocols.Http2);
        }
        else if (System.Net.IPAddress.TryParse(bindHost, out var bindIp))
        {
            Log($"Configuring Kestrel for {bindIp}:{bindPort} (HTTP/2)...");
            options.Listen(bindIp, bindPort, o => o.Protocols = HttpProtocols.Http2);
        }
        else
        {
            // Kestrel binds IPs, not DNS names — a hostname means "any interface on this port".
            Log($"Bind host '{bindHost}' is not an IP; binding ANY IP on port {bindPort} (HTTP/2).");
            options.ListenAnyIP(bindPort, o => o.Protocols = HttpProtocols.Http2);
        }
    });

    // Add services to the container.
    builder.Services.AddGrpc();
    builder.Services.AddSingleton<AddinBridgeService>();

    // Roslyn-based metadata extraction runs in-process when Revit is closed.
    // These extractors are pure syntax analysis; only the Revit-bound handlers
    // in Paracore.Addin need a live document, and those stay on the bridge.
    builder.Services.AddCoreScriptEngineServices();
    builder.Services.AddSingleton<LocalMetadataService>();
    builder.Services.AddSingleton<ReplCatalogRouter>();

    using var app = builder.Build();

    // ── Shared-sidecar liveness ─────────────────────────────────────────────
    // The sidecar belongs to whichever app is using it, not to the app that
    // happened to launch the process. Both the desktop app and the Revit add-in
    // write a small lease file while they are connected. This watcher shuts the
    // process down only when NO lease is fresh — i.e. when the last user has
    // gone. Liveness is time-based, not handle-based, because the desktop shell
    // hard-kills its Python backend on close and no graceful shutdown can be
    // relied on to remove a lease.
    var configuredOwnerDir = Environment.GetEnvironmentVariable("PARACORE_SIDECAR_OWNER_DIR");
    var ownerDir = string.IsNullOrWhiteSpace(configuredOwnerDir)
        ? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "paracore-data", "sidecar-owners")
        : configuredOwnerDir;
    int leaseTimeoutSeconds = 30;
    var configuredLeaseTimeout = Environment.GetEnvironmentVariable("PARACORE_LEASE_TIMEOUT_SECONDS");
    if (int.TryParse(configuredLeaseTimeout, out var parsedLeaseTimeout) && parsedLeaseTimeout > 0)
        leaseTimeoutSeconds = parsedLeaseTimeout;

    _ = Task.Run(async () =>
    {
        var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
        // Never stop before the first app has had a chance to announce itself.
        await Task.Delay(TimeSpan.FromSeconds(Math.Clamp(leaseTimeoutSeconds / 3, 2, 10)));

        while (!lifetime.ApplicationStopping.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(Math.Clamp(leaseTimeoutSeconds / 6, 1, 5)));
            bool anyFresh = false;
            try
            {
                foreach (var file in Directory.EnumerateFiles(ownerDir, "*.json"))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(File.ReadAllText(file));
                        if (!doc.RootElement.TryGetProperty("updatedAt", out var updated)) continue;
                        long seconds = updated.ValueKind == JsonValueKind.String
                            ? long.Parse(updated.GetString() ?? "0")
                            : updated.GetInt64();
                        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() - seconds <= leaseTimeoutSeconds)
                        {
                            anyFresh = true;
                            break;
                        }
                    }
                    catch { }
                }
            }
            catch { }

            if (!anyFresh)
            {
                Log("No fresh app lease; shutting down shared sidecar.");
                lifetime.StopApplication();
                break;
            }
        }
    });

    _ = Task.Run(() => {
        try {
            while (true) {
                var line = Console.ReadLine();
                if (line != null && line.Trim().ToLower() == "exit") {
                    Log("Received graceful exit command over STDIN.");
                    var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
                    lifetime.StopApplication();
                    break;
                }
                if (line == null) break;
            }
        } catch (Exception ex) { Log($"STDIN reader error: {ex.Message}"); }
    });

    // Configure the HTTP request pipeline.
    app.MapGrpcService<AddinBridgeService>();
    app.MapGrpcService<CoreScriptProxyService>();

    app.MapGet("/", () => "Paracore Add-in Sidecar is running.");

    Log("Sidecar initialized. Running host...");
    app.Run();
}
catch (Exception ex)
{
    Log($"FATAL CRASH in Paracore.Server:{Environment.NewLine}{ex}");
    throw;
}
