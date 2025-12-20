using System;
using System.IO;

namespace CoreScript.Engine.Logging
{
    public enum LogLevel
    {
        Debug,
        Info,
        Warning,
        Error,
        None // To disable all logging
    }

    public static class FileLogger
    {
        private static readonly string logFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "CodeRunnerDebug.txt");

        public static LogLevel CurrentLogLevel { get; set; } = LogLevel.Info; // Default to Info

        public static void Log(string message, LogLevel level = LogLevel.Info)
        {
            if (level < CurrentLogLevel)
            {
                return; // Don't log if message level is lower than current log level
            }

            try
            {
                File.AppendAllText(logFile, $"[{DateTime.Now}] [{level.ToString().ToUpper()}] {message}{Environment.NewLine}");
            }
            catch (Exception ex)
            {
                // Fails silently to avoid blocking Revit
            }
        }

        // Existing Log method, now calls the new overload
        public static void Log(string message)
        {
            Log(message, LogLevel.Info);
        }

        // Existing LogError method, now calls the new overload
        public static void LogError(string message)
        {
            Log("[ERROR] " + message, LogLevel.Error);
        }
    }
}
