using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Globals
{
    public class WatchdogReport
    {
        public string Summary { get; set; } = "Healthy";
        public string DetailsJson { get; set; } = "[]";
        public string Status { get; set; } = "success"; // success, warning, error
        public DateTime Timestamp { get; set; }
    }

    public class WatchdogCallback
    {
        public string ScriptPath { get; set; } = string.Empty;
        public string ScriptName { get; set; } = string.Empty;
        public Action<Document> Action { get; set; } = null!;
        public DateTime LastRun { get; set; } = DateTime.MinValue;
        public int IntervalSeconds { get; set; } = 5;
        public WatchdogReport LatestReport { get; set; } = new WatchdogReport();
    }

    public static class WatchdogRegistry
    {
        private static readonly Dictionary<string, WatchdogCallback> _callbacks = new Dictionary<string, WatchdogCallback>();
        private static readonly object _lock = new object();

        [ThreadStatic]
        public static string? CurrentWatchdogPath;

        public static void Register(string scriptPath, string scriptName, Action<Document> action, int intervalSeconds = 5)
        {
            lock (_lock)
            {
                _callbacks[scriptPath] = new WatchdogCallback
                {
                    ScriptPath = scriptPath,
                    ScriptName = scriptName,
                    Action = action,
                    IntervalSeconds = intervalSeconds,
                    LastRun = DateTime.MinValue
                };
                FileLogger.Log($"[WatchdogRegistry] Registered: {scriptName} ({intervalSeconds}s)");
            }
        }

        public static void SetReport(string scriptPath, string summary, string status, string detailsJson)
        {
            lock (_lock)
            {
                if (_callbacks.TryGetValue(scriptPath, out var cb))
                {
                    cb.LatestReport = new WatchdogReport
                    {
                        Summary = summary,
                        Status = status,
                        DetailsJson = detailsJson,
                        Timestamp = DateTime.Now
                    };
                }
            }
        }

        public static void Unregister(string scriptPath)
        {
            lock (_lock)
            {
                _callbacks.Remove(scriptPath);
            }
        }

        public static int UnregisterAllFromPath(string pathPrefix)
        {
            int count = 0;
            lock (_lock)
            {
                var keysToRemove = new List<string>();
                foreach (var key in _callbacks.Keys)
                {
                    // Case-insensitive check for path prefix
                    if (key.StartsWith(pathPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        keysToRemove.Add(key);
                    }
                }

                foreach (var key in keysToRemove)
                {
                    _callbacks.Remove(key);
                    count++;
                }
            }
            if (count > 0)
            {
                FileLogger.Log($"[WatchdogRegistry] Unregistered {count} watchdogs from source: {pathPrefix}");
            }
            return count;
        }

        public static List<WatchdogCallback> GetActiveWatchdogs()
        {
            lock (_lock)
            {
                return new List<WatchdogCallback>(_callbacks.Values);
            }
        }

        public static List<WatchdogCallback> GetPendingCallbacks()
        {
            var pending = new List<WatchdogCallback>();
            var now = DateTime.Now;

            lock (_lock)
            {
                foreach (var callback in _callbacks.Values)
                {
                    if ((now - callback.LastRun).TotalSeconds >= callback.IntervalSeconds)
                    {
                        pending.Add(callback);
                    }
                }
            }
            return pending;
        }
    }
}
