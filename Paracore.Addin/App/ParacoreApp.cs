using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;
using Paracore.Addin.Commands;
using Paracore.Addin.Helpers;
using Paracore.Addin.Services;
using Paracore.Addin.ViewModels;
using System;
using System.IO;
using System.Windows.Media.Imaging;
using System.Collections.Generic;

using System.Reflection;

namespace Paracore.Addin.App
{
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class ParacoreApp : IExternalApplication
    {
        public static string HomePath => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        public static string RevitVersion { get; private set; } = "Unknown"; // Default fallback
        public static string RevitInstallPath { get; private set; } = @"C:\Program Files\Autodesk\Revit"; // Default fallback base
        private static readonly string _iconName =
            (bool?)Type.GetType("CoreScript.Engine.Globals.TakeOffExtensions, CoreScript.Engine")
                ?.GetField("IsPro")?.GetValue(null) == true
            ? "ParacorePro.png" : "Paracore.png";

        private static CoreScriptClient? _client;
        private static bool _serverRunning;
        private static PushButton? _toggleButton;
        private static ServerActionHandler? _serverActionHandler;
        private static ExternalEvent? _externalEvent;
        private static IServiceProvider? _serviceProvider;
        private static System.Diagnostics.Process? _sidecarProcess;
        private static string? _addinDir;


        public static Dictionary<string, string> ActiveWorkspaces = new(); // Kept for legacy compatibility if needed

        public static void RegisterWorkspace(string scriptPath, string workspacePath)
        {
            // V3: No-op. We no longer manage sync states.
        }

        public Result OnStartup(UIControlledApplication application)
        {
            // Clear previous session logs first
            FileLogger.ClearLog();

            // Capture Revit version and install path
            RevitVersion = application.ControlledApplication.VersionNumber;
            RevitInstallPath = Path.GetDirectoryName(System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName) ?? RevitInstallPath;
            FileLogger.Log($"Detected Revit {RevitVersion} at {RevitInstallPath}");

            // Primary: env var set by the shim (always correct).
            // Fallback: Assembly.Location (regular install).
            var addinDir = Environment.GetEnvironmentVariable("PARACORE_ADDIN_DIR")
                ?? Path.GetDirectoryName(typeof(ParacoreApp).Assembly.Location);
            _addinDir = addinDir; // cached for StartSidecar
            FileLogger.Log($"Paracore Add-in loaded from: {addinDir}");

            // NOTE: ALC isolation is now handled by Paracore.Shim.
            // This code runs INSIDE the isolated context.

            // Setup Dependency Injection
            var services = new ServiceCollection();
            
            // Register Revit Context provider (to hold UIApplication later)
            services.AddSingleton<Paracore.Addin.App.RevitContext>();

            // Register Engine services
            services.AddCoreScriptEngineServices();

            // Register Addin Handlers
            services.AddSingleton<Paracore.Addin.Handlers.ScriptExecutionHandler>();
            services.AddSingleton<Paracore.Addin.Handlers.MetadataHandler>();
            services.AddSingleton<Paracore.Addin.Handlers.ContextHandler>();
            services.AddSingleton<Paracore.Addin.Handlers.FileSystemHandler>();
            services.AddSingleton<Paracore.Addin.Handlers.ReplHandler>();

            _serviceProvider = services.BuildServiceProvider();

            const string tabName = "Paracore";
            const string panelName = "Core Tools";

            // Tab creation (safe)
            try
            {
                application.CreateRibbonTab(tabName);
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException) { }
            catch (Exception) { }

            // Get existing panel or create new
            RibbonPanel panel = GetOrCreatePanel(application, tabName, panelName);
            CreateRibbonButtons(panel);

            // Ensure the server is marked as not running on startup
            ServerViewModel.Instance.IsServerRunning = false;

            // Initialize the ViewModel with the external event
            _serverActionHandler = new ServerActionHandler(ServerViewModel.Instance);
            _externalEvent = ExternalEvent.Create(_serverActionHandler);
            ServerViewModel.Instance.Initialize(_externalEvent);

            // Subscribe to Idling for BIM Watchdog
            application.Idling += OnIdling;

            return Result.Succeeded;
        }

        private void OnIdling(object sender, Autodesk.Revit.UI.Events.IdlingEventArgs e)
        {
            // V3.1: Watchdogs run even if server is toggled off in ribbon
            UIApplication uiApp = sender is UIApplication app ? app : new UIApplication(sender as Autodesk.Revit.ApplicationServices.Application);
            if (uiApp == null) return;

            var doc = uiApp.ActiveUIDocument?.Document;
            if (doc == null) return;

            var pendingWatchdogs = WatchdogRegistry.GetPendingCallbacks();
            if (pendingWatchdogs.Count == 0) return;

            foreach (var watchdog in pendingWatchdogs)
            {
                try
                {
                    WatchdogRegistry.CurrentWatchdogPath = watchdog.ScriptPath;

                    // Initialize Global Context for ScriptApi access
                    var ctx = new WatchdogContext(uiApp, doc, watchdog.Parameters);
                    var execContext = new ExecutionGlobals(ctx, watchdog.Parameters);
                    ExecutionGlobals.SetContext(execContext);

                    // Use Low priority for background loops
                    watchdog.LastRun = DateTime.Now;
                    watchdog.Action(doc);
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[Watchdog] Error executing background task for {watchdog.ScriptPath}: {ex.Message}");
                }
                finally
                {
                    WatchdogRegistry.CurrentWatchdogPath = null;
                    ExecutionGlobals.ClearContext();
                }
            }
        }

        private void CreateRibbonButtons(RibbonPanel panel)
        {
            // Determine command assembly: use shim proxies if available, else direct commands (fallback)
            var assemblyDir = Path.GetDirectoryName(typeof(ParacoreApp).Assembly.Location)!;
            var shimPath = Path.Combine(assemblyDir, "Paracore.Shim.dll");
            var useShim = File.Exists(shimPath);
            var cmdAssembly = useShim ? shimPath : typeof(ParacoreApp).Assembly.Location;

            PushButtonData toggleServerButton = new(
                "ToggleCoreScriptServer",
                "OFF",
                cmdAssembly,
                useShim ? "Paracore.Shim.ToggleServerProxy" : typeof(ToggleServerCommand).FullName!)
            {
                ToolTip = "Server is stopped. Click to start.",
                LargeImage = _iconOff,
                Image = _iconOff
            };

            toggleServerButton.SetContextualHelp(new ContextualHelp(ContextualHelpType.Url, "https://sey56.github.io/paracore-help/"));

            _toggleButton = panel.AddItem(toggleServerButton) as PushButton;

        }

        private RibbonPanel GetOrCreatePanel(UIControlledApplication app, string tabName, string panelName)
        {
            foreach (RibbonPanel panel in app.GetRibbonPanels(tabName))
            {
                if (panel.Name.Equals(panelName, StringComparison.Ordinal))
                    return panel;
            }
            return app.CreateRibbonPanel(tabName, panelName);
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            _client?.Stop();
            _serverRunning = false;
            UpdateButtonState();

            StopSidecar();

            FileLogger.Log("=== Paracore Shutdown Complete ===");

            return Result.Succeeded;
        }

        public static bool ServerRunning => _serverRunning;
        public static void SetServerRunning(bool running)
        {
            _serverRunning = running;
            UpdateButtonState();
        }

        public static CoreScriptClient? Client => _client;
        public static void SetClient(CoreScriptClient? client)
        {
            _client = client;
        }

        /// <summary>
        /// Resolves the addin directory from multiple sources, in priority order.
        /// Works in normal install AND Add-in-Manager dev workflow.
        /// </summary>
        private static string ResolveAddinDir()
        {
            // 1. Env var set by the shim (normal install)
            var env = Environment.GetEnvironmentVariable("PARACORE_ADDIN_DIR");
            if (!string.IsNullOrEmpty(env)) return env;

            // 2. Cached from OnStartup (normal install)
            if (!string.IsNullOrEmpty(_addinDir)) return _addinDir;

            // 3. Find the shim assembly — its directory is where all DLLs live
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.GetName().Name == "Paracore.Shim"
                    && !string.IsNullOrEmpty(asm.Location))
                    return Path.GetDirectoryName(asm.Location)!;
            }

