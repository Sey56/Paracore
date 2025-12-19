using System.Collections.Generic; // Added for List<string>
using System.Text.Json;

namespace CoreScript.Engine.Models
{
    public class ScriptParameter
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string DefaultValueJson { get; set; } // Changed from JsonElement DefaultValue
        public string Description { get; set; } // New property
        public List<string> Options { get; set; } = new List<string>(); // New property, initialized
        public bool MultiSelect { get; set; } = false; // New property for multi-select support
        public string VisibleWhen { get; set; } // Condition for visibility
        public JsonElement Value { get; set; } // Keep for internal use if needed, or remove if not
        
        // Enhanced Numeric Types
        public string NumericType { get; set; } // "int" or "double" - for proper UI rendering
        public double? Min { get; set; } // Minimum value for numeric parameters
        public double? Max { get; set; } // Maximum value for numeric parameters
        public double? Step { get; set; } // Step increment for sliders/spinners
        
        // Revit Element Selection
        public bool IsRevitElement { get; set; } = false; // True if this parameter represents a Revit element
        public string RevitElementType { get; set; } // "WallType", "Level", "FamilySymbol", etc.
        public string RevitElementCategory { get; set; } // Optional category filter (e.g., "Doors", "Windows")
        public bool RequiresCompute { get; set; } = false; // True if options need to be computed from Revit document
        public string Group { get; set; }

    }
}