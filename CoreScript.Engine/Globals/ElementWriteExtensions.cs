using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Parameter setters — SetNum, SetVal (smart setter), and type-level equivalents.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// "Wall 359588" / "Doors 359614" — enough for a caller to find the element it broke on.
        /// </summary>
        private static string _describeElement(Element e)
        {
            if (e == null) return "the element";
            try
            {
                var cat = e.Category?.Name;
                return string.IsNullOrEmpty(cat)
                    ? $"element {e.Id.IntegerValue}"
                    : $"{cat} {e.Id.IntegerValue}";
            }
            catch { return "the element"; }
        }

        /// <summary>
        /// Refuse a write to a name that neither the element nor its type has.
        ///
        /// ⚠⚠ WHY THIS THROWS (2026-10-29, second release review). It used to print
        /// <c>⚠ SetVal("…")</c> and RETURN. Two failures compounded: the message was throttled
        /// by a one-shot-per-name-per-session set, and the enclosing transaction still reported
        /// <c>✅ COMMITTED … modified 0</c>. So the caller got a green checkmark for a write that
        /// never happened, and on the second call in a session not even the warning. A typo must
        /// never look like a successful write — the same rule as the <c>WhereParam</c> guard.
        /// </summary>
        private static void _rejectUnknownSetParam(Element e, string name, string caller)
        {
            var hint = _closestParameterName(e, name);
            // ⚠ `hint` is ALREADY a complete fragment — ` Did you mean "Fire Rating"?` — which
            //   is what _closestParameterName documents and what the other two call sites
            //   (ElementParamExtensions lines 290 and 426) append verbatim. This caller wrapped
            //   it a second time, so the agent was shown:
            //     Did you mean " Did you mean "Fire Rating"?"?
            //   Measured 2026-10-29 by spikes/probe_write_safety.py (P1a). The doc had the right
            //   text all along; the code disagreed with it. Append, never re-wrap.
            throw new InvalidOperationException(
                $"{caller}(\"{name}\"): no parameter of that name on {_describeElement(e)} or its type."
                + (string.IsNullOrEmpty(hint) ? "" : hint)
                + " Use .CombinedParams().Table() to list the real names.");
        }

        /// <summary>
        /// Refuse a write to a parameter Revit marks read-only.
        ///
        /// ⚠⚠ WHY THIS THROWS (2026-10-29, second release review). Measured live on TestModel:
        /// <c>SetNum("Top Offset", 100, "mm")</c> on a wall whose Top Constraint is Unconnected
        /// reported <c>✅ Transact "Set Top Offset" — COMMITTED · modified 0</c> and changed
        /// nothing. The warning that was supposed to explain it is one-shot per name per session,
        /// so a second attempt in the same session printed NOTHING AT ALL. The reviewer's words:
        /// "a rejected write isn't an error … scripts that don't check the output will miss it".
        ///
        /// ⚠ CONSEQUENCE FOR BULK WRITES: <c>.SetParam()</c> over a collection runs inside one
        /// transaction, so the first refusing element aborts the whole write. That is deliberate —
        /// writing 6 of 9 walls and reporting success is the outcome this exists to prevent.
        /// Narrow the collection (e.g. by the parameter that makes the rest read-only) instead.
        /// </summary>
        private static void _rejectReadOnlyParam(Element e, string name, string caller)
        {
            throw new InvalidOperationException(
                $"{caller}(\"{name}\"): the parameter is READ-ONLY on {_describeElement(e)} and "
                + "cannot be modified. Revit marks a parameter read-only when another value drives "
                + "it — \"Top Offset\" on a wall whose Top Constraint is Unconnected is the usual "
                + "case. Nothing was written.");
        }

        /// <summary>
        /// Which categories a reference (ElementId) parameter can actually hold, inferred from
        /// its name. Empty means "unknown — accept any category, but still refuse ambiguity".
        /// </summary>
        private static HashSet<ElementId> _referenceCategoriesFor(Document doc, string name)
        {
            var ids = new HashSet<ElementId>();
            var n = (name ?? "").ToLowerInvariant();

            void Add(BuiltInCategory bic)
            {
                try
                {
                    var c = Category.GetCategory(doc, bic);
                    if (c != null) ids.Add(c.Id);
                }
                catch { }
            }

            // ⚠ "constraint" as well as "level": a wall's Base/Top Constraint IS a Level, and
            //   neither name contains the word "level". That is the parameter the reviewer
            //   wrote to with "None" and corrupted a wall's height.
            if (n.Contains("level") || n.Contains("constraint")) Add(BuiltInCategory.OST_Levels);
            else if (n.Contains("view")) Add(BuiltInCategory.OST_Views);
            else if (n.Contains("phase")) Add(BuiltInCategory.OST_Phases);
            else if (n.Contains("material")) Add(BuiltInCategory.OST_Materials);

            return ids;
        }

        /// <summary>
        /// Writes a reference parameter from a NAME or an id, refusing anything ambiguous or of
        /// the wrong kind.
        /// <para>
        /// ⚠⚠ WHY THIS EXISTS (2026-10-27, pre-release review round 3). The previous code took
        /// the FIRST element in the whole document whose name matched, with no regard for what
        /// the parameter accepts:
        /// <code>SetVal("Top Constraint", "None")</code>
        /// resolved to whatever element happened to be named "None" (most likely a Phase) and
        /// wrote it. The wall then read back "None" with a changed height — a silent wrong
        /// write, and the reviewer's most serious finding. "Unconnected" and "&lt;None&gt;" did
        /// nothing at all, and "-1" only worked by accident.
        /// </para>
        /// <para>
        /// Now: the spellings that mean "no reference" are honoured explicitly; the name search
        /// is restricted to categories the parameter can hold; an ambiguous name is REFUSED
        /// rather than resolved to the first hit; and an id must name a real element of an
        /// acceptable kind. Every failure is loud — in a tool that edits models, a silent wrong
        /// write is worse than an exception.
        /// </para>
        /// </summary>
        private static void SetElementIdFromName(Element e, Parameter p, string name, string raw)
        {
            var s = (raw ?? "").Trim();

            // 1. The spellings that mean "no reference". Honoured before any lookup, so they
            //    can never be mistaken for an element that happens to share the name.
            if (s.Length == 0
                || s == "-1"
                || s.Equals("<None>", StringComparison.OrdinalIgnoreCase)
                || s.Equals("Unconnected", StringComparison.OrdinalIgnoreCase))
            {
                p.Set(ElementId.InvalidElementId);
                return;
            }

            var allowed = _referenceCategoriesFor(e.Document, name);
            var doc = e.Document;

            List<Element> Candidates(bool types) =>
                (types
                    ? new FilteredElementCollector(doc).WhereElementIsElementType()
                    : new FilteredElementCollector(doc).WhereElementIsNotElementType())
                .Where(el => el.Name.Equals(s, StringComparison.OrdinalIgnoreCase))
                .Where(el => allowed.Count == 0 || (el.Category != null && allowed.Contains(el.Category.Id)))
                .ToList();

            var matches = Candidates(false);
            if (matches.Count == 0) matches = Candidates(true);

            if (matches.Count == 1)
            {
                p.Set(matches[0].Id);
                return;
            }

            if (matches.Count > 1)
            {
                var shown = string.Join(", ", matches.Take(5).Select(m => $"{m.Name} (id {m.Id})"));
                throw new ArgumentException(
                    $"SetVal(\"{name}\"): \"{s}\" matches {matches.Count} elements, so picking one "
                    + $"would be a silent wrong write. Set it by id instead. Candidates: {shown}");
            }

            // 2. A bare "None" reaches here only when NOTHING of an acceptable kind is named
            //    "None" — which is the normal case, and means "clear it".
            if (s.Equals("None", StringComparison.OrdinalIgnoreCase))
            {
                p.Set(ElementId.InvalidElementId);
                return;
            }

            // 3. A numeric id must name a real element this parameter can hold.
            if (long.TryParse(s, out var idVal))
            {
                var byId = doc.GetElement(new ElementId(idVal));
                if (byId == null)
                    throw new ArgumentException($"SetVal(\"{name}\"): no element has id {idVal}.");
                if (allowed.Count > 0 && (byId.Category == null || !allowed.Contains(byId.Category.Id)))
                {
                    throw new ArgumentException(
                        $"SetVal(\"{name}\"): id {idVal} is a {byId.Category?.Name ?? "element with no category"}, "
                        + "which this parameter cannot hold.");
                }
                p.Set(byId.Id);
                return;
            }

            throw new ArgumentException(
                $"SetVal(\"{name}\"): nothing suitable is named \"{s}\". Use \"<None>\" or "
                + "\"Unconnected\" to clear the reference, or pass the element's id. "
                + (allowed.Count > 0
                    ? "This parameter takes a " + string.Join("/", allowed.Select(id => doc.GetElement(id)?.Name)) + "."
                    : ""));
        }

        /// <summary>
        /// Sets a numeric parameter value, automatically converting FROM the specified unit.
        /// Wraps in a transaction named "Update Parameter" if one isn't already active.
        /// Falls back to ElementType if the parameter is a type-level parameter.
        /// </summary>
        public static void SetNum(this Element e, string name, double value, string unit)
        {
            if (e == null) return;

            void Action()
            {
                var p = e.LookupParameter(name);
                if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                {
                    p = e.get_Parameter(bip);
                }

                // 1. Fall back to ElementType if not found on instance
                if (p == null && e is not ElementType)
                {
                    var type = e.GetElementType();
                    if (type != null)
                    {
                        var tp = type.LookupParameter(name);
                        if (tp == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var typeBip))
                        {
                            tp = type.get_Parameter(typeBip);
                        }
                        if (tp != null)
                        {
                            // ⚠⚠ THIS IS THE EXACT WRITE THE ADVISORY EXISTS FOR, AND IT USED TO
                            //   RETURN PAST IT (fixed 2026-10-29). The guard further down fires only
                            //   when the INSTANCE lookup SUCCEEDED and the owner is a type. Here the
                            //   instance lookup MISSED and we delegate to the type — a genuine
                            //   document-wide write that reached no advisory at all.
                            //   Measured by the release reviewer: SetVal("Fire Rating", …) on ONE
                            //   wall changed all 4 walls of its type and SetVal("Absorptance", …)
                            //   changed all 5, with no ⚠ on either. A data-safety promise that the
                            //   fallback path silently skipped.
                            _reportTypeWrite(e, name, tp);
                            type.SetNum(name, value, unit);
                            return;
                        }
                    }
                }

                if (p == null)
                {
                    _rejectUnknownSetParam(e, name, "SetNum");
                }

                if (p.IsReadOnly)
                {
                    _rejectReadOnlyParam(e, name, "SetNum");
                }

                // ⚠⚠ THE TYPE-WRITE GUARD. `e.LookupParameter(name)` on an INSTANCE also finds the
                //    TYPE's parameters — Revit projects them — so this write can land on the type
                //    and change every instance of it. Measured 2026-10-14: one SetNum("Width") on
                //    one window moved 8 elements (4 windows + their 4 host walls). See
                //    ElementTypeWriteGuard for why it informs rather than refuses.
                if (e is not ElementType && p.Element is ElementType)
                {
                    _reportTypeWrite(e, name, p);
                }

                if (p.StorageType == StorageType.Double)
                {
                    p.Set(value.InputUnit(unit));
                }
            }

            if (e.Document.IsModifiable)
            {
                Action();
            }
            else
            {
                _ = Tx.Transact(e.Document, $"Set {name}", Action);
            }
        }

        /// <summary>
        /// THE SMART SETTER. Handles: Double/Int → SetNum, String with units → SetValueString,
        /// String Name → resolves to ElementId (for Levels/Types), String → Standard String set.
        /// Automatically falls back to ElementType if the parameter is a Type parameter (e.g. Fire Rating on Walls).
        /// </summary>
        public static void SetVal(this Element e, string name, object value)
        {
            if (e == null || value == null) return;

            void Action()
            {
                var p = e.LookupParameter(name);
                if (p == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var bip))
                {
                    p = e.get_Parameter(bip);
                }
                // Paracore migration alias — legacy bare names (e.g. "IsDoorWin")
                // transparently resolve to their migrated shared parameters
                // ("Paracore IsDoorWin"); see ResolveParam.
                if (p == null) p = e.ResolveParam(name);

                // 1. Fall back to ElementType if not found on instance
                if (p == null && e is not ElementType)
                {
                    var type = e.GetElementType();
                    if (type != null)
                    {
                        var tp = type.LookupParameter(name);
                        if (tp == null && Enum.TryParse<BuiltInParameter>(name.Replace(" ", "_").ToUpper(), out var typeBip))
                        {
                            tp = type.get_Parameter(typeBip);
                        }
                        if (tp != null)
                        {
                            // ⚠⚠ Same silent type write as in SetNum — the advisory below is
                            //   unreachable from here because this returns first. Fixed 2026-10-29:
                            //   the reviewer's SetVal("Fire Rating", …) on one wall rewrote all 4
                            //   walls of its type, and SetVal("Absorptance", …) rewrote all 5, with
                            //   no ⚠ on either call.
                            _reportTypeWrite(e, name, tp);
                            type.SetVal(name, value);
                            return;
                        }
                    }
                }

                if (p == null)
                {
                    try
                    {
                        var prop = e.GetType().GetProperty(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
                        if (prop != null && prop.CanWrite)
                        {
                            var targetType = prop.PropertyType;
                            try
                            {
                                if (targetType == typeof(bool) && value is string sVal)
                                {
                                    if (bool.TryParse(sVal, out var bVal)) prop.SetValue(e, bVal);
                                }
                                else if (targetType == typeof(string))
                                {
                                    prop.SetValue(e, value.ToString());
                                }
                                else
                                {
                                    var converted = Convert.ChangeType(value, targetType);
                                    prop.SetValue(e, converted);
                                }
                            }
                            catch { }
                            return;
                        }
                    }
                    catch { }

                    _rejectUnknownSetParam(e, name, "SetVal");
                }

                if (p.IsReadOnly)
                {
                    _rejectReadOnlyParam(e, name, "SetVal");
                }

                // ⚠⚠ THE TYPE-WRITE GUARD — same trap as in SetNum: LookupParameter on an instance
                //    finds the TYPE's parameters too, so this write can land on the type and change
                //    every instance of it. See ElementTypeWriteGuard.
                if (e is not ElementType && p.Element is ElementType)
                {
                    _reportTypeWrite(e, name, p);
                }

                if (value is double d) { p.Set(d); return; }
                if (value is int i) { p.Set(i); return; }

                if (value is string s)
                {
                    if (p.StorageType == StorageType.Double || p.StorageType == StorageType.Integer)
                    {
                        if (p.SetValueString(s)) return;
                    }

                    if (p.StorageType == StorageType.ElementId)
                    {
                        SetElementIdFromName(e, p, name, s);
                        return;
                    }

                    p.Set(s);
                }
            }

            if (e.Document.IsModifiable) Action();
            else _ = Tx.Transact(e.Document, $"Set {name}", Action);
        }

        /// <summary>
        /// Sets a parameter value, converting the value from the specified unit if numeric.
        /// </summary>
        public static void SetVal(this Element e, string name, object value, string unit)
        {
            if (e == null || value == null) return;
            if (string.IsNullOrEmpty(unit))
            {
                e.SetVal(name, value);
                return;
            }

            double numericValue = 0;
            bool isNumeric = false;

            if (value is double d) { numericValue = d; isNumeric = true; }
            else if (value is int i) { numericValue = i; isNumeric = true; }
            else if (value is float f) { numericValue = f; isNumeric = true; }
            else if (value is decimal dec) { numericValue = (double)dec; isNumeric = true; }
            else if (value is string s && double.TryParse(s, out var parsed)) { numericValue = parsed; isNumeric = true; }

            if (isNumeric)
            {
                double internalValue = numericValue.InputUnit(unit);
                e.SetVal(name, internalValue);
            }
            else
            {
                e.SetVal(name, value);
            }
        }

        // ── Type-Level Setters ───────────────────────────────────────────

        /// <summary> Sets a type-level parameter on the element's ElementType. </summary>
        public static void SetTypeVal(this Element e, string name, object value) => e.GetElementType()?.SetVal(name, value);

        /// <summary> Sets a type-level parameter with unit conversion on the element's ElementType. </summary>
        public static void SetTypeVal(this Element e, string name, object value, string unit) => e.GetElementType()?.SetVal(name, value, unit);

        /// <summary> Sets a type-level numeric parameter on the element's ElementType. </summary>
        public static void SetTypeNum(this Element e, string name, double value, string unit) => e.GetElementType()?.SetNum(name, value, unit);
    }
}
