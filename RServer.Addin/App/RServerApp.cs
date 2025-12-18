using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Microsoft.Extensions.DependencyInjection; // Added
using Microsoft.Extensions.Logging;
using CoreScript.Engine.Globals; // Added
using CoreScript.Engine.Logging;
using RServer.Addin.Commands;
using RServer.Addin.Helpers; // Added for CustomAssemblyResolver
using RServer.Addin.Services;
using RServer.Addin.ViewModels;
using RServer.Addin.Views;
using System;
using System.IO;
using System.Windows.Media.Imaging;

namespace RServer.Addin.App
{
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class RServerApp : IExternalApplication
    {
        public static readonly Guid DashboardPaneId = new Guid("D7C95B7A-2E34-4A1E-8A6A-45A75D25E48B");
        public static string HomePath => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        public static string RevitVersion { get; private set; } = "2025"; // Default fallback
        public static string RevitInstallPath { get; private set; } = @"C:\Program Files\Autodesk\Revit 2025"; // Default fallback
        private static CoreScriptServer? _server;
        private static bool _serverRunning;
        private static PushButton? _toggleButton;
        private static ServerActionHandler? _serverActionHandler;
        private static ExternalEvent? _externalEvent;
        private static IServiceProvider? _serviceProvider; // Added
        public static Dictionary<string, string> ActiveWorkspaces = new();

        public static bool TryGetWorkspace(string scriptPath, out string workspaceRoot) =>
            ActiveWorkspaces.TryGetValue(scriptPath, out workspaceRoot);

        public static void RegisterWorkspace(string scriptPath, string workspacePath)
        {
            ActiveWorkspaces[scriptPath] = workspacePath;
            FileLogger.Log($"Registered workspace for: {scriptPath}");
        }
        public Result OnStartup(UIControlledApplication application)
        {
            // Capture Revit version and install path
            RevitVersion = application.ControlledApplication.VersionNumber;
            RevitInstallPath = Path.GetDirectoryName(System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName) ?? RevitInstallPath;
            FileLogger.Log($"Detected Revit {RevitVersion} at {RevitInstallPath}");

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
            catch (Autodesk.Revit.Exceptions.ArgumentException)
            {
                // Tab already exists - ignore
            }
            catch (Exception)
            {
                // Log unexpected errors
            }

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

            return Result.Succeeded;
        }

        private void CreateRibbonButtons(RibbonPanel panel)
        {
            PushButtonData toggleServerButton = new(
                "ToggleCoreScriptServer",
                "Paracore\n(Off)",
                typeof(RServerApp).Assembly.Location,
                typeof(ToggleServerCommand).FullName)
            {
                ToolTip = "Toggle the CoreScript server to run scripts from VS Code.",
                LargeImage = new BitmapImage(
                    new Uri("pack://application:,,,/RServer.Addin;component/Images/RServer.png"))
            };

            _toggleButton = panel.AddItem(toggleServerButton) as PushButton;

            PushButtonData toggleDashboardButton = new(
                "ToggleDashboard",
                "Dashboard",
                typeof(RServerApp).Assembly.Location,
                typeof(ToggleDashboardCommand).FullName)
            {
                ToolTip = "Toggle the CoreScript dashboard.",
                LargeImage = new BitmapImage(
                    new Uri("pack://application:,,,/RServer.Addin;component/Images/RServer.png"))
            };

            panel.AddItem(toggleDashboardButton);
        }

        private RibbonPanel GetOrCreatePanel(UIControlledApplication app, string tabName, string panelName)
        {
            // First try getting existing panel in target tab
            foreach (RibbonPanel panel in app.GetRibbonPanels(tabName))
            {
                if (panel.Name.Equals(panelName, StringComparison.Ordinal))
                    return panel;
            }

            // Create new panel if not found
            return app.CreateRibbonPanel(tabName, panelName);
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            _server?.Stop();
            _serverRunning = false;
            UpdateButtonState();
            EphemeralWorkspaceManager.Cleanup();

            try
            {
                foreach (var workspacePath in ActiveWorkspaces.Values)
                {
                    try
                    {
                        if (Directory.Exists(workspacePath))
                            Directory.Delete(workspacePath, true);
                    }
                    catch (Exception ex)
                    {
                        FileLogger.LogError($"DeleteWorkspace: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"ShutdownCleanup: {ex.Message}");
            }
            finally
            {
                ActiveWorkspaces.Clear();
                FileLogger.Log("ActiveWorkspaces cleared");
                FileLogger.Log("=== Paracore Shutdown Complete ===");
            }
            return Result.Succeeded;
        }

        public static bool ServerRunning => _serverRunning;
        public static void SetServerRunning(bool running)
        {
            _serverRunning = running;
            UpdateButtonState();
        }

        public static CoreScriptServer? Server => _server;
        public static void SetServer(CoreScriptServer? server) => _server = server;

        public static IServiceProvider ServiceProvider => _serviceProvider ?? throw new InvalidOperationException("Service Provider has not been initialized.");

        private static void UpdateButtonState()
        {
            if (_toggleButton != null)
            {
                _toggleButton.ItemText = _serverRunning ? "Paracore\n(On)" : "Paracore\n(Off)";
                _toggleButton.ToolTip = _serverRunning
                    ? "Server is running. Click to stop."
                    : "Server is stopped. Click to start.";
            }
        }
    }
}
