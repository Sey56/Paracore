using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using Paracore.Addin.App;
using Paracore.Addin.Context;
using Paracore.Addin.Services;
using Paracore.Addin.ViewModels;
using System;
using Microsoft.Extensions.DependencyInjection; // Added
using CoreScript.Engine.Logging; // Added
using Paracore.Addin.Handlers; // Added

namespace Paracore.Addin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ToggleServerCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            // The Server is considered "Running" if our logical flag is true AND the background host process is alive
            bool isActuallyRunning = ParacoreApp.ServerRunning && ParacoreApp.IsSidecarRunning();

            if (!isActuallyRunning)
            {
                try
                {
                    // Clean up any lingering clients if the process died manually behind the scenes
                    if (ParacoreApp.Client != null)
                    {
                        ParacoreApp.Client.Stop();
                        ParacoreApp.SetClient(null);
                    }
                    // Terminate lingering zombies if prior state was desynced
                    ParacoreApp.StopSidecar();

                    // --- 1. Validate Deployment and Force Strict Loading ---
                    // This ensures the developer machine behaves exactly like the user machine.
                    ParacoreApp.ValidateAndForceLoadDependencies();

                    // --- 2. Spin up the Background Sidecar Process ---
                    ParacoreApp.StartSidecar();
                    
                    // Give Kestrel a tiny window to bind the gRPC HTTP port before dialing
                    System.Threading.Thread.Sleep(500);

                    // 3. Resolve ILogger and RevitContext from the ServiceProvider
                    var logger = ParacoreApp.ServiceProvider.GetRequiredService<ILogger>();
                    var revitContext = ParacoreApp.ServiceProvider.GetRequiredService<RevitContext>();
                    
                    // ✅ Provide the active UIApplication to the context
                    revitContext.UIApplication = commandData.Application;

                    // ✅ Inject context
                    var context = new ServerContext(commandData.Application);

                    // ✅ Setup external event dispatcher
                    var actionHandler = new ServerActionHandler(ServerViewModel.Instance);
                    var codeExecutionEvent = ExternalEvent.Create(actionHandler);
                    ServerViewModel.Instance.Initialize(codeExecutionEvent);

                    // ✅ Start client with standard dispatcher
                    var client = new CoreScriptClient(
                        ParacoreApp.ServiceProvider.GetRequiredService<ScriptExecutionHandler>(),
                        ParacoreApp.ServiceProvider.GetRequiredService<MetadataHandler>(),
                        ParacoreApp.ServiceProvider.GetRequiredService<ContextHandler>(),
                        ParacoreApp.ServiceProvider.GetRequiredService<FileSystemHandler>(),
                        ParacoreApp.ServiceProvider.GetRequiredService<ReplHandler>(),
                        logger);

                    client.Start();
                    ParacoreApp.SetClient(client);
                    ParacoreApp.SetServerRunning(true);
                    ServerViewModel.Instance.IsServerRunning = true;
                }
                catch (Exception ex)
                {
                    ParacoreApp.StopSidecar(); // Fail safely
                    TaskDialog.Show("Paracore Server - Error", $"Failed to start Paracore Server: {ex.Message}\n\nCheck CoreScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }
            else
            {
                try
                {
                    ParacoreApp.Client?.Stop();
                    ParacoreApp.SetClient(null);
                    ParacoreApp.SetServerRunning(false);
                    ServerViewModel.Instance.IsServerRunning = false;

                    // TEARDOWN PROCESS
                    ParacoreApp.StopSidecar();
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Paracore Server - Error", $"Failed to stop Paracore Server: {ex.Message}\n\nCheck CoreScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }

            // Ensure IsServerRunning is updated correctly
            ServerViewModel.Instance.IsServerRunning = ParacoreApp.ServerRunning;

            return Result.Succeeded;
        }
    }
}
