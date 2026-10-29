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
        /// The formatted value of a <see cref="Parameter"/> we ALREADY HOLD, with no name lookup.
        /// <para>⚠⚠ DO NOT "simplify" this back to <c>e.GetVal(p.Definition.Name)</c>. Measured
        /// 2026-10-28: that by-name read re-enters <c>GetStr</c>, whose existence guard asks
        /// <c>LookupParameter</c> — an API that can return <b>null for a parameter that is
        /// present in the element's own parameter set</b> (measured on a WallType: null, while
        /// the name was in <c>e.Parameters</c>). When it misses, the guard concludes the name is
        /// undeclared and prints <c>⚠ GetStr("Image"): no parameter of that name … check the
        /// spelling</c> — accusing the caller of a typo in a name it never typed, on the
        /// discovery call the instructions tell an agent to make FIRST.</para>
        /// <para>The row already has the Parameter object. Reading it cannot miss, and it is
        /// what <c>GetVal</c> does anyway (AsValueString → AsString), minus the resolution.</para>
        /// </summary>
        internal static string _valueOf(Parameter p, Element e = null)
        {
            if (p == null) return "-";
            var formatted = p.AsValueString();
            if (!string.IsNullOrEmpty(formatted)) return formatted;
            if (p.StorageType == StorageType.String)
            {
                var raw = p.AsString();
                if (!string.IsNullOrEmpty(raw)) return raw;
            }

            // ⚠⚠ SOME PARAMETERS REACH THE ELEMENT BUT STORE THEIR VALUE ON THE TYPE (2026-10-29).
            //   `Type Name` and `Family Name` are in the element's OWN `Parameters` set, yet
            //   `AsValueString()` and `AsString()` both return null for them — the value lives
            //   on the type. So `InstanceParams` / `CombinedParams` printed "-" while
            //   `e.GetStr("Type Name")` returned the real text, which the reviewer reported as
            //   "the instance-scope Type Name and Family Name rows show -".
            //   ⇒ Fall back to the name-resolving read, but ONLY when the direct read produced
            //     nothing AND the name is declared — so a genuinely empty parameter still
            //     reports "-" instead of being run through GetStr's spelling check.
            if (e != null && e.HasParam(p.Definition.Name))
            {
                var byName = e.GetStr(p.Definition.Name);
                if (!string.IsNullOrEmpty(byName)) return byName;
            }
            return "-";
        }

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
                    Value = _valueOf(p, e)
                })
                .OrderBy(x => x.Name));
        }

        /// <summary>
        /// True when this Parameter repeats a row already seen.
        /// <para>⚠⚠ ONE DEFINITION OF "DUPLICATE", SHARED. `InstanceParams` / `TypeParams` /
        /// `CombinedParams` and `Peek` all read the SAME <c>Element.Parameters</c> collection, so
        /// they must agree about what a duplicate is — otherwise a caller sees duplicates in one
        /// view and not the other and cannot tell which is right. That is exactly what happened:
        /// the first fix deduped `InstanceParams` only, so `CombinedParams` came back clean while
        /// `Peek` — which has its own loop — still listed `Category` and `Level` twice.</para>
        /// <para>Keyed on name + storage + VALUE, never on the name alone: two different
        /// parameters can share a display name, and collapsing those would turn a cosmetic
        /// duplicate into a missing parameter.</para>
        /// </summary>
        internal static bool _isDuplicateParameterRow(HashSet<string> seen, Parameter p, string value)
            => !seen.Add(p.Definition.Name + "\u0001" + p.StorageType + "\u0001" + value);

        /// <summary>
        /// Gets all instance parameters of the element (Name, Storage, Value).
        /// <para>⚠ <see cref="SchemaRows"/> — see the note on BuiltInParams.</para>
        /// </summary>
        public static SchemaRows InstanceParams(this Element e)
        {
            if (e == null) return new SchemaRows(null);

            // ⚠⚠ `e.Parameters` REALLY DOES CONTAIN DUPLICATES — this is Revit, not our loop.
            //   Measured 2026-10-29 (second release review, door 359614): "Category" appeared
            //   TWICE and "Level" twice, each pair with the same storage type AND the same value.
            //   Revit surfaces a parameter twice when it is reachable both on the element and
            //   through its type, and `Element.Parameters` does not de-duplicate. The reviewer
            //   read the symptom as "CombinedParams lists Category and Level twice".
            //
            //   ⚠ DEDUPE ON THE WHOLE ROW, NEVER ON THE NAME. Two different parameters can share
            //     a display name; collapsing on name alone would hide a real one and turn a
            //     cosmetic complaint into a missing-parameter bug — the failure this whole
            //     module exists to prevent.
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var rows = new List<(string Name, string Storage, string Value)>();
            foreach (Parameter p in e.Parameters)
            {
                var name = p.Definition.Name;
                var storage = p.StorageType.ToString();
                var value = _valueOf(p, e);
                if (_isDuplicateParameterRow(seen, p, value)) continue;
                rows.Add((name, storage, value));
            }

            return new SchemaRows(rows
                .OrderBy(r => r.Name)
                .Select(r => (object)new { r.Name, r.Storage, r.Value }));
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
                        dict[tp.Definition.Name] = _valueOf(tp);   // held Parameter, not a name lookup
                    }
                }
            }

            // 2. Add instance params
            foreach (Parameter p in e.Parameters)
            {
                if (p == null || !p.HasValue) continue;
                dict[p.Definition.Name] = _valueOf(p, e);             // ditto — see _valueOf
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
