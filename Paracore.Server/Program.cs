using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Paracore.Server.Services;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using System.IO;
using System;

var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs");
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

    using var app = builder.Build();

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
