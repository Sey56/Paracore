using System.Collections.Generic; // Added for List<string>
using System.Text.Json;

namespace RScript.Engine.Models
{
    public class ScriptParameter
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string DefaultValueJson { get; set; } // Changed from JsonElement DefaultValue
        public string Description { get; set; } // New property
        public List<string> Options { get; set; } = new List<string>(); // New property, initialized
        public JsonElement Value { get; set; } // Keep for internal use if needed, or remove if not
    }
}