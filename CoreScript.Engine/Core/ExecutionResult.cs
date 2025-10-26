namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Standard return type for all script execution responses.
    /// Includes status, output, diagnostics, and metadata.
    /// </summary>
    public class ExecutionResult
    {
        public bool IsSuccess { get; set; }
        public string ResultMessage { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public string[] ErrorDetails { get; set; } = Array.Empty<string>();
        public object? ReturnValue { get; set; }
        public string ScriptName { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.Now;

        // ✅ Added: log buffer for Print(...) output
        public List<string> PrintLog { get; set; } = new();

        /// <summary>
        /// Factory for failed execution result.
        /// </summary>
        public static ExecutionResult Failure(string message, params string[] details) => new()
        {
            IsSuccess = false,
            ErrorMessage = message,
            ErrorDetails = details
        };

        /// <summary>
        /// Factory for success.
        /// </summary>
        public static ExecutionResult Success(string result, object? returnVal = null) => new()
        {
            IsSuccess = true,
            ResultMessage = result,
            ReturnValue = returnVal
        };
    }
}