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
using Paracore.Addin.Views;
using System;
using System.IO;
using System.Windows.Media.Imaging;
using System.Collections.Generic;

namespace Paracore.Addin.App
{
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class ParacoreApp : IExternalApplication
    {
        public static readonly Guid DashboardPaneId = new Guid("D7C95B7A-2E34-4A1E-8A6A-45A75D25E48B");
        public static string HomePath => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        public static string RevitVersion { get; private set; } = "Unknown"; // Default fallback
        public static string RevitInstallPath { get; private set; } = @"C:\Program Files\Autodesk\Revit"; // Default fallback base
        private static CoreScriptServer? _server;
        private static bool _serverRunning;
        private static PushButton? _toggleButton;
        private static ServerActionHandler? _serverActionHandler;
        private static ExternalEvent? _externalEvent;
        private static IServiceProvider? _serviceProvider;

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
            FileLogger.Log($"Paracore Add-in loaded from: {typeof(ParacoreApp).Assembly.Location}");

            // Initialize the custom assembly resolver
            CoreScript.Engine.Globals.CustomAssemblyResolver.Initialize();

            // Setup Dependency Injection
            var services = new ServiceCollection();
            services.AddCoreScriptEngineServices();
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

            // Register dockable pane
            var dpid = new DockablePaneId(DashboardPaneId);
            var dp = new DashboardView();
            application.RegisterDockablePane(dpid, "Paracore Dashboard", dp);

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
            PushButtonData toggleServerButton = new(
                "ToggleCoreScriptServer",
                "(Off)",
                typeof(ParacoreApp).Assembly.Location,
                typeof(ToggleServerCommand).FullName)
            {
                ToolTip = "Toggle the Paracore server to run scripts from Paracore and VSCode.",
                LargeImage = new BitmapImage(
                    new Uri("pack://application:,,,/Paracore.Addin;component/Images/Paracore.png")),
                Image = new BitmapImage(
                    new Uri("pack://application:,,,/Paracore.Addin;component/Images/Paracore.png"))
            };

            toggleServerButton.SetContextualHelp(new ContextualHelp(ContextualHelpType.Url, "https://sey56.github.io/paracore-help/"));

            _toggleButton = panel.AddItem(toggleServerButton) as PushButton;

            PushButtonData toggleDashboardButton = new(
                "ToggleDashboard",
                "Dashboard",
                typeof(ParacoreApp).Assembly.Location,
                typeof(ToggleDashboardCommand).FullName)
            {
                ToolTip = "Toggle the Paracore dashboard.",
                LargeImage = new BitmapImage(
                    new Uri("pack://application:,,,/Paracore.Addin;component/Images/Dashboard.png")),
                Image = new BitmapImage(
                    new Uri("pack://application:,,,/Paracore.Addin;component/Images/Dashboard.png"))
            };

            toggleDashboardButton.SetContextualHelp(new ContextualHelp(ContextualHelpType.Url, "https://sey56.github.io/paracore-help/"));

            panel.AddItem(toggleDashboardButton);
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
            _server?.Stop();
            _serverRunning = false;
            UpdateButtonState();

            FileLogger.Log("=== Paracore Shutdown Complete ===");

            return Result.Succeeded;
        }

        public static bool ServerRunning => _serverRunning;
        public static void SetServerRunning(bool running)
        {
            _serverRunning = running;
            UpdateButtonState();
        }

        public static CoreScriptServer? Server => _server;
        public static void SetServer(CoreScriptServer? server)
        {
            _server = server;
        }

        public static IServiceProvider ServiceProvider => _serviceProvider ?? throw new InvalidOperationException("Service Provider has not been initialized.");

        private static void UpdateButtonState()
        {
            if (_toggleButton != null)
            {
                _toggleButton.ItemText = _serverRunning ? "(On)" : "(Off)";
                _toggleButton.ToolTip = _serverRunning
                    ? "Server is running. Click to stop."
                    : "Server is stopped. Click to start.";
            }
        }
    }
}
