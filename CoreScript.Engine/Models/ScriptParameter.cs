using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CoreScript.Engine.Models
{
    public class ScriptParameter
    {
        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("defaultValueJson")]
        public string DefaultValueJson { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; }

        [JsonPropertyName("options")]
        public List<string> Options { get; set; } = new List<string>();

        [JsonPropertyName("multiSelect")]
        public bool MultiSelect { get; set; } = false;

        [JsonPropertyName("visibleWhen")]
        public string VisibleWhen { get; set; }

        [JsonPropertyName("value")]
        public JsonElement Value { get; set; }
        
        [JsonPropertyName("numericType")]
        public string NumericType { get; set; }

        [JsonPropertyName("min")]
        public double? Min { get; set; }

        [JsonPropertyName("max")]
        public double? Max { get; set; }

        [JsonPropertyName("step")]
        public double? Step { get; set; }
        
        [JsonPropertyName("isRevitElement")]
        public bool IsRevitElement { get; set; } = false;

        [JsonPropertyName("revitElementType")]
        public string RevitElementType { get; set; }

        [JsonPropertyName("revitElementCategory")]
        public string RevitElementCategory { get; set; }

        [JsonPropertyName("requiresCompute")]
        public bool RequiresCompute { get; set; } = false;

        [JsonPropertyName("group")]
        public string Group { get; set; }

        [JsonPropertyName("inputType")]
        public string InputType { get; set; }

        [JsonPropertyName("required")]
        public bool Required { get; set; } = false;

        [JsonPropertyName("suffix")]
        public string Suffix { get; set; }

        [JsonPropertyName("pattern")]
        public string Pattern { get; set; }

        [JsonPropertyName("enabledWhenParam")]
        public string EnabledWhenParam { get; set; }

        [JsonPropertyName("enabledWhenValue")]
        public string EnabledWhenValue { get; set; }

        [JsonPropertyName("unit")]
        public string Unit { get; set; }

        [JsonPropertyName("selectionType")]
        public string SelectionType { get; set; }
    }
}
