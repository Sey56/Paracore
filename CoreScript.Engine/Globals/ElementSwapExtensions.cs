using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// ⚠⚠ SYMBOL SWAPS THAT REPORT THEIR DELTA — <c>fi.SwapSymbol(sym)</c> and <c>fi.NewType(name)</c>.
    /// <para>
    /// <b>Why this exists.</b> Swapping an instance's symbol is a one-line assignment that can
    /// change the element's SIZE. Measured 2026-10-14: swapping four windows from
    /// <c>M_Window-Casement-Double</c> to the fixed <c>Windows_Sgl_Plain</c> took every one of them
    /// from 1400 mm to 1050 mm — a 25 % resize — and NOTHING in the pipeline said so. The
    /// substitution committed, the walls were re-cut, and the difference was found only by
    /// measuring the model against the drawing's dimension strings a stage later.
    /// </para>
    /// <para>
    /// A swap is also the CORRECT remedy for an accidental type write: the guard in
    /// <c>IsTypeParameter</c> tells you a parameter lives on the type, and <see cref="NewType"/> is
    /// how you give one instance a type of its own.
    /// </para>
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// Assigns <paramref name="symbol"/> to <paramref name="instance"/> and reports what the
        /// swap CHANGED — every parameter whose value differs between the old and the new type.
        /// <para>
        /// ⚠ This is the honest form of <c>fi.Symbol = sym</c>. The assignment itself is the same;
        /// what is added is the delta, because a swap that resizes geometry is invisible otherwise.
        /// </para>
        /// </summary>
        /// <param name="instance">The instance to re-type.</param>
        /// <param name="symbol">The symbol (type) to assign.</param>
        /// <returns>The symbol now in use — the new one, or the old one if the swap was rolled back.</returns>
        public static FamilySymbol? SwapSymbol(this FamilyInstance instance, FamilySymbol symbol)
        {
            if (instance == null) { throw new ArgumentNullException(nameof(instance)); }
            if (symbol == null) { throw new ArgumentNullException(nameof(symbol)); }

            FamilySymbol? before = instance.Symbol;

            if (before != null && before.Id == symbol.Id)
            {
                ScriptApi.Println(
                    "ℹ " + instance.Id + ": already uses " + symbol.FamilyName() + ": " + symbol.Name
                    + " — nothing to swap.");
                return symbol;
            }

            // ⚠ THE DELTA IS THE POINT. Every parameter present on both types whose value differs
            //   is a geometry change the caller did not ask for by name.
            var deltas = new List<string>();
            if (before != null)
            {
                foreach (Parameter oldParam in before.Parameters)
                {
                    if (oldParam == null) { continue; }
                    string? name = oldParam.Definition?.Name;
                    if (string.IsNullOrEmpty(name)) { continue; }

                    Parameter? newParam = symbol.LookupParameter(name);
                    if (newParam == null)
                    {
                        deltas.Add(name + ": " + Describe(oldParam) + " → (absent on the new type)");
                        continue;
                    }
                    if (!SameValue(oldParam, newParam))
                    {
                        deltas.Add(name + ": " + Describe(oldParam) + " → " + Describe(newParam));
                    }
                }
            }

            Document doc = instance.Document;
            TxReport tx;
            void Apply() { instance.Symbol = symbol; }

            if (doc.IsModifiable) { Apply(); tx = new TxReport { Name = "Swap symbol", Committed = true }; }
            else { tx = Tx.Transact(doc, "Swap symbol", Apply); }

            if (!tx.Committed)
            {
                ScriptApi.Println(
                    "⚠⚠ Swap on " + instance.Id + " was NOT applied ("
                    + (string.IsNullOrEmpty(tx.Error) ? "Revit refused it" : tx.Error)
                    + "). The instance still uses "
                    + (before == null ? "(no symbol)" : before.FamilyName() + ": " + before.Name) + ".");
                return before;
            }

            int sharing = symbol.TypeInstanceCount();
            var lines = new List<string>
            {
                "✅ Swapped " + instance.Id + " → " + symbol.FamilyName() + ": " + symbol.Name
                + "   (" + deltas.Count.ToString(CultureInfo.InvariantCulture)
                + " parameter(s) changed · " + sharing.ToString(CultureInfo.InvariantCulture)
                + " instance(s) now use this type)",
            };

            if (deltas.Count > 0)
            {
                lines.Add("   ⚠ the geometry these drive changed with the swap:");
                foreach (string delta in deltas.Take(12)) { lines.Add("     " + delta); }
                if (deltas.Count > 12)
                {
                    lines.Add("     … (+" + (deltas.Count - 12).ToString(CultureInfo.InvariantCulture)
                              + " more)");
                }
            }
            else
            {
                lines.Add("   (no driving parameter differs between the two types)");
            }

            ScriptApi.Println(string.Join(Environment.NewLine, lines));
            return symbol;
        }

        /// <summary>
        /// Duplicates this instance's type under <paramref name="typeName"/>, assigns the copy to
        /// THIS instance, and returns it — the per-instance escape hatch from a type write.
        /// <para>
        /// Example: <c>win.NewType("PC 1511x1350mm").SetNum("Width", 1511, "mm")</c> — the width
        /// write now has a blast radius of ONE, because the new type has one instance.
        /// </para>
        /// <para>
        /// ⚠ IDEMPOTENT by name: a type of that name already on the family is REUSED rather than
        /// duplicated, so re-running a stage does not litter the model with "Type 2", "Type 3".
        /// </para>
        /// </summary>
        /// <param name="instance">The instance to give its own type.</param>
        /// <param name="typeName">The new type's name.</param>
        public static FamilySymbol NewType(this FamilyInstance instance, string typeName)
        {
            if (instance == null) { throw new ArgumentNullException(nameof(instance)); }
            if (string.IsNullOrWhiteSpace(typeName))
            {
                throw new ArgumentException("A new type needs a name.", nameof(typeName));
            }

            FamilySymbol? current = instance.Symbol;
            if (current == null)
            {
                throw new InvalidOperationException(
                    "Instance " + instance.Id + " has no symbol to duplicate.");
            }

            string wanted = typeName.Trim();
            Document doc = instance.Document;

            // ⚠ Reuse an existing type of this name. A stage that is re-run must converge, not
            //   accumulate near-identical types.
            FamilySymbol? existing = null;
            try
            {
                existing = current.Family.GetFamilySymbolIds()
                    .Select(id => doc.GetElement(id) as FamilySymbol)
                    .FirstOrDefault(s => s != null
                        && string.Equals(s.Name, wanted, StringComparison.OrdinalIgnoreCase));
            }
            catch { /* a family that cannot be enumerated simply has no existing type */ }

            if (existing != null)
            {
                _ = instance.SwapSymbol(existing);
                return existing;
            }

            FamilySymbol? created = null;
            void Apply() { created = (FamilySymbol)current.Duplicate(wanted); }

            TxReport tx;
            if (doc.IsModifiable) { Apply(); tx = new TxReport { Name = "New type", Committed = true }; }
            else { tx = Tx.Transact(doc, "New type " + wanted, Apply); }

            if (created == null)
            {
                ScriptApi.Println(
                    "⚠⚠ Could not create type \"" + wanted + "\" on " + current.FamilyName() + " ("
                    + (string.IsNullOrEmpty(tx.Error) ? "Revit refused it" : tx.Error) + ").");
                return current;
            }

            ScriptApi.Println(
                "✅ " + current.FamilyName() + ": created type \"" + wanted + "\" from \""
                + current.Name + "\" and assigned it to " + instance.Id
                + " — parameter writes on it now affect this instance only.");
            _ = instance.SwapSymbol(created);
            return created;
        }

        /// <summary>A parameter's value as text, for a change report. Never throws.</summary>
        private static string Describe(Parameter p)
        {
            try
            {
                if (!p.HasValue) { return "(no value)"; }

                switch (p.StorageType)
                {
                    case StorageType.Double:
                        return p.AsValueString()
                            ?? p.AsDouble().ToString("0.###", CultureInfo.InvariantCulture);
                    case StorageType.Integer:
                        return p.AsInteger().ToString(CultureInfo.InvariantCulture);
                    case StorageType.String:
                        return "\"" + (p.AsString() ?? string.Empty) + "\"";
                    case StorageType.ElementId:
                    {
                        ElementId id = p.AsElementId();
                        return id == null
                            ? "(none)"
                            : id.Value.ToString(CultureInfo.InvariantCulture);
                    }
                    default:
                        return "(unsupported)";
                }
            }
            catch { return "(unreadable)"; }
        }

        /// <summary>True when two parameters of the same storage type hold the same value.</summary>
        private static bool SameValue(Parameter a, Parameter b)
        {
            try
            {
                if (a.StorageType != b.StorageType) { return false; }

                switch (a.StorageType)
                {
                    case StorageType.Double:
                        return Math.Abs(a.AsDouble() - b.AsDouble()) < 1e-6;
                    case StorageType.Integer:
                        return a.AsInteger() == b.AsInteger();
                    case StorageType.String:
                        return string.Equals(a.AsString(), b.AsString(), StringComparison.Ordinal);
                    case StorageType.ElementId:
                    {
                        ElementId ai = a.AsElementId();
                        ElementId bi = b.AsElementId();
                        long av = ai == null ? -1 : ai.Value;
                        long bv = bi == null ? -1 : bi.Value;
                        return av == bv;
                    }
                    default:
                        return true;
                }
            }
            catch { return false; }
        }
    }
}
