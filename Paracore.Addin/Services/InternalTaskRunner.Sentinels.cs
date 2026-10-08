using CoreScript;

namespace Paracore.Addin.Services
{
    /// <summary>
    /// Paracore Pro half of <see cref="InternalTaskRunner"/>: the Sentinels (watchdog)
    /// RPC implementations.
    /// <para>
    /// This file ships in the Pro repo only. The shared InternalTaskRunner.cs declares the
    /// partial hooks and stays identical between the free and the Pro add-in; without this
    /// file the hooks are erased and those RPCs answer "requires Paracore Pro".
    /// </para>
    /// </summary>
    public partial class InternalTaskRunner
    {
        partial void FillWatchdogStatus(GetWatchdogStatusResponse response)
        {
            foreach (var w in CoreScript.Engine.Globals.WatchdogRegistry.GetActiveWatchdogs())
            {
                response.Watchdogs.Add(new WatchdogStatus
                {
                    ScriptPath = w.ScriptPath,
                    ScriptName = w.ScriptName,
                    Summary = w.LatestReport.Summary,
                    Status = w.LatestReport.Status,
                    DetailsJson = w.LatestReport.DetailsJson,
                    Timestamp = w.LatestReport.Timestamp.ToString("o"),
                    ParametersJson = System.Text.Json.JsonSerializer.Serialize(w.SnapshotParameters)
                });
            }

            foreach (var f in CoreScript.Engine.Globals.WatchdogRegistry.GetFailedWatchdogs())
            {
                response.FailedWatchdogs.Add(new FailedWatchdog
                {
                    ScriptPath = f.ScriptPath,
                    ScriptName = f.ScriptName,
                    ErrorMessage = f.ErrorMessage,
                    Timestamp = f.Timestamp.ToString("o")
                });
            }
        }

        partial void FillRegisterWatchdogSource(RegisterWatchdogSourceRequest request, RegisterWatchdogSourceResponse response)
        {
            // The handler's only awaits are `await Task.FromResult(...)`, so its task is
            // already complete when returned: this neither blocks nor hops threads. If a
            // real await is ever added to ScriptExecutionHandler.RegisterWatchdogSource,
            // this hook must become async instead.
            var result = _executionHandler.RegisterWatchdogSource(request).GetAwaiter().GetResult();
            response.IsSuccess = result.IsSuccess;
            response.ErrorMessage = result.ErrorMessage;
            response.WatchdogsRegistered = result.WatchdogsRegistered;
            response.LoadDetails.AddRange(result.LoadDetails);
        }

        partial void FillUnregisterWatchdogSource(UnregisterWatchdogSourceRequest request, UnregisterWatchdogSourceResponse response)
        {
            var result = _executionHandler.UnregisterWatchdogSource(request).GetAwaiter().GetResult();
            response.IsSuccess = result.IsSuccess;
            response.ErrorMessage = result.ErrorMessage;
            response.WatchdogsRemoved = result.WatchdogsRemoved;
        }
    }
}
