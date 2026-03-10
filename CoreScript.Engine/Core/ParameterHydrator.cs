using Autodesk.Revit.DB;
using CoreScript.Engine.Logging;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using CoreScript.Engine.Globals;

namespace CoreScript.Engine.Core
{
    public class ParameterHydrator : IParameterHydrator
    {
        private readonly IRevitObjectResolver _revitResolver;

        public ParameterHydrator(IRevitObjectResolver revitResolver)
        {
            _revitResolver = revitResolver;
        }

        public T Hydrate<T>(string key, object val, IEnumerable<object>? candidatePool = null)
        {
            if (val == null) return default(T);

            if (val is T typedVal) return typedVal;

            var targetType = typeof(T);

            // Enum Hydration
            if (targetType.IsEnum)
            {
                if (Enum.TryParse(targetType, val.ToString(), true, out var enumResult))
                {
                    return (T)enumResult;
                }
            }

            // Revit Element Hydration
            bool isElement = typeof(Element).IsAssignableFrom(targetType);
            bool isElementList = targetType.IsGenericType && 
                               targetType.GetGenericTypeDefinition() == typeof(List<>) && 
                               typeof(Element).IsAssignableFrom(targetType.GetGenericArguments()[0]);

            if (isElement || isElementList)
            {
                try
                {
                    if (isElement)
                    {
                        var resolved = _revitResolver.ResolveElement(val, targetType, candidatePool);
                        if (resolved != null) return (T)resolved;
                    }
                    else // List<Element>
                    {
                        var itemType = targetType.GetGenericArguments()[0];
                        var resultList = (IList)Activator.CreateInstance(targetType);
                        
                        IEnumerable<object> sourceItems = null;
                        if (val is string json && json.TrimStart().StartsWith("["))
                            sourceItems = JsonSerializer.Deserialize<List<object>>(json);
                        else if (val is IEnumerable<object> ie)
                            sourceItems = ie;
                        
                        if (sourceItems != null)
                        {
                            foreach (var item in sourceItems)
                            {
                                var resolved = _revitResolver.ResolveElement(item, itemType, candidatePool);
                                if (resolved != null) resultList.Add(resolved);
                            }
                            return (T)resultList;
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[ParameterHydrator] Revit Hydration failed for '{key}' ({targetType.Name}): {ex.Message}");
                }
                
                return default(T);
            }

            // XYZ Hydration
            if (targetType == typeof(XYZ) && val is string xyzString)
            {
                var resolved = _revitResolver.ResolveXYZ(xyzString);
                if (resolved != null) return (T)resolved;
            }
            
            // Reference/Face/Edge Hydration
            if ((targetType == typeof(Reference) || typeof(GeometryObject).IsAssignableFrom(targetType)) && val is string refString)
            {
                var resolved = _revitResolver.ResolveReference(refString, targetType);
                if (resolved != null) return (T)resolved;
            }

            // Collection Hydration (Handles List<T> and T[])
            bool isList = targetType.IsGenericType && (targetType.GetGenericTypeDefinition() == typeof(List<>) || targetType.GetGenericTypeDefinition() == typeof(IEnumerable<>));
            bool isArray = targetType.IsArray;

            if (isList || isArray)
            {
                var itemType = isArray ? targetType.GetElementType() : targetType.GetGenericArguments()[0];
                if (itemType == null) return default(T);

                IEnumerable sourceItems = null;
                if (val is IEnumerable ie && !(val is string))
                {
                    sourceItems = ie;
                }
                else if (val is string jsonStr && jsonStr.TrimStart().StartsWith("["))
                {
                    try { sourceItems = JsonSerializer.Deserialize<List<object>>(jsonStr); } catch { }
                }

                if (sourceItems != null)
                {
                    var tempList = new List<object>();
                    foreach (var item in sourceItems)
                    {
                        try
                        {
                            // Recursively hydrate each item using its specific type
                            // NOTE: We don't necessarily pass candidatePool to recursive items unless the elements themselves are nested,
                            // but for Revit selections, usually the pool is for the elements being selected.
                            var method = this.GetType().GetMethod("Hydrate").MakeGenericMethod(itemType);
                            // Corrected to pass candidatePool as well to support nested element resolution if ever needed
                            var hydrated = method.Invoke(this, new object[] { $"{key}_item", item, candidatePool });
                            if (hydrated != null) tempList.Add(hydrated);
                        }
                        catch
                        {
                            try { tempList.Add(Convert.ChangeType(item, itemType, CultureInfo.InvariantCulture)); } catch { }
                        }
                    }

                    if (isArray)
                    {
                        var array = Array.CreateInstance(itemType, tempList.Count);
                        for (int i = 0; i < tempList.Count; i++) array.SetValue(tempList[i], i);
                        return (T)(object)array;
                    }
                    else // List<T>
                    {
                        var listType = typeof(List<>).MakeGenericType(itemType);
                        var resultList = (IList)Activator.CreateInstance(listType);
                        foreach (var item in tempList) resultList.Add(item);
                        return (T)resultList;
                    }
                }
            }

            // Primitive conversions
            try
            {
                if (targetType.IsPrimitive || targetType == typeof(decimal))
                {
                    return (T)Convert.ChangeType(val, targetType, CultureInfo.InvariantCulture);
                }
                if (targetType == typeof(string))
                {
                    return (T)(object)val?.ToString();
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ParameterHydrator] Primitive conversion failed for '{key}' to {targetType.Name}: {ex.Message}");
            }

            // Fallback to JSON pivot
            try
            {
                string json;
                if (val is JsonElement je) json = je.GetRawText();
                else json = JsonSerializer.Serialize(val);

                return JsonSerializer.Deserialize<T>(json, ExecutionGlobals.SerializerOptions);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ParameterHydrator] JSON pivot failed for '{key}' to {targetType.Name}: {ex.Message}");
                try { return (T)Convert.ChangeType(val, targetType, CultureInfo.InvariantCulture); }
                catch { return default(T); }
            }
        }
    }
}