using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Parameter discovery — BuiltInParams, InstanceParams, TypeParams,
    /// CombinedParams, ParamsDict, NativeProperties.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// Gets all BUILT-IN parameters of the element (Name, BIP, Value).
        /// </summary>
        public static IEnumerable<object> BuiltInParams(this Element e)
        {
            if (e == null) return new List<object>();

            return e.Parameters.Cast<Parameter>()
                .Where(p => p.Definition is InternalDefinition)
                .Select(p => new
                {
                    Name = p.Definition.Name,
                    BIP = ((InternalDefinition)p.Definition).BuiltInParameter.ToString(),
                    Value = e.GetVal(p.Definition.Name)
                })
                .OrderBy(x => x.Name);
        }

        /// <summary>
        /// Gets all instance parameters of the element (Name, Storage, Value).
        /// </summary>
        public static IEnumerable<object> InstanceParams(this Element e)
        {
            if (e == null) return new List<object>();

            return e.Parameters.Cast<Parameter>()
                .Select(p => new
                {
                    Name = p.Definition.Name,
                    Storage = p.StorageType.ToString(),
                    Value = e.GetVal(p.Definition.Name)
                })
                .OrderBy(x => x.Name);
        }

        /// <summary>
        /// Gets all parameters of the element's TYPE as a list of objects.
        /// </summary>
        public static IEnumerable<object> TypeParams(this Element e)
        {
            var typeId = e?.GetTypeId();
            if (typeId == null || typeId == ElementId.InvalidElementId)
                return new List<object>();

            var type = e.Document.GetElement(typeId);
            return type.InstanceParams();
        }

        /// <summary>
        /// Gets both instance and type parameters with Scope headers, plus Native Properties.
        /// </summary>
        public static IEnumerable<object> CombinedParams(this Element e)
        {
            if (e == null) return new List<object>();
            var inst = e.InstanceParams().Select(p => { dynamic dp = p; return (object)new { Scope = "Instance", Name = (string)dp.Name, Storage = (string)dp.Storage, Value = (string)dp.Value }; });
            var type = e.TypeParams().Select(p => { dynamic dp = p; return (object)new { Scope = "Type", Name = (string)dp.Name, Storage = (string)dp.Storage, Value = (string)dp.Value }; });
            var native = e.NativeProperties().Select(p => { dynamic dp = p; return (object)new { Scope = "Native", Name = (string)dp.Property, Storage = "Property", Value = (string)dp.Value }; });
            return native.Concat(inst).Concat(type);
        }

        /// <summary>
        /// Gets all parameters as a dictionary (Name → FormattedValue).
        /// </summary>
        public static Dictionary<string, string> ParamsDict(this Element e)
        {
            var dict = new Dictionary<string, string>();
            if (e == null) return dict;

            foreach (Parameter p in e.Parameters)
            {
                if (p == null || !p.HasValue) continue;
                dict[p.Definition.Name] = e.GetVal(p.Definition.Name);
            }

            return dict;
        }

        /// <summary>
        /// Gets a summary of the most important Revit API properties
        /// (Category, Level, Workset, etc.)
        /// </summary>
        public static IEnumerable<object> NativeProperties(this Element e)
        {
            if (e == null) return new List<object>();

            var props = new List<object>();
            void Add(string name, object val) => props.Add(new { Property = name, Value = val?.ToString() ?? "-" });

            Add("Name", e.Name);
            Add("Id", e.Id.Value);
            Add("Category", e.Category?.Name);
            Add("Class", e.GetType().Name);
            Add("Level", e.Document.GetElement(e.LevelId)?.Name);
            Add("Workset", e.Document.GetWorksetTable().GetWorkset(e.WorksetId)?.Name);
            Add("Design Option", e.DesignOption?.Name);
            Add("Is Editable", e.Document.IsWorkshared ? (object)WorksharingUtils.GetCheckoutStatus(e.Document, e.Id) : "N/A");
            Add("Owner", e.Document.IsWorkshared ? (object)WorksharingUtils.GetModelUpdatesStatus(e.Document, e.Id) : "N/A");
            Add("Group", e.GroupId != ElementId.InvalidElementId ? (object)e.Document.GetElement(e.GroupId)?.Name : null);
            Add("Pinned", e.Pinned);

            if (e.Location is LocationPoint lp) Add("Location", $"Point ({Math.Round(lp.Point.X, 2)}, {Math.Round(lp.Point.Y, 2)}, {Math.Round(lp.Point.Z, 2)})");
            else if (e.Location is LocationCurve lc) Add("Location", $"Curve (Length: {Math.Round(lc.Curve.Length, 2)})");

            return props;
        }
    }
}
