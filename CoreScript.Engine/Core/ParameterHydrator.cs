using Autodesk.Revit.DB;
using CoreScript.Engine.Logging;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class ParameterHydrator : IParameterHydrator
    {
        private readonly IRevitObjectResolver _revitResolver;

        public ParameterHydrator(IRevitObjectResolver revitResolver)
        {
            _revitResolver = revitResolver;
        }

        public T Hydrate<T>(string key, object val)
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
                        var resolved = _revitResolver.ResolveElement(val, targetType);
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
                                var resolved = _revitResolver.ResolveElement(item, itemType);
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

            // Primitive conversions
            try
            {
                if (targetType.IsPrimitive || targetType == typeof(decimal))
                {
                    return (T)Convert.ChangeType(val, targetType, CultureInfo.InvariantCulture);
                }
            }
            catch (Exception ex)
            {
                 FileLogger.LogError($"[ParameterHydrator] Primitive conversion failed for '{key}' to {typeof(T).Name}: {ex.Message}");
            }

            // Fallback to JSON pivot
            try
            {
                var json = JsonSerializer.Serialize(val);
                var deserialized = JsonSerializer.Deserialize<T>(json);
                return deserialized;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ParameterHydrator] JSON pivot failed for '{key}' to {typeof(T).Name}: {ex.Message}");
                try { return (T)Convert.ChangeType(val, typeof(T), CultureInfo.InvariantCulture); }
                catch { return default(T); }
            }
        }
    }
}