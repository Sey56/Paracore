using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using Paracore.Addin.App;
using Paracore.Addin.Context;
using Paracore.Addin.Services;
using Paracore.Addin.ViewModels;
using System;
using Microsoft.Extensions.DependencyInjection;
using CoreScript.Engine.Logging;
using Paracore.Addin.Handlers;

namespace Paracore.Addin.Commands
{
    /// <summary>
    /// Opens or closes REVIT'S CONNECTION to the shared Paracore.Server.exe.
    ///
    /// ⚠ Since 2026-11-20 the sidecar is shared: whichever app needs it first starts it,
    /// with the right Revit metadata environment and no --parent-pid; the other app adopts
    /// it. Toggling this ribbon OFF only closes Revit's subscription and lease. The
    /// sidecar itself stays alive until the LAST connected app has gone.
    /// </summary>
    [Transaction(TransactionMode.Manual)]
    public class ToggleServerCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            bool isConnected = ParacoreApp.ServerRunning;

            if (!isConnected)
            {
                try
                {
                    // Clean up any lingering client from a previous, out-of-sync session.
                    if (ParacoreApp.Client != null)
                    {
                        ParacoreApp.Client.Stop();
                        ParacoreApp.SetClient(null);
                    }

                    // Adopt an existing sidecar, or start the single shared one if
                    // nothing answers. Revit must work with no desktop app running.
                    if (!ParacoreApp.EnsureSidecarAvailable())
                    {
                        TaskDialog.Show("Paracore Server - Not Available",
                            "Paracore.Server.exe could not be started at " + ParacoreApp.SidecarUrl + ".\n\n" +
                            "Check that Paracore.Server.exe is installed beside the add-in and that " +
                            "RevitAPI.dll is present in the Revit folder. See CoreScriptServerLog.txt.");
                        return Result.Failed;
                    }

                    ParacoreApp.ValidateAndForceLoadDependencies();

                    var logger = ParacoreApp.ServiceProvider.GetRequiredService<ILogger>();
                    var revitContext = ParacoreApp.ServiceProvider.GetRequiredService<RevitContext>();
                    revitContext.UIApplication = commandData.Application;

                    var context = new ServerContext(commandData.Application);
                    var actionHandler = new ServerActionHandler(ServerViewModel.Instance);
                    var codeExecutionEvent = ExternalEvent.Create(actionHandler);
                    ServerViewModel.Instance.Initialize(codeExecutionEvent);

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
                    SidecarLease.Start();
                }
                catch (Exception ex)
                {
                    SidecarLease.Stop();
                    TaskDialog.Show("Paracore Server - Error",
                        $"Failed to connect Revit to Paracore Server: {ex.Message}\n\nCheck CoreScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }
            else
            {
                try
                {
                    // Disconnect Revit only. The shared sidecar survives while the
                    // desktop app still holds a lease, and retires itself if this was
                    // the last user.
                    SidecarLease.Stop();
                    ParacoreApp.Client?.Stop();
                    ParacoreApp.SetClient(null);
                    ParacoreApp.SetServerRunning(false);
                    ServerViewModel.Instance.IsServerRunning = false;
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Paracore Server - Error",
                        $"Failed to disconnect Revit from Paracore Server: {ex.Message}\n\nCheck CoreScriptServerLog.txt for more details.");
                    return Result.Failed;
                }
            }

            ServerViewModel.Instance.IsServerRunning = ParacoreApp.ServerRunning;
            return Result.Succeeded;
        }
    }
}
