using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// ⚠⚠ THE TYPE-WRITE GUARD — telling a TYPE write apart from an INSTANCE write.
    /// <para>
    /// <b>Why this exists.</b> Revit projects a type's parameters onto its instances: asking a
    /// window for <c>"Width"</c> FINDS the parameter, and SETTING it writes to the TYPE. Every
    /// instance of that type then changes, and for a hosted family every host opening it cuts is
    /// re-cut — a per-element-looking call with a document-wide blast radius.
    /// </para>
    /// <para>
    /// Measured 2026-10-14 on a 5-window model: <c>SetNum("Width", 1511, "mm")</c> on ONE window
    /// reported <c>created 0 · modified 8</c> — the four windows plus their four host walls.
    /// Nothing in the return value said "that was a type write", and the same trap silently
    /// resized every window when a family was swapped.
    /// </para>
    /// <para>
    /// ⚠ The guard INFORMS; it never refuses. Writing a type is legitimate and often intended —
    /// what is not legitimate is doing it by accident.
    /// </para>
    /// </summary>
    public static partial class ElementExtensions
    {
        private static readonly HashSet<string> _reportedTypeWrites = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// True when this parameter lives on an element type — i.e. it is a TYPE parameter, shared
        /// by every instance of that type.
        /// <para>
        /// ⚠ <see cref="Parameter.Element"/> is the OWNER, and that is the only reliable test: a
        /// type parameter read through an instance reports the element type as its element, while
        /// its name and its id are identical on both.
        /// </para>
        /// </summary>
        public static bool IsTypeParameter(this Parameter p) => p?.Element is ElementType;

        /// <summary>
        /// How many elements in the document use this element's type — the blast radius of a write
        /// to one of its TYPE parameters.
        /// <para>
        /// ⚠ Works for a type as well as for an instance: a type IS its own type, while an instance
        /// points at one through <c>GetTypeId</c>. Returns 0 when there is no type at all, which is
        /// the honest answer for a level or a material.
        /// </para>
        /// </summary>
        public static int TypeInstanceCount(this Element e)
        {
            if (e == null) { return 0; }

            Document? doc = e.Document;
            if (doc == null) { return 0; }

            ElementId? typeId = e is ElementType ? e.Id : e.GetTypeId();
            if (typeId == null || typeId == ElementId.InvalidElementId) { return 0; }

            try
            {
                return new FilteredElementCollector(doc)
                    .WhereElementIsNotElementType()
                    .Count(x => x.GetTypeId() == typeId);
            }
            catch
            {
                // ⚠ A count that cannot be taken must never break the write it describes.
                return 0;
            }
        }

        /// <summary>
        /// Reports a write that landed on a TYPE parameter, ONCE per (type, parameter).
        /// <para>
        /// ⚠ Once, not once per element: a loop over 40 windows is ONE fact about the model, and 40
        /// identical warnings is how a real warning gets skimmed past. The report names the type,
        /// the blast radius and the per-instance escape hatch — "it changed something else too" is
        /// useless without the remedy.
        /// </para>
        /// </summary>
        internal static void _reportTypeWrite(Element e, string name, Parameter p)
        {
            try
            {
                ElementType? owner = p?.Element as ElementType;
                string ownerId = owner == null
                    ? "?"
                    : owner.Id.Value.ToString(CultureInfo.InvariantCulture);
                if (!_reportedTypeWrites.Add(ownerId + "|" + name)) { return; }

                string ownerName = owner == null
                    ? "(unknown type)"
                    : owner.FamilyName() + ": " + owner.Name;
                int count = e.TypeInstanceCount();

                ScriptApi.Println(
                    $"⚠ \"{name}\" is a TYPE parameter on {ownerName} — this writes to the TYPE, so all "
                    + count.ToString(CultureInfo.InvariantCulture)
                    + " instance(s) of it change together (and any host opening they cut is re-cut)."
                    + " For ONE instance only: .NewType(\"<name>\") and set the parameter on the"
                    + " returned symbol.");
            }
            catch
            {
                // ⚠ The guard is a diagnostic; it must never be the thing that fails a write.
            }
        }
    }
}
