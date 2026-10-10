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
    public partial class ParacoreApp : IExternalApplication
    {
        public static string HomePath => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        public static string RevitVersion { get; private set; } = "Unknown"; // Default fallback
        public static string RevitInstallPath { get; private set; } = @"C:\Program Files\Autodesk\Revit"; // Default fallback base

        private static CoreScriptClient? _client;
        private static bool _serverRunning;
        private static PushButton? _toggleButton;
        private static ServerActionHandler? _serverActionHandler;
        private static ExternalEvent? _externalEvent;
        private static IServiceProvider? _serviceProvider;
        private static System.Diagnostics.Process? _sidecarProcess;
        private static string? _addinDir;

        /// <summary>
        /// The class-name prefix the shim publishes for its pack-command proxy pool, e.g.
        /// <c>Paracore.Shim.PackCommandProxy3</c>. Revit instantiates a ribbon button's command
        /// by NAME, so the pool has to be named; this is the only string the add-in and the shim
        /// share, and it is VERIFIED against the loaded shim before any button is added, so the
        /// two can never drift apart in silence.
        /// </summary>
        private const string PackProxyClassPrefix = "Paracore.Shim.PackCommandProxy";

        /// <summary>
        /// Ribbon slot N -> the pack command the shim must run for it, in the order the buttons
        /// were added. Written only by <see cref="AddPackRibbonButtons"/>; read by the shim
        /// through <see cref="ResolvePackCommandTypeForSlot"/>.
        /// </summary>
        private static readonly List<Type> _packCommandSlots = [];

        /// <summary>
        /// The pack command behind ribbon slot <paramref name="slot"/>, or
        /// <see langword="null"/> when nothing is wired there.
        ///
        /// ⚠ Called by the SHIM, through reflection, when a pack button is clicked. The shim is
        /// deliberately dependency-free — it must not reference the engine or this assembly —
        /// so it can neither name a pack type nor learn a pack's name. It asks here instead,
        /// which is what keeps "which pack is installed" out of the shim entirely.
        /// </summary>
        public static Type? ResolvePackCommandTypeForSlot(int slot)
            => slot >= 0 && slot < _packCommandSlots.Count ? _packCommandSlots[slot] : null;


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

            LoadProSettings();
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

            // Load specialist packs (takeoff, clash detection, …) from the pack roots. This
            // runs BEFORE any script can be compiled, because a pack's script-facing API has
            // to be registered in time for the engine to include it in the preamble.
            // ⚠ A free-only install finds none and this is the normal case — the enterprise
            // gates stay shut and only the generic engine surface is available.
            int packs = CoreScript.Engine.Packs.PackLoader.LoadAll();
            FileLogger.Log(packs == 0
                ? "No packs installed — generic engine only."
                : $"Loaded {packs} pack(s): {string.Join(", ", CoreScript.Engine.Packs.PackLoader.LoadedPacks)}");

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

            RegisterBackgroundHooks(application);

            return Result.Succeeded;
        }

        // ------------------------------------------------------------------
        // Partial hooks. Declared here so this shared file compiles in BOTH
        // repos; the bodies live elsewhere. C# erases an unimplemented partial
        // method and its call site entirely, so a repo that omits a body pays
        // nothing for it.
        //   • LoadProSettings / AddProRibbonButtons → ParacoreApp.Pro.cs (PRO-ONLY)
        //   • RegisterBackgroundHooks → ParacoreApp.Sentinels.cs (⚠ SHARED since
        //     2026-10-08: Sentinels/watchdogs became a FREE capability, so its
        //     body ships in both repos. Do not move it back to the Pro file.)
        // ------------------------------------------------------------------
        partial void LoadProSettings();
        partial void RegisterBackgroundHooks(Autodesk.Revit.UI.UIControlledApplication app);
        partial void AddProRibbonButtons(RibbonPanel panel, string cmdAssembly, bool useShim);

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


            AddProRibbonButtons(panel, cmdAssembly, useShim);
            AddPackRibbonButtons(panel, useShim);
        }

        /// <summary>
        /// Adds one button per ribbon contribution a loaded pack announced.
        ///
        /// ⚠⚠ The button must NOT name the pack's assembly. Revit resolves a button's assembly
        /// into the DEFAULT load context, so pointing at Paracore.TakeOff.dll would load a
        /// SECOND copy of the pack there — and a second engine with it — while the copy the
        /// REPL actually reads keeps running in the isolated context. A dialog would then write
        /// settings the running engine never sees. (The same reason "make takeoff a second
        /// add-in" is the wrong fix: a second add-in lands in the default context too.) So the
        /// button names the SHIM, which Revit has already loaded, and the shim forwards the
        /// click back into the isolated context where the pack really lives.
        ///
        /// Nothing here runs on a free-only install: no packs means no contributions means no
        /// buttons, and the ribbon is byte-for-byte what it was before this mechanism existed.
        /// </summary>
        private void AddPackRibbonButtons(RibbonPanel panel, bool useShim)
        {
            var contributions = RibbonSurface.Contributions;
            if (contributions.Count == 0)
            {
                return;
            }

            if (!useShim)
            {
                FileLogger.LogError(
                    $"[Ribbon] {contributions.Count} pack button(s) were announced, but Paracore.Shim.dll is " +
                    "missing, so they cannot be routed into the isolated context. Reinstall the add-in.");
                return;
            }

            var shimAssembly = FindShimInDefaultContext();
            if (shimAssembly == null || string.IsNullOrEmpty(shimAssembly.Location))
            {
                FileLogger.LogError(
                    "[Ribbon] Paracore.Shim is not loaded in the default load context, so pack buttons " +
                    "cannot be created.");
                return;
            }

            foreach (var contribution in contributions)
            {
                int slot = _packCommandSlots.Count;
                string className = PackProxyClassPrefix
                    + slot.ToString(System.Globalization.CultureInfo.InvariantCulture);

                // A slot the shim does not publish is a BUILD MISMATCH between the add-in and
                // the shim — not something to discover on the user's first click. Fail loudly
                // and add nothing, rather than shipping a button that dies when pressed.
                if (shimAssembly.GetType(className) == null)
                {
                    FileLogger.LogError(
                        $"[Ribbon] '{className}' is not published by Paracore.Shim — the shim and the add-in " +
                        $"are out of step, so '{contribution.Name}' was NOT added. Reinstall both.");
                    break;
                }

                var button = new PushButtonData(contribution.Name, contribution.Text,
                    shimAssembly.Location, className)
                {
                    ToolTip = contribution.ToolTip,
                };

                // ⚠ The URL belongs to the PACK, not to this host: only the pack knows which
                // page documents its own button. It travels in the contribution for exactly
                // that reason.
                if (!string.IsNullOrEmpty(contribution.HelpUrl))
                {
                    button.SetContextualHelp(new ContextualHelp(
                        ContextualHelpType.Url, contribution.HelpUrl));
                }

                var icon = LoadIcon(contribution.IconPath);
                if (icon != null)
                {
                    button.LargeImage = icon;
                    button.Image = icon;
                }

                panel.AddItem(button);
                _packCommandSlots.Add(contribution.CommandType);
                FileLogger.Log(
                    $"[Ribbon] Pack button '{contribution.Name}' added at slot {slot} -> " +
                    contribution.CommandType.FullName);
            }
        }

        /// <summary>
        /// The <c>Paracore.Shim</c> assembly Revit itself loaded.
        ///
        /// ⚠ Filtered by load context on purpose. The isolated context also probes the add-in
        /// folder for dependencies, so looking the shim up by NAME alone could hand back a
        /// second copy loaded inside the bubble — a copy whose proxy pool Revit would never
        /// instantiate, because Revit only invokes what it loaded into the default context.
        /// </summary>
        private static Assembly? FindShimInDefaultContext()
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (assembly.GetName().Name == "Paracore.Shim"
                    && System.Runtime.Loader.AssemblyLoadContext.GetLoadContext(assembly)
                        == System.Runtime.Loader.AssemblyLoadContext.Default)
                {
                    return assembly;
                }
            }

            return null;
        }

        /// <summary>
        /// Loads a pack's ribbon icon from the absolute file path it announced, or returns
        /// <see langword="null"/> when there is nothing to load. A bad icon must cost the
        /// picture, never the button.
        /// </summary>
        private static BitmapImage? LoadIcon(string? path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                return null;
            }

            try
            {
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.UriSource = new Uri(path, UriKind.Absolute);
                // Read it fully now and hold no file handle: the pack folder may be replaced by
                // an installer while Revit is open.
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.EndInit();
                bitmap.Freeze();
                return bitmap;
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[Ribbon] Icon '{path}' could not be loaded: {ex.Message}");
                return null;
            }
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
                _toggleButton.ItemText = _serverRunning ? "ON" : "OFF";
                _toggleButton.Image = _serverRunning ? _iconOn : _iconOff;
                _toggleButton.LargeImage = _serverRunning ? _iconOn : _iconOff;
                _toggleButton.ToolTip = _serverRunning
                    ? "Paracore Server is running on port 50051. Click to stop."
                    : "Paracore Server is stopped. Click to start.";
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
