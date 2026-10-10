using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Sentinels — background watchdogs. Part of the GENERIC engine (free).
    /// <para>
    /// The <c>Watchdog</c> half of <see cref="ScriptApi"/>, kept in its own partial file.
    /// ⚠ There is no free/Pro engine split any more (2026-10-09): the engine is ONE generic,
    /// always-free build, and this file is compiled into it unconditionally — the csproj has no
    /// Condition and no Compile Remove — so <c>Watchdog</c> and <c>WatchdogReport</c> exist
    /// everywhere the engine runs. Backed by <see cref="WatchdogRegistry"/>.
    /// </para>
    /// </summary>
    public static partial class ScriptApi
    {
        /// <summary>
        /// Registers a background watchdog that runs when Revit is idle.
        /// Useful for continuous model validation or background tasks.
        /// </summary>
        /// <param name="callback">The logic to run during Revit idle time.</param>
        /// <param name="intervalSeconds">Minimum seconds between executions. Default is 5s.</param>
        public static void Watchdog(Action<Document> callback, int intervalSeconds = 5)
        {
            // Allow Python backend to pass license tier through parameters during registration
            if (Parameters.TryGetValue("__license_tier__", out var tier) && tier is string tierStr)
            {
                LicenseContext.Tier = tierStr;
            }
            // Sentinels are a FREE capability (user ruling 2026-10-08) — no licence gate here.
            bool isRegistration = Parameters.TryGetValue("__is_watchdog_registration__", out var isReg) && isReg is bool b && b;

            if (isRegistration)
            {
                if (Parameters.TryGetValue("__absolute_path__", out var pathObj) && pathObj is string path)
                {
                    string scriptName = Parameters.TryGetValue("__script_name__", out var nameObj) ? nameObj.ToString()! : "Watcher";
                    WatchdogRegistry.Register(path, scriptName, callback, intervalSeconds, new Dictionary<string, object>(Parameters), new Dictionary<string, object>(ExecutionGlobals.Current.Value.RawParameters));
                }
                else
                {
                    Println("[WARNING] Watchdog registration failed: Script path not found in context.");
                }
            }
            else
            {
                // MANUAL TEST MODE: Just run the logic once so the user sees results in the Console/Table
                Println("[INFO] Running Watchdog logic in Manual Test mode (no background registration).");
                callback(Doc);
            }
        }

        /// <summary>
        /// Registers a background watchdog that runs when Revit is idle.
        /// Simplified overload that uses the global Doc context.
        /// </summary>
        /// <param name="callback">The logic to run during Revit idle time.</param>
        /// <param name="intervalSeconds">Minimum seconds between executions. Default is 5s.</param>
        public static void Watchdog(Action callback, int intervalSeconds = 5)
        {
            // Allow Python backend to pass license tier through parameters during registration
            if (Parameters.TryGetValue("__license_tier__", out var tier) && tier is string tierStr)
            {
                LicenseContext.Tier = tierStr;
            }
            // Sentinels are a FREE capability (user ruling 2026-10-08) — no licence gate here.
            bool isRegistration = Parameters.TryGetValue("__is_watchdog_registration__", out var isReg) && isReg is bool b && b;

            if (isRegistration)
            {
                if (Parameters.TryGetValue("__absolute_path__", out var pathObj) && pathObj is string path)
                {
                    string scriptName = Parameters.TryGetValue("__script_name__", out var nameObj) ? nameObj.ToString()! : "Watcher";
                    WatchdogRegistry.Register(path, scriptName, (doc) => callback(), intervalSeconds, new Dictionary<string, object>(Parameters), new Dictionary<string, object>(ExecutionGlobals.Current.Value.RawParameters));
                }
                else
                {
                    Println("[WARNING] Watchdog registration failed: Script path not found in context.");
                }
            }
            else
            {
                // MANUAL TEST MODE: Just run the logic once
                Println("[INFO] Running Watchdog logic in Manual Test mode (no background registration).");
                callback();
            }
        }

        /// <summary>
        /// Sends a status report for the current background watchdog.
        /// </summary>
        /// <param name="summary">Short text description (e.g. 'Found 5 errors')</param>
        /// <param name="status">'success', 'warning', or 'error'</param>
        /// <param name="data">Optional list of elements or objects for details</param>
        public static void WatchdogReport(string summary, string status = "success", object? data = null)
        {
            // Allow Python backend to pass license tier through parameters during registration
            if (Parameters.TryGetValue("__license_tier__", out var tier) && tier is string tierStr)
            {
                LicenseContext.Tier = tierStr;
            }
            // Sentinels are a FREE capability (user ruling 2026-10-08) — no licence gate here.
            string? path = null;

            // Priority 1: Current execution context (when running via UI)
            if (ExecutionGlobals.Current.Value != null && Parameters.TryGetValue("__absolute_path__", out var pathObj))
            {
                path = pathObj as string;
            }
            // Priority 2: Background loop context
            else
            {
                path = WatchdogRegistry.CurrentWatchdogPath;
            }

            if (!string.IsNullOrEmpty(path))
            {
                string json = data != null ? System.Text.Json.JsonSerializer.Serialize(data) : "[]";
                WatchdogRegistry.SetReport(path!, summary, status, json);
            }
        }
    }
}
