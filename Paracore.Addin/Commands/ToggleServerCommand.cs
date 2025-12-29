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

namespace Paracore.Addin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ToggleServerCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            if (!ParacoreApp.ServerRunning)
            {
                try
                {
                    // Resolve ILogger from the ServiceProvider
                    var logger = ParacoreApp.ServiceProvider.GetRequiredService<ILogger>();

                    // ✅ Inject context
                    var context = new ServerContext(commandData.Application);

                    // ✅ Setup external event dispatcher
                    var actionHandler = new ServerActionHandler(ServerViewModel.Instance);
                    var codeExecutionEvent = ExternalEvent.Create(actionHandler);
                    ServerViewModel.Instance.Initialize(codeExecutionEvent);

                    // ✅ Start server with standard dispatcher
                    var server = new CoreScriptServer(commandData.Application, logger); // Pass logger
                    server.Start();
                    ParacoreApp.SetServer(server);
                    ParacoreApp.SetServerRunning(true);
                    ServerViewModel.Instance.IsServerRunning = true;

                    TaskDialog.Show("Paracore Server", "Paracore Server On! You can now execute CoreScripts from Paracore and VSCode. Listening on port 50051.");
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Paracore Server - Error", $"Failed to start Paracore Server: {ex.Message}\n\nCheck CoreScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }
            else
            {
                try
                {
                    ParacoreApp.Server?.Stop();
                    ParacoreApp.SetServer(null);
                    ParacoreApp.SetServerRunning(false);
                    ServerViewModel.Instance.IsServerRunning = false;
                    TaskDialog.Show("Paracore Server", "Paracore Server stopped!");
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
