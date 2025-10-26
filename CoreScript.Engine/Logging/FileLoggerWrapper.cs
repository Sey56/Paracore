using System.IO;

namespace CoreScript.Engine.Logging
{
    public class FileLoggerWrapper : ILogger
    {
        public void Log(string message, LogLevel level)
        {
            FileLogger.Log(message, level);
        }

        public void LogError(string message)
        {
            FileLogger.LogError(message);
        }
    }
}
