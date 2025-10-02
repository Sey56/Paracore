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
            if (commandData?.Application?.ActiveUIDocument?.Document == null)
            {
                TaskDialog.Show("RScripting",
                    "Please open a valid Revit model before starting the RScripting server.");
                return Result.Cancelled;
            }

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

                    TaskDialog.Show("RScripting", "RScripting gRPC Server started on http://localhost:50051. Run scripts from VSCode!");
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("RScripting - Error", $"Failed to start RScripting gRPC Server: {ex.Message}\n\nCheck RScriptServerLog.txt for more details.");
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
                    TaskDialog.Show("RScripting", "RScripting gRPC Server stopped.");
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("RScripting - Error", $"Failed to stop RScripting gRPC Server: {ex.Message}\n\nCheck RScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }

            // Ensure IsServerRunning is updated correctly
            ServerViewModel.Instance.IsServerRunning = RServerApp.ServerRunning;

            return Result.Succeeded;
        }
    }
}