using Autodesk.Revit.UI;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;
using Paracore.Addin.Services;
using System;

namespace Paracore.Addin.App
{
    /// <summary>
    /// The Sentinels (watchdog) half of <see cref="ParacoreApp"/>.
    /// <para>
    /// ⚠ <b>FREE (non-Pro) capability as of 2026-10-08</b> (user ruling). A watchdog is a script
    /// callback that Revit's Idle event runs in the background — generic background execution,
    /// not a domain feature — so the mechanism ships with EVERY tier. This file is therefore
    /// <b>SHARED</b>: it is byte-identical in the free and the Pro add-in.
    /// </para>
    /// <para>
    /// It implements two of the partial hooks declared in the shared <c>ParacoreApp.cs</c>:
    /// <c>RegisterBackgroundHooks</c> (which subscribes the Idle pump) and the pump itself,
    /// <c>OnIdling</c>. The other two hooks — <c>LoadProSettings</c> and
    /// <c>AddProRibbonButtons</c> — are still Pro and live in <c>ParacoreApp.Pro.cs</c>, which
    /// is excluded from the cross-repo sync.
    /// </para>
    /// </summary>
    public partial class ParacoreApp
    {
        partial void RegisterBackgroundHooks(UIControlledApplication app)
        {
            app.Idling += OnIdling;
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
    }
}
