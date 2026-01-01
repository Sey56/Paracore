using System;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Attribute to define parameter metadata for CoreScript inputs.
    /// Values are extracted by ParameterExtractor for UI generation.
    /// </summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property | AttributeTargets.Parameter)]
    public class ScriptParameterAttribute : Attribute
    {
        public ScriptParameterAttribute() { }
        
        // Constructor with optional parameters to support [ScriptParameter(Min: 0.1, Max: 10, ...)]
        public ScriptParameterAttribute(
            double Min = 0, 
            double Max = 0, 
            double Step = 0, 
            string Description = "", 
            string Options = "", 
            bool MultiSelect = false, 
            string VisibleWhen = "",
            string Group = "",
            bool Computable = false,
            bool Fetch = false, // Alias for Computable
            string InputType = "") 
        { 
        }
    }

    /// <summary>
    /// Attribute to mark a parameter as requiring Revit element selection or options compute.
    /// </summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property | AttributeTargets.Parameter)]
    public class RevitElementsAttribute : Attribute
    {
        public RevitElementsAttribute() { }
        
        // Constructor with optional parameters to support [RevitElements(Type: "Wall", Category: "Walls")]
        public RevitElementsAttribute(
            string Type = "", 
            string Category = "", 
            bool MultiSelect = false, 
            string Group = "", 
            string Description = "",
            bool Computable = false,
            bool Fetch = false) 
        { 
        }
    }
}
