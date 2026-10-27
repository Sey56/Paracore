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
        /// <para>⚠ Returns <see cref="SchemaRows"/> so <c>.Table()</c> knows not to cap it — see
        /// that type for why a schema table must never be truncated.</para>
        /// </summary>
        public static SchemaRows BuiltInParams(this Element e)
        {
            if (e == null) return new SchemaRows(null);

            return new SchemaRows(e.Parameters.Cast<Parameter>()
                .Where(p => p.Definition is InternalDefinition)
                .Select(p => new
                {
                    Name = p.Definition.Name,
                    BIP = ((InternalDefinition)p.Definition).BuiltInParameter.ToString(),
                    Value = e.GetVal(p.Definition.Name)
                })
                .OrderBy(x => x.Name));
        }

        /// <summary>
        /// Gets all instance parameters of the element (Name, Storage, Value).
        /// <para>⚠ <see cref="SchemaRows"/> — see the note on BuiltInParams.</para>
        /// </summary>
        public static SchemaRows InstanceParams(this Element e)
        {
            if (e == null) return new SchemaRows(null);

            return new SchemaRows(e.Parameters.Cast<Parameter>()
                .Select(p => new
                {
                    Name = p.Definition.Name,
                    Storage = p.StorageType.ToString(),
                    Value = e.GetVal(p.Definition.Name)
                })
                .OrderBy(x => x.Name));
        }

        /// <summary>
        /// Gets all parameters of the element's TYPE as a list of objects.
        /// <para>⚠ <see cref="SchemaRows"/> — see the note on BuiltInParams.</para>
        /// </summary>
        public static SchemaRows TypeParams(this Element e)
        {
            // ⚠⚠ ASK GetElementType(), NEVER GetTypeId(). A type IS its own type, and
            //   GetTypeId() returns -1 for an ElementType — so TypeParams() on a type returned
            //   0 rows while InstanceParams() on the SAME object returned all 34 of them. A
            //   zero here reads as "this type has no parameters", which is never true.
            var type = e?.GetElementType();
            if (type == null)
                return new SchemaRows(null);

            return type.InstanceParams();
        }

        /// <summary>
        /// Gets both instance and type parameters with Scope headers, plus Native Properties.
        /// <para>⚠ <see cref="SchemaRows"/> — see the note on BuiltInParams.</para>
        /// </summary>
        public static SchemaRows CombinedParams(this Element e)
        {
            if (e == null) return new SchemaRows(null);
            var inst = e.InstanceParams().Select(p => { dynamic dp = p; return (object)new { Scope = "Instance", Name = (string)dp.Name, Storage = (string)dp.Storage, Value = (string)dp.Value }; });
            var type = e.TypeParams().Select(p => { dynamic dp = p; return (object)new { Scope = "Type", Name = (string)dp.Name, Storage = (string)dp.Storage, Value = (string)dp.Value }; });
            var native = e.NativeProperties().Select(p => { dynamic dp = p; return (object)new { Scope = "Native", Name = (string)dp.Property, Storage = "Property", Value = (string)dp.Value }; });
            return new SchemaRows(native.Concat(inst).Concat(type));
        }

        /// <summary>
        /// Gets all parameters (instance + type) as a dictionary (Name → FormattedValue).
        /// </summary>
        public static Dictionary<string, string> ParamsDict(this Element e)
        {
            var dict = new Dictionary<string, string>();
            if (e == null) return dict;

            // 1. Add type params first so instance params take precedence if names collide
            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                if (type != null)
                {
                    foreach (Parameter tp in type.Parameters)
                    {
                        if (tp == null || !tp.HasValue) continue;
                        dict[tp.Definition.Name] = type.GetVal(tp.Definition.Name);
                    }
                }
            }

            // 2. Add instance params
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
        /// <para>⚠ <see cref="SchemaRows"/> — see the note on BuiltInParams. These rows are
        /// descriptive, not quantities, so a truncated list would hide properties rather than
        /// shorten a report.</para>
        /// </summary>
        public static SchemaRows NativeProperties(this Element e)
        {
            if (e == null) return new SchemaRows(null);

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
            else if (e.Location is LocationCurve lc)
            {
                // ⚠⚠ A BARE NUMBER IS NOT A MEASUREMENT (fixed 2026-10-27, review round 6).
                //   This row printed `Curve (Length: 16.62)` — internal FEET, no unit — sitting
                //   in the same table as parameter rows that FormatParamValue renders in the
                //   PROJECT's units. A reader sees 16.62 next to "5065 mm" and has no way to
                //   know they are the same wall. Format through the document's units; if that
                //   throws, label the fallback "ft" rather than dropping the unit again.
                string length;
                try
                {
                    length = UnitFormatUtils.Format(e.Document.GetUnits(), SpecTypeId.Length, lc.Curve.Length, false);
                }
                catch
                {
                    length = Math.Round(lc.Curve.Length, 2) + " ft";
                }
                Add("Location", $"Curve (Length: {length})");
            }

            return new SchemaRows(props);
        }
    }
}
