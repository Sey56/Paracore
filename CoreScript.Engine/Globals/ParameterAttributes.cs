using System;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Attribute to define parameter metadata for CoreScript inputs.
    /// Values are extracted by ParameterExtractor for UI generation.
    /// </summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property | AttributeTargets.Parameter)]
    public class ParameterAttribute : Attribute
    {
        public ParameterAttribute() { }
        
        // Constructor with optional parameters to support [Parameter(Min: 0.1, Max: 10, ...)]
        public ParameterAttribute(
            double Min = 0, 
            double Max = 0, 
            double Step = 0, 
            string Description = "", 
            string Options = "", 
            bool MultiSelect = false, 
            string VisibleWhen = "") 
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
        public RevitElementsAttribute(string Type = "", string Category = "") 
        { 
        }
    }
}
