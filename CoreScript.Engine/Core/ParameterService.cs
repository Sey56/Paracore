using Autodesk.Revit.DB;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class ParameterService : IParameterService
    {
        public Dictionary<string, object> MapParameters(string json, out List<ScriptParameter> richParameters)
        {
            var dict = new Dictionary<string, object>();
            richParameters = new List<ScriptParameter>();
            if (string.IsNullOrWhiteSpace(json)) return dict;
            
            try
            {
                using (JsonDocument doc = JsonDocument.Parse(json))
                {
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        richParameters = JsonSerializer.Deserialize<List<ScriptParameter>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? richParameters;
                        foreach (var p in richParameters) 
                        {
                            if (!string.IsNullOrEmpty(p.Name)) 
                            {
                                dict[p.Name] = ConvertJsonElement(p.Value);
                            }
                        }
                    }
                    else
                    {
                        var raw = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
                        foreach (var kv in raw) 
                        {
                            if (!string.IsNullOrEmpty(kv.Key)) 
                            {
                                dict[kv.Key] = kv.Value is JsonElement e ? ConvertJsonElement(e) : kv.Value;
                            }
                        }
                    }
                }
                FileLogger.Log($"[ParameterService] Successfully mapped {dict.Count} parameters from JSON.");
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ParameterService] Failed to map parameters: {ex.Message}");
            }
            return dict;
        }

        public void HardenParameters(Dictionary<string, object> parameters, List<ScriptParameter> scriptParams)
        {
            if (scriptParams == null) return;
            foreach (var p in scriptParams)
            {
                if (!parameters.ContainsKey(p.Name) || parameters[p.Name] == null || (parameters[p.Name] is string s && string.IsNullOrEmpty(s)))
                {
                    if (!string.IsNullOrEmpty(p.DefaultValueJson))
                    {
                        try {
                            if (p.Type == "number") parameters[p.Name] = double.Parse(p.DefaultValueJson);
                            else if (p.Type == "boolean") parameters[p.Name] = p.DefaultValueJson.ToLower() == "true";
                            else parameters[p.Name] = p.DefaultValueJson.Trim('"');
                            FileLogger.Log($"[ParameterService] Applied default value for '{p.Name}': {parameters[p.Name]}");
                        } catch {}
                    }
                }

                // Apply Unit Conversion
                if (parameters.TryGetValue(p.Name, out var val) && val != null && !string.IsNullOrEmpty(p.Unit))
                {
                    try {
                        double d = Convert.ToDouble(val);
                        ForgeTypeId unitTypeId = null;
                        
                        string u = p.Unit.ToLower().Trim();
                        if (u == "mm") unitTypeId = UnitTypeId.Millimeters;
                        else if (u == "cm") unitTypeId = UnitTypeId.Centimeters;
                        else if (u == "m") unitTypeId = UnitTypeId.Meters;
                        else if (u == "ft") unitTypeId = UnitTypeId.Feet;
                        else if (u == "in" || u == "inch") unitTypeId = UnitTypeId.Inches;
                        else if (u == "m2" || u == "sqm") unitTypeId = UnitTypeId.SquareMeters;
                        else if (u == "ft2" || u == "sqft") unitTypeId = UnitTypeId.SquareFeet;
                        else if (u == "m3" || u == "cum") unitTypeId = UnitTypeId.CubicMeters;
                        else if (u == "ft3" || u == "cuft") unitTypeId = UnitTypeId.CubicFeet;

                        if (unitTypeId != null)
                        {
                            parameters[p.Name] = UnitUtils.ConvertToInternalUnits(d, unitTypeId);
                            FileLogger.Log($"[ParameterService] Converted parameter '{p.Name}' from {d} {u} to Internal Units.");
                        }
                    } catch {}
                }
            }
        }

        private object ConvertJsonElement(JsonElement element)
        {
            switch (element.ValueKind) {
                case JsonValueKind.String: return element.GetString();
                case JsonValueKind.Number: return element.TryGetInt32(out int i) ? i : element.GetDouble();
                case JsonValueKind.True: return true;
                case JsonValueKind.False: return false;
                case JsonValueKind.Array: return element.EnumerateArray().Select(ConvertJsonElement).ToList();
                case JsonValueKind.Null:
                case JsonValueKind.Undefined: return null;
                default: return element.GetRawText();
            }
        }
    }
}
