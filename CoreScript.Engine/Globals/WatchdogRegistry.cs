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

    public class FailedWatchdogInfo
    {
        public string ScriptPath { get; set; } = string.Empty;
        public string ScriptName { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }

    public class WatchdogCallback
    {
        public string ScriptPath { get; set; } = string.Empty;
        public string ScriptName { get; set; } = string.Empty;
        public Action<Document> Action { get; set; } = null!;
        public DateTime LastRun { get; set; } = DateTime.MinValue;
        public int IntervalSeconds { get; set; } = 5;
        public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();
        public Dictionary<string, object> SnapshotParameters { get; set; } = new Dictionary<string, object>();
        public WatchdogReport LatestReport { get; set; } = new WatchdogReport();
    }

    public static class WatchdogRegistry
    {
        private static readonly Dictionary<string, WatchdogCallback> _callbacks = new Dictionary<string, WatchdogCallback>();
        private static readonly Dictionary<string, FailedWatchdogInfo> _failedRegistrations = new Dictionary<string, FailedWatchdogInfo>();
        private static readonly object _lock = new object();

        [ThreadStatic]
        public static string? CurrentWatchdogPath;

        public static void Register(string scriptPath, string scriptName, Action<Document> action, int intervalSeconds = 5, Dictionary<string, object>? parameters = null, Dictionary<string, object>? snapshotParameters = null)
        {
            lock (_lock)
            {
                if (_failedRegistrations.ContainsKey(scriptPath))
                {
                    _failedRegistrations.Remove(scriptPath);
                }

                _callbacks[scriptPath] = new WatchdogCallback
                {
                    ScriptPath = scriptPath,
                    ScriptName = scriptName,
                    Action = action,
                    IntervalSeconds = intervalSeconds,
                    Parameters = parameters ?? new Dictionary<string, object>(),
                    SnapshotParameters = snapshotParameters ?? parameters ?? new Dictionary<string, object>(),
                    LastRun = DateTime.MinValue
                };
                FileLogger.Log($"[WatchdogRegistry] Registered: {scriptName} ({intervalSeconds}s)");
            }
        }

        public static void RegisterFailure(string scriptPath, string scriptName, string errorMessage)
        {
            lock (_lock)
            {
                if (_callbacks.ContainsKey(scriptPath))
                {
                    _callbacks.Remove(scriptPath);
                }

                _failedRegistrations[scriptPath] = new FailedWatchdogInfo
                {
                    ScriptPath = scriptPath,
                    ScriptName = scriptName,
                    ErrorMessage = errorMessage,
                    Timestamp = DateTime.Now
                };
                FileLogger.Log($"[WatchdogRegistry] Registered Failure: {scriptName} - {errorMessage}");
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
                if (_failedRegistrations.ContainsKey(scriptPath))
                {
                    _failedRegistrations.Remove(scriptPath);
                }
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
                    if (_failedRegistrations.ContainsKey(key)) _failedRegistrations.Remove(key);
                    count++;
                }
                
                // Also remove failed keys directly if they weren't in callbacks but match prefix
                var failedKeysToRemove = new List<string>();
                foreach (var key in _failedRegistrations.Keys)
                {
                    if (key.StartsWith(pathPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        failedKeysToRemove.Add(key);
                    }
                }
                foreach(var key in failedKeysToRemove)
                {
                     if (!_callbacks.ContainsKey(key)) count++; // Count unique removals
                     _failedRegistrations.Remove(key);
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

        public static List<FailedWatchdogInfo> GetFailedWatchdogs()
        {
            lock (_lock)
            {
                return new List<FailedWatchdogInfo>(_failedRegistrations.Values);
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
