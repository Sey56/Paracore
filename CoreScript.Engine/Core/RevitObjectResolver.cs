using Autodesk.Revit.DB;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public class RevitObjectResolver : IRevitObjectResolver
    {
        private readonly Document _doc;

        public RevitObjectResolver(Document doc)
        {
            _doc = doc;
        }

        public object ResolveXYZ(string xyzString)
        {
            if (string.IsNullOrEmpty(xyzString)) return null;
            try
            {
                var parts = xyzString.Split(',');
                if (parts.Length == 3)
                {
                    double x = double.Parse(parts[0], CultureInfo.InvariantCulture);
                    double y = double.Parse(parts[1], CultureInfo.InvariantCulture);
                    double z = double.Parse(parts[2], CultureInfo.InvariantCulture);
                    return new XYZ(x, y, z);
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[RevitObjectResolver] Failed to parse XYZ from '{xyzString}': {ex.Message}");
            }
            return null;
        }

        public object ResolveReference(string refString, Type targetType)
        {
            if (string.IsNullOrEmpty(refString)) return null;
            try
            {
                var refObj = Reference.ParseFromStableRepresentation(_doc, refString);
                if (refObj != null)
                {
                    if (targetType == typeof(Reference)) return refObj;

                    if (typeof(GeometryObject).IsAssignableFrom(targetType))
                    {
                        var el = _doc.GetElement(refObj);
                        var geom = el?.GetGeometryObjectFromReference(refObj);
                        if (geom != null && targetType.IsAssignableFrom(geom.GetType()))
                            return geom;
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[RevitObjectResolver] Failed to parse {targetType.Name} from StableRef: {ex.Message}");
            }
            return null;
        }

        public object ResolveElement(object val, Type targetType)
        {
            if (_doc == null || val == null) return null;

            if (val is Reference reference)
            {
                var el = _doc.GetElement(reference);
                if (el != null && targetType.IsAssignableFrom(el.GetType())) return el;
            }

            string identifier = val.ToString();
            if (string.IsNullOrEmpty(identifier)) return null;

            // 1. UniqueId
            try {
                var el = _doc.GetElement(identifier);
                if (el != null && targetType.IsAssignableFrom(el.GetType())) return el;
            } catch {}

            // 2. ElementId
            if (long.TryParse(identifier, out long idLong))
            {
                try {
                    var elId = _doc.GetElement(new ElementId(idLong));
                    if (elId != null && targetType.IsAssignableFrom(elId.GetType())) return elId;
                } catch {}
            }

            // 3. Identity (Name or custom identity)
            if (targetType.IsClass)
            {
                try 
                {
                    bool isTypeRequested = targetType.Name.EndsWith("Type", StringComparison.OrdinalIgnoreCase);
                    var collector = ParameterOptionsComputer.CreateResilientCollector(_doc, targetType);
                    var candidates = collector.WhereElementIsNotElementType().Cast<Element>();
                    if (isTypeRequested || typeof(ElementType).IsAssignableFrom(targetType))
                    {
                        candidates = new FilteredElementCollector(_doc).OfClass(targetType).WhereElementIsElementType().Cast<Element>();
                    }
                    
                    foreach (var e in candidates)
                    {
                        string elementIdentity = ParameterOptionsComputer.GetElementIdentity(e);
                        if (e.Name == identifier || elementIdentity == identifier)
                        {
                            return e;
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[RevitObjectResolver] Identity search error for {targetType.Name}: {ex.Message}");
                }
            }
            
            return null;
        }
    }
}
