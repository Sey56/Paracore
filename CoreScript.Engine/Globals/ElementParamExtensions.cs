using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Parameter getters — GetStr, GetNum, GetInt, GetVal, and type-level variants.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// Gets the parameter value as a string.
        /// Smart: Resolves ElementId names, handles Strings, falls back to C# Properties (Reflection),
        /// and finally formatted ValueStrings.
        /// </summary>
        public static string GetStr(this Element e, string name)
        {
            // ⚠ Guarded: step 5 below re-enters this method on the element's TYPE. That hop is gated
            //   (the type must actually declare the parameter) and terminates today, but it is a
            //   self-call — exactly the shape that overflowed the stack in GetVal. The guard costs a
            //   stack-pointer comparison and makes the family safe by construction rather than by
            //   the gate staying correct.
            using var _guard = Runtime.ScriptGuard.Enter("GetStr");

            if (e == null || string.IsNullOrEmpty(name)) return "";

            // 0. "Level" → category-specific lookup BEFORE parameter search.
            // Different Revit categories use different parameter names for
            // their level. Resolve the real parameter name first, then
            // delegate to the standard lookup chain.
            if (name.Equals("Level", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var alt in new[] { "Reference Level", "Base Level", "Base Constraint" })
                {
                    var lvlP = e.LookupParameter(alt);
                    if (lvlP != null && lvlP.HasValue)
                        return FormatParamValue(e, lvlP);
                }
                // Also try Native LevelId
                var nativeLvl = e.Document.GetElement(e.LevelId)?.Name;
                if (!string.IsNullOrEmpty(nativeLvl)) return nativeLvl;
            }

            // 1. Try standard name lookup FIRST (takes priority over BIP to avoid
            //    clashes like "Structural" matching a generic BIP instead of the
            //    element's actual parameter).
            var p = e.ResolveParam(name);
            if (p != null && p.HasValue) return FormatParamValue(e, p);

            // 2. Fall back to BuiltInParameter enum match
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return FormatParamValue(e, bp);
            }

            // 3. Smart Fallback: Try C# Property via Reflection
            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val == null) return "";
                    if (val is Element re) return re.Name;
                    if (val is ElementId id) return e.Document.GetElement(id)?.Name ?? "";

                    if (val is double d)
                    {
                        try
                        {
                            return UnitFormatUtils.Format(e.Document.GetUnits(), SpecTypeId.Length, d, false);
                        }
                        catch { return d.ToString("F3"); }
                    }

                    return val.ToString() ?? "";
                }
            }
            catch { }

            // 4. Native property fallback — "Level", "Name", "Category", etc.
            try
            {
                foreach (var np in e.NativeProperties())
                {
                    dynamic d = np;
                    if (string.Equals((string)d.Property, name, StringComparison.OrdinalIgnoreCase))
                    {
                        var val = (string)d.Value;
                        if (val != "-" && !string.IsNullOrEmpty(val)) return val;
                    }
                }
            }
            catch { }

            // 4b. "Level" fallback chain — different categories use different
            // parameter names. NativeProperties LevelId is empty for Structural
            // Framing; try the real parameter names.
            if (name.Equals("Level", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var alt in new[] { "Reference Level", "Base Level", "Base Constraint" })
                {
                    var v = e.GetStr(alt);
                    if (!string.IsNullOrEmpty(v)) return v;
                }
            }

            // 5. Type parameter fallback
            //
            // ⚠⚠ THE FALLBACK MUST NOT SPEAK FOR THE ELEMENT (fixed 2026-10-27, review round 6).
            //   `return type.GetStr(name)` re-entered this method on the TYPE, where the
            //   "is it declared?" check ran against the TYPE's parameters — and a type very
            //   often does NOT declare an instance parameter. Measured live: four windows,
            //   each `LookupParameter("Comments") != null` with no value set, produced
            //   `⚠ GetStr("Comments"): still no such parameter after N elements — the name is
            //   wrong for this whole set`. The name was right; the CALLER was told about a
            //   type it never mentioned. So the fallback is now gated: only ask the type when
            //   the type actually declares the parameter, which also means the recursion
            //   cannot warn (its own check would pass).
            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                if (type != null && _declaresParameter(type, name)) return type.GetStr(name);
            }

            // ⚠⚠ "NOT FOUND" IS A CLAIM, SO CHECK IT BEFORE MAKING IT (fixed 2026-10-27).
            //   Reaching this line means no scope produced a VALUE — which is not the same
            //   as the parameter not existing. An existing parameter that is simply EMPTY
            //   (no value set on this element) falls through every branch above and used to
            //   be reported as "parameter not found ... check spelling", which sent agents
            //   hunting for a typo that was not there. Measured live: ~5 such warnings on a
            //   single Peek(). Only warn when the parameter is genuinely undeclared.
            if (!_declaresParameter(e, name))
                _warnUnknownParameter(e, name, "GetStr");
            return "";
        }

        /// <summary>
        /// Does this element (or its type) declare a parameter with this name, whether or
        /// not it holds a value? Used to tell "empty" apart from "misspelled".
        /// </summary>
        private static bool _declaresParameter(Element e, string name)
        {
            if (e == null || string.IsNullOrEmpty(name)) return false;
            try
            {
                if (e.ResolveParam(name) != null) return true;

                // ⚠⚠ `LookupParameter` CAN MISS A PARAMETER THAT EXISTS. Measured 2026-10-28 on
                //   TestModel.rvt: `type.LookupParameter("Image")` returned **null** while the
                //   same name was in the element's own parameter set, and `e.GetStr("Image")`
                //   on the wall returned "" without a warning one minute and warned the next —
                //   in the SAME session, with no rebuild in between. That is the whole
                //   explanation for a warning that "only comes on the first execution": the
                //   guard's ONLY existence test was a single volatile API call, so the answer
                //   depended on Revit's parameter materialisation, not on the name.
                //   ⇒ Scan the parameter SET before claiming a name does not exist. The set is
                //   the authoritative list, and it is the same list the discovery methods
                //   iterate — so the two can no longer disagree.
                foreach (Parameter q in e.Parameters)
                    if (string.Equals(q.Definition.Name, name, StringComparison.OrdinalIgnoreCase))
                        return true;

                if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip)
                    && e.get_Parameter(bip) != null) return true;

                // A native property (Name, Category, …) is declared even when its text is "-".
                try
                {
                    foreach (var np in e.NativeProperties())
                    {
                        dynamic d = np;
                        if (string.Equals((string)d.Property, name, StringComparison.OrdinalIgnoreCase))
                            return true;
                    }
                }
                catch { }

                var typeId = e.GetTypeId();
                if (typeId != null && typeId != ElementId.InvalidElementId)
                {
                    var type = e.Document.GetElement(typeId);
                    if (type != null)
                    {
                        if (type.ResolveParam(name) != null) return true;
                        foreach (Parameter q in type.Parameters)   // same volatile-lookup reason
                            if (string.Equals(q.Definition.Name, name, StringComparison.OrdinalIgnoreCase))
                                return true;
                    }
                }
            }
            catch { }
            return false;
        }

        /// <summary>
        /// Tracks unknown parameter names, and WHICH elements have already reported each one.
        ///
        /// ⚠⚠ THE IDS ARE THE POINT (fixed 2026-10-27). This used to be a plain counter, so the
        /// message said "still no such parameter after 75 elements" after 4 windows — the number
        /// was CALLS, not elements, and it accumulated across the whole session including calls
        /// about a different collection. A warning that overstates its own evidence is worse than
        /// no number at all: the reader cannot tell "this name is wrong everywhere" from "this
        /// name was asked about 75 times".
        /// </summary>
        private static readonly Dictionary<string, HashSet<long>> _warnedParams =
            new(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Warn that a parameter name does not exist on this element, naming the CLOSEST real
        /// parameter when there is one. Printed on the first sighting, then once per 25 elements.
        ///
        /// ⚠⚠ `GetNum` AND `GetInt` DID NOT WARN AT ALL BEFORE 2026-10-27 — only `GetStr` did.
        /// Measured by the pre-release review: `GetStr("Fire Ratng")` reported "parameter not
        /// found", while `GetNum("Unconnected Hieght", "m")` returned <b>0</b> in silence. A
        /// misspelled name then looks exactly like a real zero, which is the worst failure a
        /// QUANTITY can have: a BOQ line reading 0 m² looks like a measurement, not a typo.
        ///
        /// ⚠ The count is not decoration. In a `.Select` over hundreds of elements one line per
        /// element is noise and one line in total hides that the name is wrong for the WHOLE
        /// set — which is the case that matters.
        /// </summary>
        private static void _warnUnknownParameter(Element e, string name, string caller)
        {
            if (string.IsNullOrEmpty(name)) return;

            if (!_warnedParams.TryGetValue(name, out var elements))
            {
                elements = new HashSet<long>();
                _warnedParams[name] = elements;
            }
            elements.Add(e.Id.Value);
            int seen = elements.Count;

            if (seen != 1 && seen % 25 != 0) return;

            try
            {
                if (seen == 1)
                {
                    ScriptApi.Println(
                        $"⚠ {caller}(\"{name}\"): no parameter of that name on this element."
                        + _closestParameterName(e, name)
                        + " Check the spelling, or use .CombinedParams().Table() to see the real names.");
                }
                else
                {
                    ScriptApi.Println(
                        $"⚠ {caller}(\"{name}\"): no such parameter on any of {seen} elements — the "
                        + "name is wrong for this whole set, not just one element.");
                }
            }
            catch { /* silent — diagnostics are best-effort */ }
        }

        /// <summary>
        /// The real parameter name closest to <paramref name="name"/>, as a ready-made
        /// ` Did you mean "..."?` fragment — or "" when nothing is close enough.
        ///
        /// ⚠ A suggestion is the difference between a warning the caller acts on and one it
        /// reads past. "Unconnected Hieght" is two transpositions from the truth, and "check
        /// the spelling" does not find it faster than naming it does.
        /// </summary>
        private static string _closestParameterName(Element e, string name)
        {
            try
            {
                int bestDistance = int.MaxValue;
                string bestName = null;
                foreach (var candidate in _parameterNames(e))
                {
                    int d = _editDistance(name, candidate);
                    if (d < bestDistance) { bestDistance = d; bestName = candidate; }
                }

                // One edit per four characters, never fewer than two — so a 5-letter typo can
                // still match, while "Level" is not "helped" to "Elevation".
                int limit = Math.Max(2, name.Length / 4);
                if (bestName != null && bestDistance <= limit)
                    return $" Did you mean \"{bestName}\"?";
            }
            catch { }
            return "";
        }

        /// <summary>
        /// Every parameter name this element or its TYPE declares, deduplicated. The type is
        /// included because GetStr/GetNum fall back to it — so its names are the real
        /// candidates, not just the instance's.
        /// </summary>
        private static IEnumerable<string> _parameterNames(Element e)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var elements = new List<Element> { e };
            try
            {
                var typeId = e.GetTypeId();
                if (typeId != null && typeId != ElementId.InvalidElementId)
                {
                    var t = e.Document.GetElement(typeId);
                    if (t != null) elements.Add(t);
                }
            }
            catch { }

            foreach (var el in elements)
            {
                foreach (Parameter p in el.Parameters)
                {
                    string n = null;
                    try { n = p?.Definition?.Name; } catch { }
                    if (!string.IsNullOrEmpty(n) && seen.Add(n)) yield return n;
                }
            }
        }

        /// <summary>Levenshtein distance — local and dependency-free.</summary>
        private static int _editDistance(string a, string b)
        {
            a = (a ?? "").ToLowerInvariant();
            b = (b ?? "").ToLowerInvariant();
            if (a.Length == 0) return b.Length;
            if (b.Length == 0) return a.Length;

            var prev = new int[b.Length + 1];
            var cur = new int[b.Length + 1];
            for (int j = 0; j <= b.Length; j++) prev[j] = j;

            for (int i = 1; i <= a.Length; i++)
            {
                cur[0] = i;
                for (int j = 1; j <= b.Length; j++)
                {
                    int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                    cur[j] = Math.Min(Math.Min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
                }
                var swap = prev; prev = cur; cur = swap;
            }
            return prev[b.Length];
        }

        /// <summary> Gets the parameter value converted to a specific unit as a string (no suffix). </summary>
        public static string GetStr(this Element e, string name, string unit, int decimals = 2)
        {
            if (e == null) return "";
            return e.GetNum(name).FormatValueOnly(unit, decimals);
        }

        /// <summary>
        /// Paracore parameter name map — the "Paracore " prefix was dropped
        /// from all shared parameters (bare names are the convention, matching
        /// IsWetRoom / IsExterior). Bare is authoritative; the prefixed name is
        /// the legacy alias still found in projects created before the rename.
        /// </summary>
        private static readonly Dictionary<string, string> _paramAliasBare = new(StringComparer.Ordinal)
        {
            ["Paracore IsDoorWin"] = "IsDoorWin",
            ["Paracore IsParapetWall"] = "IsParapetWall",
            ["Paracore IsFenceWall"] = "IsFenceWall",
            ["Paracore IsHandrailWall"] = "IsHandrailWall",
            ["Paracore IsExcavationMarker"] = "IsExcavationMarker",
            ["Paracore IsRoofSlab"] = "IsRoofSlab",
            ["Paracore IsGradeSlab"] = "IsGradeSlab",
            ["Paracore IsGradeBeam"] = "IsGradeBeam",
            ["Paracore_BOQ_Section"] = "BOQ_Section",
            ["Paracore_BOQ_Boundary"] = "BOQ_Boundary",
        };
        private static readonly Dictionary<string, string> _paramAliasPrefixed =
            _paramAliasBare.GroupBy(kv => kv.Value).ToDictionary(g => g.Key, g => g.First().Key);

        /// <summary>
        /// Parameter resolution with the Paracore migration alias. Legacy bare
        /// names (e.g. "IsDoorWin") transparently resolve to their migrated
        /// shared parameters ("Paracore IsDoorWin") — the engine's one-time
        /// rename removed the legacy binding, but user scripts keep using the
        /// names they always have. Returns null when neither name exists.
        /// </summary>
        internal static Parameter ResolveParam(this Element e, string name)
        {
            var p = e.LookupParameter(name);
            if (p != null) return p;
            if (string.IsNullOrEmpty(name)) return null;
            if (_paramAliasBare.TryGetValue(name, out var bare))            // legacy prefixed → bare
                return e.LookupParameter(bare);
            if (_paramAliasPrefixed.TryGetValue(name, out var prefixed))    // bare → legacy prefixed
                return e.LookupParameter(prefixed);
            if (!name.StartsWith("Paracore", StringComparison.OrdinalIgnoreCase))
                return e.LookupParameter("Paracore " + name);
            return null;
        }

        /// <summary> Gets the parameter value as a double (Internal Units). Falls back to C# Property. </summary>
        public static double GetNum(this Element e, string name)
        {
            // ⚠ Guarded for symmetry with GetStr/GetVal — same family, same self-call shape.
            using var _guard = Runtime.ScriptGuard.Enter("GetNum");

            if (e == null) return 0.0;

            // 1. Try standard name lookup FIRST (see GetStr for rationale).
            var p = e.ResolveParam(name);
            if (p != null && p.HasValue)
            {
                // Yes/No checkbox — AsDouble() is unreliable; use AsInteger().
                if (p.StorageType == StorageType.Integer
                    && p.Definition is InternalDefinition pIntDef
                    && pIntDef.GetDataType() == SpecTypeId.Boolean.YesNo)
                    return p.AsInteger();
                return p.AsDouble();
            }

            // 2. Fall back to BuiltInParameter enum match
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue)
                {
                    // Yes/No checkbox — AsDouble() is unreliable; use AsInteger().
                    if (bp.StorageType == StorageType.Integer
                        && bp.Definition is InternalDefinition bpIntDef
                        && bpIntDef.GetDataType() == SpecTypeId.Boolean.YesNo)
                        return bp.AsInteger();
                    return bp.AsDouble();
                }
            }

            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val is double d) return d;
                    if (val is float f) return (double)f;
                    if (val is int i) return (double)i;
                }
            }
            catch { }

            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                // ⚠ Gated for the same reason as GetStr: the type must not answer for the
                //   element, and must not warn on its behalf. See the note in GetStr step 5.
                if (type != null && _declaresParameter(type, name)) return type.GetNum(name);
            }

            // ⚠⚠ A SILENT ZERO IS THE WORST ANSWER THIS METHOD CAN GIVE (fixed 2026-10-27).
            //   Reaching here means no scope produced a VALUE — which is NOT the same as the
            //   parameter not existing. So warn only when it genuinely does not exist, exactly
            //   as GetStr does, and suggest the closest real name.
            if (!_declaresParameter(e, name))
                _warnUnknownParameter(e, name, "GetNum");
            return 0.0;
        }

        /// <summary> Gets the parameter value as an integer. Falls back to C# Property. </summary>
        public static int GetInt(this Element e, string name)
        {
            if (e == null) return 0;

            // 1. Try standard name lookup FIRST (see GetStr for rationale).
            var p = e.ResolveParam(name);
            if (p != null && p.HasValue) return p.AsInteger();

            // 2. Fall back to BuiltInParameter enum match
            if (Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                var bp = e.get_Parameter(bip);
                if (bp != null && bp.HasValue) return bp.AsInteger();
            }

            try
            {
                var prop = e.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (prop != null)
                {
                    var val = prop.GetValue(e);
                    if (val is int i) return i;
                    if (val is bool b) return b ? 1 : 0;
                }
            }
            catch { }

            var typeId = e.GetTypeId();
            if (typeId != null && typeId != ElementId.InvalidElementId)
            {
                var type = e.Document.GetElement(typeId);
                // ⚠ Gated for the same reason as GetStr: the type must not answer for the
                //   element, and must not warn on its behalf. See the note in GetStr step 5.
                if (type != null && _declaresParameter(type, name)) return type.GetInt(name);
            }

            // Same rule as GetNum: 0 is a plausible value, so silence makes a typo invisible.
            if (!_declaresParameter(e, name))
                _warnUnknownParameter(e, name, "GetInt");
            return 0;
        }

        /// <summary>
        /// Gets the formatted value string exactly as seen in the Revit Properties palette.
        /// </summary>
        public static string GetVal(this Element e, string name)
        {
            // ⚠ Guarded because THIS method is one leg of the cycle that killed Revit on 2026-10-27:
            //   GetVal → GetTypeVal → GetElementType (returns self) → GetVal. The stack check fires
            //   before the guard page, so a recurrence is a catchable exception, not 0xc00000fd.
            using var _guard = Runtime.ScriptGuard.Enter("GetVal");

            if (e == null || string.IsNullOrEmpty(name)) return "-";

            var p = e.ResolveParam(name);
            if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
            {
                p = e.get_Parameter(bip);
            }

            if (p != null)
            {
                var formatted = p.AsValueString();
                if (!string.IsNullOrEmpty(formatted)) return formatted;
                if (p.StorageType == StorageType.String) return p.AsString() ?? "-";
            }

            var fallback = e.GetStr(name);
            if (!string.IsNullOrEmpty(fallback)) return fallback;

            // ⚠⚠ A TYPE IS ITS OWN TYPE — so this fallback MUST NOT fire on a type receiver.
            //   `GetElementType()` returns `e` for an ElementType (it has to: `GetTypeId()` is -1
            //   there), and `GetTypeVal(name)` delegates straight back into THIS method:
            //       GetVal → GetTypeVal → GetElementType() → GetVal → …
            //   an unbounded recursion. It took Revit down on 2026-10-27 (journal 4555: the
            //   TaskDialog was answered `1001 Allow`, the `CoreScript Code Executor` ExternalEvent
            //   started, and the journal then STOPPED — a stack overflow inside the script, not a
            //   Revit fault). It is reachable from three everyday shapes, not an exotic one:
            //       TypeParams() on a type  → InstanceParams() → GetVal() per parameter
            //       GetTypeStr("…") on a type → GetStr()
            //       GetVal("…") on a type     → this line
            //   Steps 1–3 above have ALREADY read this element's own parameters, so on a type
            //   there is no separate type left for a fallback to consult. Returning "-" here is
            //   the correct answer, not a short-circuit.
            if (e is ElementType) return "-";

            var typeVal = e.GetTypeVal(name);
            return string.IsNullOrEmpty(typeVal) || typeVal == "-" ? "-" : typeVal;
        }

        /// <summary> Gets the formatted value string in a specific unit (with suffix). </summary>
        public static string GetVal(this Element e, string name, string unit, int decimals = 2)
        {
            if (e == null) return "-";
            return e.GetNum(name).FormatUnit(unit, decimals);
        }

        /// <summary>
        /// Gets the parameter value as a double converted FROM internal units to target units.
        /// <para>
        /// ⚠⚠ EXACT BY DEFAULT (2026-10-27). <c>decimals</c> defaults to <b>-1</b> = do not round;
        /// pass a number only when you want the rounded value. This used to default to 2, which
        /// made the reported QUANTITY a rounded approximation of the model: a 5.065 m wall came
        /// back as 5.07, a 915 mm door as 0.91 m, and a sum of 2-dp areas lost 0.012 m² on a
        /// nine-wall test model — the loss growing with the building. Rounding is a display
        /// concern: FormatUnit / GetVal / GetStr(unit) do it for you.
        /// </para>
        /// </summary>
        public static double GetNum(this Element e, string name, string unit, int decimals = -1)
        {
            return e.GetNum(name).OutputUnit(unit, decimals);
        }

        // ── Type parameter wrappers ──────────────────────────────────────

        public static Element GetElementType(this Element e)
        {
            // ⚠ THE CHOKEPOINT OF THE WHOLE FAMILY. Every type-parameter accessor resolves through
            //   here, and the `return e` below is what turns a resolution chain into a cycle. Guarding
            //   this single line of entry means no future reader added to this family can reintroduce
            //   the 2026-10-27 crash.
            using var _guard = Runtime.ScriptGuard.Enter("GetElementType");

            if (e == null) return null;

            // ⚠⚠ A TYPE IS ITS OWN TYPE. `Element.GetTypeId()` returns -1 for an ElementType,
            //   so the naive path returned null for exactly the receivers a caller reaches by
            //   asking for types — `GetElements<WallType>().First()`, a `FamilySymbol` handed
            //   back by NewType. Every reader built on this then returned ""/0, and every
            //   writer built on it (SetTypeVal / SetTypeNum, which are
            //   `e.GetElementType()?.SetVal(...)`) became a SILENT NO-OP: no throw, no warning,
            //   model unchanged, caller told it succeeded.
            //   `TypeInstanceCount` already carries this same `e is ElementType ? e.Id :
            //   e.GetTypeId()` distinction; this is the missing half of it.
            if (e is ElementType) return e;

            var id = e.GetTypeId();
            if (id == null || id == ElementId.InvalidElementId) return null;
            return e.Document.GetElement(id);
        }

        public static string GetTypeStr(this Element e, string name) => e.GetElementType()?.GetStr(name) ?? "";
        public static string GetTypeStr(this Element e, string name, string unit, int decimals = 2) => e.GetElementType()?.GetStr(name, unit, decimals) ?? "";
        public static double GetTypeNum(this Element e, string name) => e.GetElementType()?.GetNum(name) ?? 0.0;
        /// <summary>Type-parameter twin of GetNum(name, unit) — exact by default, decimals = -1 means no rounding.</summary>
        public static double GetTypeNum(this Element e, string name, string unit, int decimals = -1) => e.GetElementType()?.GetNum(name, unit, decimals) ?? 0.0;
        public static int GetTypeInt(this Element e, string name) => e.GetElementType()?.GetInt(name) ?? 0;
        public static string GetTypeVal(this Element e, string name) => e.GetElementType()?.GetVal(name) ?? "-";
        public static string GetTypeVal(this Element e, string name, string unit, int decimals = 2) => e.GetElementType()?.GetVal(name, unit, decimals) ?? "-";

        // ── Helpers ──────────────────────────────────────────────────────

        private static string FormatParamValue(Element e, Parameter p)
        {
            switch (p.StorageType)
            {
                case StorageType.String:
                    return p.AsString() ?? "";
                case StorageType.ElementId:
                    var id = p.AsElementId();
                    if (id == null || id == ElementId.InvalidElementId)
                    {
                        var vs = p.AsValueString();
                        return !string.IsNullOrEmpty(vs) ? vs : "";
                    }
                    // Prefer AsValueString for user-visible display values
                    // (e.g. "Family: Type" vs bare element Name).
                    var displayVal = p.AsValueString();
                    if (!string.IsNullOrEmpty(displayVal))
                        return displayVal;
                    var refEl = e.Document.GetElement(id);
                    if (refEl == null)
                    {
                        var cat = Category.GetCategory(e.Document, id);
                        if (cat != null) return cat.Name;
                        return "";
                    }
                    return refEl.Name;
                case StorageType.Double:
                case StorageType.Integer:
                    // Yes/No checkbox — AsValueString is unreliable for 0.
                    // Return the raw integer so 0/1 works bidirectionally
                    // and displays correctly in tables.
                    if (p.Definition is InternalDefinition intDef
                        && intDef.GetDataType() == SpecTypeId.Boolean.YesNo)
                        return p.AsInteger().ToString();

                    var valStr = p.AsValueString();
                    if (!string.IsNullOrEmpty(valStr)) return valStr;

                    return p.AsInteger().ToString();
                default:
                    return "";
            }
        }
    }
}
