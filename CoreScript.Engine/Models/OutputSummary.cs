namespace CoreScript.Engine.Models
{
    public class OutputSummary
    {
        public string Type { get; set; } = "string"; // e.g., "string", "table", "console", "return_value"
        public string Message { get; set; } = string.Empty; // General summary message

        public TableSummary? Table { get; set; }
        public ConsoleSummary? Console { get; set; }
        public ReturnValueSummary? ReturnValueSummary { get; set; } // New property
    }

    public class TableSummary
    {
        public int RowCount { get; set; }
        public List<string> ColumnHeaders { get; set; } = new();
        public List<List<object>> TruncatedRows { get; set; } = new(); // First 5 rows
    }

    public class ConsoleSummary
    {
        public int LineCount { get; set; }
        public List<string> TruncatedLines { get; set; } = new(); // First 5 lines
    }

    public class ReturnValueSummary
    {
        public string Type { get; set; } = string.Empty;
        public string Value { get; set; } = string.Empty; // String representation of the return value
    }
}