            // 4. Module path — more reliable than Assembly.Location
            //    in isolated load contexts (Add-in-Manager).
            var mod = typeof(ParacoreApp).Module.FullyQualifiedName;
            if (!string.IsNullOrEmpty(mod))
                return Path.GetDirectoryName(mod)!;

            // 5. Assembly.Location (regular non-isolated loads)
            var loc = typeof(ParacoreApp).Assembly.Location;
            if (!string.IsNullOrEmpty(loc))
                return Path.GetDirectoryName(loc)!;

            // 6. Last resort
            return Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)
                + @"\Paracore";
        }

        public static void StartSidecar()
        {
            var addinDir = ResolveAddinDir();
            var sidecarPath = Path.Combine(addinDir, "Paracore.Server.exe");

            if (File.Exists(sidecarPath))
            {
                _sidecarProcess = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = sidecarPath,
                        Arguments = $"--parent-pid {System.Diagnostics.Process.GetCurrentProcess().Id}",
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardInput = true,
                        WorkingDirectory = addinDir
                    }
                };
                _sidecarProcess.Start();
                FileLogger.Log($"Sidecar process started successfully (PID: {_sidecarProcess.Id})");
            }
            else
            {
                string msg = $"CRITICAL ERROR: Paracore Sidecar ('Paracore.Server.exe') not found in the add-in folder.\nPath searched: {sidecarPath}";
                FileLogger.LogError(msg);
                throw new FileNotFoundException(msg);
            }
        }

        public static void StopSidecar()
        {
            try
            {
                if (_sidecarProcess != null && !_sidecarProcess.HasExited)
                {
                    FileLogger.Log("Stopping Sidecar process gracefully via stdin...");
                    try { _sidecarProcess.StandardInput.WriteLine("exit"); } catch { }
                    
                    if (!_sidecarProcess.WaitForExit(1500))
                    {
                        FileLogger.Log("Sidecar process didn't close in time. Force killing.");
                        try { _sidecarProcess.Kill(); } catch { }
                    }

                    _sidecarProcess.Dispose();
                    _sidecarProcess = null;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Error stopping Sidecar: {ex.Message}");
            }
        }

        public static bool IsSidecarRunning()
        {
            if (_sidecarProcess == null) return false;
            try
            {
                return !_sidecarProcess.HasExited;
            }
            catch
            {
                return false;
            }
        }

        public static IServiceProvider ServiceProvider => _serviceProvider ?? throw new InvalidOperationException("Service Provider has not been initialized.");

        public static void ValidateAndForceLoadDependencies()
        {
            var addinDir = Path.GetDirectoryName(typeof(ParacoreApp).Assembly.Location);
            if (string.IsNullOrEmpty(addinDir)) return;

            // 1. Health Check (Probe for existence)
            var criticalProbes = new[] {
                "CoreScript.Engine.dll",
                "Paracore.Server.exe", // The new Sidecar muscle
                "Grpc.Net.Client.dll"
            };

            var missing = new List<string>();
            foreach (var dll in criticalProbes)
            {
                if (!File.Exists(Path.Combine(addinDir, dll)))
                    missing.Add(dll);
            }

            if (missing.Count > 0)
            {
                string msg = "Paracore: Critical components are missing from the installation folder.\n\n" +
                             "Missing: " + string.Join(", ", missing);
                FileLogger.LogError(msg);
                throw new InvalidOperationException(msg);
            }

            // NOTE: Strict ALC loading is now handled by Paracore.Shim.
            // All dependencies resolve from the isolated context automatically.
        }

        private static readonly BitmapImage _iconOn = CreateStatusIcon(System.Windows.Media.Colors.LimeGreen);
        private static readonly BitmapImage _iconOff = CreateStatusIcon(System.Windows.Media.Colors.IndianRed);

        /// <summary>Creates a 16x16 circle icon filled with the given color.</summary>
        private static BitmapImage CreateStatusIcon(System.Windows.Media.Color color)
        {
            int size = 16;
            var visual = new System.Windows.Media.DrawingVisual();
            using (var dc = visual.RenderOpen())
            {
                dc.DrawEllipse(
                    new System.Windows.Media.SolidColorBrush(color),
                    null,
                    new System.Windows.Point(size / 2.0, size / 2.0),
                    size / 2.0 - 1, size / 2.0 - 1);
            }
            var bitmap = new System.Windows.Media.Imaging.RenderTargetBitmap(
                size, size, 96, 96, System.Windows.Media.PixelFormats.Pbgra32);
            bitmap.Render(visual);
            var encoder = new System.Windows.Media.Imaging.PngBitmapEncoder();
            encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(bitmap));
            using (var ms = new System.IO.MemoryStream())
            {
                encoder.Save(ms);
                ms.Seek(0, System.IO.SeekOrigin.Begin);
                var bmp = new BitmapImage();
                bmp.BeginInit();
                bmp.StreamSource = ms;
                bmp.CacheOption = BitmapCacheOption.OnLoad;
                bmp.EndInit();
                bmp.Freeze();
                return bmp;
            }
        }

        private static void UpdateButtonState()
        {
            if (_toggleButton != null)
            {
                _toggleButton.ItemText = _serverRunning ? "Server On" : "Server Off";
                _toggleButton.Image = _serverRunning ? _iconOn : _iconOff;
                _toggleButton.LargeImage = _serverRunning ? _iconOn : _iconOff;
                _toggleButton.ToolTip = _serverRunning
                    ? "Server is running on port 50051. Click to stop."
                    : "Server is stopped. Click to start.";
            }
        }

        private void ValidateDeploymentHealth(string addinDir)
        {
            try
            {
                // We only probe for the presence of TOP-LEVEL assemblies.
                // If they are missing, it's a critical installation error.
                // We avoid listing every single abstraction to keep messages clean.
                var criticalProbes = new[] {
                    "CoreScript.Engine.dll",
                    "Grpc.AspNetCore.Server.dll",
                    "Microsoft.Extensions.Hosting.dll"
                };

                var missing = new List<string>();
                foreach (var dll in criticalProbes)
                {
                    if (!File.Exists(Path.Combine(addinDir, dll)))
                        missing.Add(dll);
                }

                if (missing.Count > 0)
                {
                    string msg = "Paracore: Critical components are missing from the installation folder. " +
                                 "The application will not function correctly.\n\n" +
                                 "Missing: " + string.Join(", ", missing);

                    FileLogger.LogError(msg);
                    TaskDialog.Show("Paracore - System Health", msg);
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[Health] Failed to validate deployment: {ex.Message}");
            }
        }
    }
}
