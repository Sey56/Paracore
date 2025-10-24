using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RScript.Engine.Context;
using RServer.Addin.App;
using RServer.Addin.Context;
using RServer.Addin.Services;
using RServer.Addin.ViewModels;
using System;
using Microsoft.Extensions.DependencyInjection; // Added
using RScript.Engine.Logging; // Added

namespace RServer.Addin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ToggleServerCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            if (!RServerApp.ServerRunning)
            {
                try
                {
                    // Resolve ILogger from the ServiceProvider
                    var logger = RServerApp.ServiceProvider.GetRequiredService<ILogger>();

                    // ✅ Inject context
                    var context = new ServerContext(commandData.Application);

                    // ✅ Setup external event dispatcher
                    var actionHandler = new ServerActionHandler(ServerViewModel.Instance);
                    var codeExecutionEvent = ExternalEvent.Create(actionHandler);
                    ServerViewModel.Instance.Initialize(codeExecutionEvent);

                    // ✅ Start server with standard dispatcher
                    var server = new RScriptServer(commandData.Application, logger); // Pass logger
                    server.Start();
                    RServerApp.SetServer(server);
                    RServerApp.SetServerRunning(true);
                    ServerViewModel.Instance.IsServerRunning = true;

                    TaskDialog.Show("RServer", "RServer On! You can now execute RevitScripts from Paracore and Vscode. Listening on port 50051.");
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("RServer - Error", $"Failed to start RServer: {ex.Message}\n\nCheck RScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }
            else
            {
                try
                {
                    RServerApp.Server?.Stop();
                    RServerApp.SetServer(null);
                    RServerApp.SetServerRunning(false);
                    ServerViewModel.Instance.IsServerRunning = false;
                    TaskDialog.Show("RServer", "RServer stopped!");
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("RServer - Error", $"Failed to stop RServer: {ex.Message}\n\nCheck RScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }

            // Ensure IsServerRunning is updated correctly
            ServerViewModel.Instance.IsServerRunning = RServerApp.ServerRunning;

            return Result.Succeeded;
        }
    }
}