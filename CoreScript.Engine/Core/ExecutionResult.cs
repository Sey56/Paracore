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
        public List<string> StructuredOutput { get; set; } = new();

        // ✅ Added: log buffer for Print(...) output
        public List<string> PrintLog { get; set; } = new();

        public OutputSummaryData? OutputSummary { get; set; }

        #region Agent Summary Classes
        /// <summary>
        /// Represents a structured, summarized version of the script's output for agent consumption.
        /// Mirrors the gRPC message contract.
        /// </summary>
        public class OutputSummaryData
        {
            public string Type { get; set; } = "none"; // "table", "console"
            public string Message { get; set; } = string.Empty;
            public TableSummary? Table { get; set; }
            public ConsoleSummary? Console { get; set; }
        }

        public class TableSummary
        {
            public int RowCount { get; set; }
            // Headers are not available at this stage, skip for now.
            // public List<string> ColumnHeaders { get; set; } = new();
            public List<string> TruncatedRowsJson { get; set; } = new();
        }

        public class ConsoleSummary
        {
            public int LineCount { get; set; }
            public List<string> TruncatedLines { get; set; } = new();
        }
        #endregion

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