using System;

namespace CoreScript.Engine.Globals
{
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
        
        // Constructor signatures for convenience
        public RevitElementsAttribute() { }
        public RevitElementsAttribute(string TargetType = null) { this.TargetType = TargetType; }
    }

    // Standard Validation Attributes for V3 Professional Syntax
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
}
