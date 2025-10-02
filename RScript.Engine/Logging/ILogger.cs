namespace RScript.Engine.Logging
{
    public interface ILogger
    {
        void Log(string message, LogLevel level);
        void LogError(string message);
    }
}