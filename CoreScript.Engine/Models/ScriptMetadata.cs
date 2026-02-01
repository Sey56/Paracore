using System.Collections.Generic;

namespace CoreScript.Engine.Models
{
    public class ScriptMetadata
    {
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Author { get; set; } = "";
        public string Website { get; set; } = "";
        public string Version { get; set; } = "";
        public List<string> Tags { get; set; } = new List<string>();
        public List<string> Categories { get; set; } = new List<string>();
        public string LastRun { get; set; } = "";
        public bool IsDefault { get; set; } = false;
        public List<string> Dependencies { get; set; } = new List<string>();
        public string History { get; set; } = "";
        public string? DocumentType { get; set; } = null;
        public List<string> UsageExamples { get; set; } = new List<string>();
        public bool IsProtected { get; set; } = false;
        public bool IsCompiled { get; set; } = false;
    }
}
