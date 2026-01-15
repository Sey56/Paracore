using System;

namespace CoreScript.Engine.Globals
{
    public enum SelectionType
    {
        None = 0,
        Element = 1,
        Point = 2,
        Face = 3,
        Edge = 4
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, Inherited = false, AllowMultiple = false)]
    public class ScriptParameterAttribute : Attribute
    {
        public bool MultiSelect { get; set; } = false;
        public string Options { get; set; }
        public string VisibleWhen { get; set; }
        public string Group { get; set; }
        public string Description { get; set; } // Deprecated in V3 if XML comments are used, but kept for back-compat
        public double Min { get; set; } 
        public double Max { get; set; }
        public double Step { get; set; }
        public string Suffix { get; set; }
        public string InputType { get; set; } // e.g., "File", "SaveFile", "Folder"
        public bool Compute { get; set; } = false;
        public bool Computable { get; set; } = false; // V3 Alias
        public SelectionType Select { get; set; } = SelectionType.None; // New Selection Mode

        // Validation helpers for attribute parsing
        public ScriptParameterAttribute() { }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, Inherited = false, AllowMultiple = false)]
    public class RevitElementsAttribute : Attribute
    {
        public string TargetType { get; set; } // Target element type name (e.g. "WallType")
        public string Group { get; set; }
        public string Category { get; set; } // Filter by category (e.g., "Doors")
        public bool MultiSelect { get; set; } = false;
        public string Options { get; set; }
        public string VisibleWhen { get; set; }
        public bool Compute { get; set; } = false;
        public bool Computable { get; set; } = false;
        public string Description { get; set; }
        public SelectionType Select { get; set; } = SelectionType.None; // Allow selection override here too
        
        // Constructor signatures for convenience
        public RevitElementsAttribute() { }
        public RevitElementsAttribute(string TargetType = null) { this.TargetType = TargetType; }
    }

    // Standard Validation Attributes for V3 Professional Syntax
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class SelectAttribute : Attribute 
    {
        public SelectionType Type { get; }
        public SelectAttribute(SelectionType type = SelectionType.Element) 
        { 
            Type = type; 
        }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class RequiredAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class MinAttribute : Attribute { 
        public double Value { get; }
        public MinAttribute(double value) { Value = value; }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class MaxAttribute : Attribute { 
        public double Value { get; }
        public MaxAttribute(double value) { Value = value; }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class RangeAttribute : Attribute 
    {
        public double Min { get; }
        public double Max { get; }
        public double Step { get; }
        public RangeAttribute(double min, double max, double step = 1.0) 
        { 
            Min = min; 
            Max = max; 
            Step = step; 
        }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class UnitAttribute : Attribute
    {
        public string Unit { get; }
        public UnitAttribute(string unit) { Unit = unit; }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class PatternAttribute : Attribute {
        public string Regex { get; }
        public PatternAttribute(string regex) { Regex = regex; }
    }
    
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class SuffixAttribute : Attribute {
        public string Value { get; }
        public SuffixAttribute(string value) { Value = value; }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class EnabledWhenAttribute : Attribute {
        public string ParameterName { get; }
        public object Value { get; }
        public EnabledWhenAttribute(string parameterName, object value) {
            ParameterName = parameterName;
            Value = value;
        }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class DescriptionAttribute : Attribute
    {
        public string Value { get; }
        public DescriptionAttribute(string value) { Value = value; }
    }

    // --- File System Attributes (Unified V3) ---
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class InputFileAttribute : Attribute { 
        public string Filter { get; set; } // Optional: e.g. "csv,txt"
        public InputFileAttribute(string filter = null) { Filter = filter; }
    }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class InputFolderAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class SaveFileAttribute : Attribute { 
        public string Filter { get; set; }
        public SaveFileAttribute(string filter = null) { Filter = filter; }
    }
}
