using System;
using System.IO;
using System.Reflection;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Paracore.Shim
{
    /// <summary>
    /// Lightweight entry point that Revit loads directly.
    /// Has ZERO dependencies beyond Revit APIs, so it cannot conflict with any other add-in.
    /// It creates an isolated AssemblyLoadContext and loads the real Paracore.Addin into it.
    /// </summary>
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class ParacoreShim : IExternalApplication
    {
        /// <summary>Static state shared with proxy commands.</summary>
        internal static IsolatedLoadContext? LoadContext { get; private set; }
        internal static Assembly? AddinAssembly { get; private set; }

        private object? _realApp;
        private MethodInfo? _shutdownMethod;
        private System.Diagnostics.Process? _sidecarProcess;

        public Result OnStartup(UIControlledApplication application)
        {
            try
            {
                var shimDir = Path.GetDirectoryName(typeof(ParacoreShim).Assembly.Location)!;
                Log($"Shim loaded from: {shimDir}");

                // 1. Create the isolated bubble
                LoadContext = new IsolatedLoadContext(shimDir);

                // 2. Load the real add-in INTO the bubble
                var addinPath = Path.Combine(shimDir, "Paracore.Addin.dll");
                if (!File.Exists(addinPath))
                {
                    Log($"CRITICAL: Paracore.Addin.dll not found at {addinPath}");
                    return Result.Failed;
                }

                AddinAssembly = LoadContext.LoadFromAssemblyPath(addinPath);
                Log("Loaded Paracore.Addin into isolated context");

                // 3. Find and create the real ParacoreApp
                var appType = AddinAssembly.GetType("Paracore.Addin.App.ParacoreApp");
                if (appType == null)
                {
                    Log("CRITICAL: ParacoreApp type not found in loaded assembly");
                    return Result.Failed;
                }

                _realApp = Activator.CreateInstance(appType);

                // 4. Call OnStartup on the real app (inside the isolated bubble)
                var startupMethod = appType.GetMethod("OnStartup");
                _shutdownMethod = appType.GetMethod("OnShutdown");

                if (startupMethod == null)
                {
                    Log("CRITICAL: OnStartup method not found");
                    return Result.Failed;
                }

                var result = (Result)startupMethod.Invoke(_realApp, new object[] { application })!;
                Log($"ParacoreApp.OnStartup returned: {result}");

                // 5. Start the Add-in Sidecar (Paracore.Server.exe)
                if (result == Result.Succeeded)
                {
                    StartSidecar(shimDir);
                }

                return result;
            }
            catch (Exception ex)
            {
                var innerMsg = ex is TargetInvocationException tie && tie.InnerException != null
                    ? tie.InnerException.ToString()
                    : ex.ToString();
                Log($"FATAL: Shim startup failed:\n{innerMsg}");
                try
                {
                    TaskDialog.Show("Paracore - Startup Error",
                        $"Paracore failed to start:\n\n{(ex is TargetInvocationException t ? t.InnerException?.Message : ex.Message)}" +
                        "\n\nCheck ParacoreShimLog.txt in Documents for details.");
                }
                catch { }
                return Result.Failed;
            }
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            try
            {
                if (_realApp != null && _shutdownMethod != null)
                {
                    var result = (Result)_shutdownMethod.Invoke(_realApp, new object[] { application })!;
                    StopSidecar();
                    return result;
                }
                StopSidecar();
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                Log($"Shutdown error: {ex.Message}");
                return Result.Failed;
            }
        }

        private void StartSidecar(string shimDir)
        {
            try
            {
                var sidecarPath = Path.Combine(shimDir, "Paracore.Server.exe");
                Log($"Searching for Sidecar at: {sidecarPath}");

                if (File.Exists(sidecarPath))
                {
                    Log($"Starting Sidecar: {sidecarPath}");
                    _sidecarProcess = new System.Diagnostics.Process
                    {
                        StartInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = sidecarPath,
                            Arguments = $"--parent-pid {System.Diagnostics.Process.GetCurrentProcess().Id}",
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            WorkingDirectory = shimDir
                        }
                    };
                    _sidecarProcess.Start();
                    Log($"Sidecar process started successfully (PID: {_sidecarProcess.Id})");
                }
                else
                {
                    var msg = $"CRITICAL ERROR: Paracore Sidecar ('Paracore.Server.exe') not found in the add-in folder.\n\nPath searched: {sidecarPath}\n\nPlease ensure you have rebuilt the Paracore.Addin project to bundle the sidecar correctly.";
                    Log(msg);
                    TaskDialog.Show("Paracore - Sidecar Missing", msg);
                }
            }
            catch (Exception ex)
            {
                var errorMsg = $"ERROR starting Sidecar: {ex.Message}";
                Log(errorMsg);
                TaskDialog.Show("Paracore - Sidecar Error", errorMsg);
            }
        }

        private void StopSidecar()
        {
            try
            {
                if (_sidecarProcess != null && !_sidecarProcess.HasExited)
                {
                    Log("Stopping Sidecar process...");
                    _sidecarProcess.Kill();
                    _sidecarProcess.Dispose();
                    _sidecarProcess = null;
                }
            }
            catch (Exception ex)
            {
                Log($"Error stopping Sidecar: {ex.Message}");
            }
        }

        internal static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                    "ParacoreShimLog.txt");
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] {message}\n");
            }
            catch { }
        }
    }

    // -----------------------------------------------------------------------
    //  Proxy Commands
    //  These live in the Default context (where Revit invokes them), but they
    //  delegate to the REAL commands inside the isolated bubble via reflection.
    // -----------------------------------------------------------------------

    [Transaction(TransactionMode.Manual)]
    public class ToggleServerProxy : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            return ProxyHelper.ExecuteIsolated(
                "Paracore.Addin.Commands.ToggleServerCommand",
                commandData, ref message, elements);
        }
    }

    [Transaction(TransactionMode.Manual)]
    public class ToggleDashboardProxy : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            return ProxyHelper.ExecuteIsolated(
                "Paracore.Addin.Commands.ToggleDashboardCommand",
                commandData, ref message, elements);
        }
    }

    /// <summary>
    /// Helper that creates command instances in the isolated ALC and invokes Execute().
    /// </summary>
    internal static class ProxyHelper
    {
        public static Result ExecuteIsolated(
            string commandTypeName,
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
        {
            if (ParacoreShim.AddinAssembly == null)
            {
                message = "Paracore is not initialized. Please restart Revit.";
                return Result.Failed;
            }

            try
            {
                var cmdType = ParacoreShim.AddinAssembly.GetType(commandTypeName);
                if (cmdType == null)
                {
                    message = $"Command type '{commandTypeName}' not found.";
                    return Result.Failed;
                }

                var cmd = Activator.CreateInstance(cmdType)!;
                var executeMethod = cmdType.GetMethod("Execute")!;

                // Reflection handles 'ref' parameters through the args array
                var args = new object?[] { commandData, message, elements };
                var result = (Result)executeMethod.Invoke(cmd, args)!;
                message = (string)(args[1] ?? string.Empty);
                return result;
            }
            catch (TargetInvocationException ex) when (ex.InnerException != null)
            {
                ParacoreShim.Log($"Command '{commandTypeName}' failed: {ex.InnerException}");
                message = ex.InnerException.Message;
                return Result.Failed;
            }
            catch (Exception ex)
            {
                ParacoreShim.Log($"Proxy error for '{commandTypeName}': {ex}");
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
