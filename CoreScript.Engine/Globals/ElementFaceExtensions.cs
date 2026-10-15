using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// ONE PLANAR FACE, ADDRESSED BY THE PLANE IT LIES ON.
    /// <para>
    /// A dimension needs a <c>Reference</c>, and a face-to-face chain needs one per face. Harvesting
    /// them is the expensive part: <c>get_Geometry</c> with <c>Options.ComputeReferences</c> set,
    /// then a walk to the <c>PlanarFace</c>s, then a match by plane. This type is what a harvested
    /// face looks like once that is done — an axis, a position in millimetres, and the reference.
    /// </para>
    /// </summary>
    public sealed class FaceRef
    {
        /// <summary>The element the face belongs to.</summary>
        public ElementId Owner { get; set; } = ElementId.InvalidElementId;

        /// <summary>The plane's axis — <c>"X"</c> or <c>"Y"</c>. A vertical face is normal to one of them.</summary>
        public string Axis { get; set; } = string.Empty;

        /// <summary>Where the plane sits along <see cref="Axis"/>, in millimetres.</summary>
        public double Mm { get; set; }

        /// <summary>The face reference a dimension consumes.</summary>
        public Reference Ref { get; set; } = null!;

        /// <summary>One line per face, so a script can <c>Println</c> the whole index.</summary>
        public override string ToString()
        {
            return Axis + "=" + Mm.ToString("F1", CultureInfo.InvariantCulture) + "mm"
                + "  (element " + (Owner == null ? "?" : Owner.Value.ToString(CultureInfo.InvariantCulture)) + ")";
        }
    }

    /// <summary>
    /// ⚠⚠ THE FACE-REFERENCE HELPER — every vertical planar face in a set of elements, indexed by
    /// the plane it lies on.
    /// <para>
    /// <b>Why this exists.</b> A face-to-face dimension chain is the NORMAL case in a drawing —
    /// the chains run between wall faces, not wall centrelines — yet building one used to take
    /// about forty lines of plumbing: <c>get_Geometry(new Options { ComputeReferences = true })</c>,
    /// walk to the planar faces, filter by face normal, convert to millimetres, then match each
    /// requested plane to its nearest face by hand. That boilerplate was the single biggest sink in
    /// the 2026-10-14 floor-plan build.
    /// </para>
    /// <para>
    /// <b>How it is used.</b> Harvest once, then resolve planes by position:
    /// <code>
    /// var faces = Doc.FaceRefs();                       // every wall's vertical faces
    /// var refs  = faces.Array("X", 0, 150, 3150, 3265); // a ReferenceArray, ready for NewDimension
    /// </code>
    /// …or skip the index entirely and let <c>ChainDim</c> do both.
    /// </para>
    /// <para>
    /// ⚠ A face whose reference is null is SKIPPED, never guessed at. A dimension built from an
    /// unusable reference does not throw — it silently produces a wrong or empty dimension, which
    /// is worse. Skipped planes are recorded in <see cref="Misses"/>.
    /// </para>
    /// </summary>
    public sealed class FaceRefIndex
    {
        private readonly List<FaceRef> _all = new();
        private readonly List<string> _misses = new();

        /// <summary>
        /// Harvests the vertical planar faces of <paramref name="elements"/>.
        /// <para>⚠ Never throws: an element whose geometry cannot be read is skipped, because a
        /// scan that threw on the first unreadable element would find nothing at all.</para>
        /// </summary>
        /// <param name="elements">The elements to harvest. Usually the walls.</param>
        public FaceRefIndex(IEnumerable<Element> elements)
        {
            if (elements == null) { return; }

            var options = new Options { ComputeReferences = true };
            foreach (Element element in elements)
            {
                if (element == null) { continue; }
                try { Harvest(element, options); }
                catch { /* an unreadable element must not abort the scan */ }
            }
        }

        /// <summary>Every face harvested, in discovery order.</summary>
        public IReadOnlyList<FaceRef> All => _all;

        /// <summary>
        /// Planes that could not be resolved to a face, as <c>"X=3150.0 (nearest 41.3mm away)"</c>.
        /// <para>⚠ Read this after a chain: a chain that quietly lost a plane is a chain whose
        /// segments do not mean what they appear to.</para>
        /// </summary>
        public IReadOnlyList<string> Misses => _misses;

        private void Harvest(Element element, Options options)
        {
            GeometryElement geometry = element.get_Geometry(options);
            if (geometry == null) { return; }

            foreach (GeometryObject item in geometry)
            {
                if (item is Solid solid) { AddSolid(solid, element); continue; }

                // ⚠ A loadable family's solids are NESTED — a top-level pass yields a
                //   GeometryInstance, not a Solid (measured 2026-10-14: a counter's solid scan
                //   returned an empty sentinel until it descended here). Instance geometry carries
                //   no usable Reference, so nothing dimensionable comes out of this branch; it is
                //   here so the index is not silently half-empty for family-hosted geometry.
                if (!(item is GeometryInstance instance)) { continue; }

                GeometryElement inner;
                try { inner = instance.GetInstanceGeometry(); }
                catch { continue; }
                if (inner == null) { continue; }

                foreach (GeometryObject nested in inner)
                {
                    if (nested is Solid nestedSolid) { AddSolid(nestedSolid, element); }
                }
            }
        }

        private void AddSolid(Solid solid, Element owner)
        {
            foreach (Face face in solid.Faces)
            {
                if (!(face is PlanarFace planar)) { continue; }
                if (planar.Reference == null) { continue; }

                XYZ normal = planar.FaceNormal;
                if (Math.Abs(normal.Z) > 1e-6) { continue; }   // a horizontal face is not a plan chain's target

                bool alongX = Math.Abs(normal.X) > 0.5;
                if (!alongX && Math.Abs(normal.Y) < 0.5) { continue; }

                XYZ origin = planar.Origin;
                _all.Add(new FaceRef
                {
                    Owner = owner.Id,
                    Axis = alongX ? "X" : "Y",
                    Mm = (alongX ? origin.X : origin.Y).OutputUnit("mm"),
                    Ref = planar.Reference,
                });
            }
        }

        /// <summary>
        /// The face whose plane sits nearest <paramref name="mm"/> along <paramref name="axis"/>.
        /// <para>⚠ Returns null AND records the miss when the nearest face is further than
        /// <paramref name="toleranceMm"/> away — a "nearest" face 40 mm off is a different plane,
        /// not a rounding error, and dimensioning against it would be silently wrong.</para>
        /// </summary>
        /// <param name="axis">"X" or "Y".</param>
        /// <param name="mm">The plane's position along the axis, in millimetres.</param>
        /// <param name="toleranceMm">How far a face may be and still count as that plane.</param>
        public FaceRef? Nearest(string axis, double mm, double toleranceMm = 2.0)
        {
            string wanted = NormalizeAxis(axis);

            FaceRef? best = null;
            double bestDistance = double.MaxValue;
            foreach (FaceRef candidate in _all)
            {
                if (candidate.Axis != wanted) { continue; }
                double distance = Math.Abs(candidate.Mm - mm);
                if (distance < bestDistance) { bestDistance = distance; best = candidate; }
            }

            if (best == null || bestDistance > toleranceMm)
            {
                _misses.Add(
                    wanted + "=" + mm.ToString("F1", CultureInfo.InvariantCulture)
                    + " (nearest " + (best == null
                        ? "none"
                        : bestDistance.ToString("F1", CultureInfo.InvariantCulture) + "mm away") + ")");
                return null;
            }

            return best;
        }

        /// <summary>
        /// A <see cref="ReferenceArray"/> for the given planes, ready for
        /// <c>Doc.Create.NewDimension</c>. ⚠ Planes that do not resolve are simply absent from the
        /// array — call <see cref="Misses"/> afterwards and refuse to trust a chain that lost one.
        /// </summary>
        /// <param name="axis">"X" or "Y".</param>
        /// <param name="mm">The plane positions, in order, in millimetres.</param>
        public ReferenceArray Array(string axis, params double[] mm)
        {
            _misses.Clear();
            var refs = new ReferenceArray();
            if (mm == null) { return refs; }

            foreach (double plane in mm)
            {
                FaceRef? hit = Nearest(axis, plane);
                if (hit != null) { refs.Append(hit.Ref); }
            }
            return refs;
        }

        /// <summary>
        /// Normalizes an axis spelling to <c>"X"</c> or <c>"Y"</c>.
        /// ⚠ Throws on anything else rather than defaulting: a chain silently laid on the wrong
        /// axis is a chain of plausible-looking wrong numbers.
        /// </summary>
        internal static string NormalizeAxis(string axis)
        {
            string text = (axis ?? string.Empty).Trim().ToUpperInvariant();
            if (text.StartsWith("X", StringComparison.Ordinal)) { return "X"; }
            if (text.StartsWith("Y", StringComparison.Ordinal)) { return "Y"; }
            throw new ArgumentException("Axis must be \"X\" or \"Y\"; got \"" + axis + "\".", nameof(axis));
        }
    }

    /// <summary>
    /// Harvesting entry points — <c>FaceRefs</c> on a collection, on a document, and the two side
    /// faces of a single wall.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// Harvests the vertical planar faces of these elements into a <see cref="FaceRefIndex"/>.
        /// <para>Example: <c>GetElements("Walls").FaceRefs().Array("X", 0, 150, 3150)</c></para>
        /// </summary>
        public static FaceRefIndex FaceRefs(this IEnumerable<Element> elements)
        {
            return new FaceRefIndex(elements);
        }

        /// <summary>
        /// Harvests every WALL in the document — the usual set a plan's dimension chains measure
        /// between.
        /// </summary>
        public static FaceRefIndex FaceRefs(this Document doc)
        {
            if (doc == null) { return new FaceRefIndex(Array.Empty<Element>()); }

            List<Element> walls;
            try
            {
                walls = new FilteredElementCollector(doc)
                    .OfClass(typeof(Wall))
                    .Cast<Element>()
                    .ToList();
            }
            catch
            {
                return new FaceRefIndex(Array.Empty<Element>());
            }
            return new FaceRefIndex(walls);
        }

        /// <summary>
        /// The two SIDE faces of a wall — the ones a plan dimensions between, i.e. the faces whose
        /// normal is perpendicular to the wall's own direction. End caps are excluded.
        /// <para>⚠ Sides are ordered by axis and position, NOT as "left"/"right": which side is
        /// "left" depends on the wall's direction, and a wall drawn right-to-left would swap them.</para>
        /// </summary>
        public static IReadOnlyList<FaceRef> SideFaceRefs(this Wall wall)
        {
            var found = new List<FaceRef>();
            if (wall == null) { return found; }

            if (!(wall.Location is LocationCurve location) || location.Curve == null) { return found; }

            XYZ start = location.Curve.GetEndPoint(0);
            XYZ end = location.Curve.GetEndPoint(1);
            XYZ direction = end - start;
            if (direction.GetLength() < 1e-9) { return found; }
            direction = direction.Normalize();

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (GeometryObject item in wall.get_Geometry(new Options { ComputeReferences = true }))
            {
                if (!(item is Solid solid)) { continue; }
                foreach (Face face in solid.Faces)
                {
                    if (!(face is PlanarFace planar) || planar.Reference == null) { continue; }

                    XYZ normal = planar.FaceNormal;
                    if (Math.Abs(normal.Z) > 1e-6) { continue; }
                    if (Math.Abs((normal.X * direction.X) + (normal.Y * direction.Y)) > 1e-6) { continue; }

                    bool alongX = Math.Abs(normal.X) > 0.5;
                    XYZ origin = planar.Origin;
                    double mm = (alongX ? origin.X : origin.Y).OutputUnit("mm");

                    // ⚠ A wall solid can expose the same plane more than once (a joined or split
                    //   face). Dedupe by plane, or the chain would carry a duplicate reference.
                    if (!seen.Add((alongX ? "X" : "Y") + "|" + mm.ToString("F2", CultureInfo.InvariantCulture)))
                    {
                        continue;
                    }

                    found.Add(new FaceRef
                    {
                        Owner = wall.Id,
                        Axis = alongX ? "X" : "Y",
                        Mm = mm,
                        Ref = planar.Reference,
                    });
                }
            }

            return found;
        }
    }

    /// <summary>
    /// ⚠⚠ THE ONE-CALL DIMENSION CHAIN — a face-to-face chain in a single expression.
    /// </summary>
    public static class ViewDimensionExtensions
    {
        /// <summary>
        /// Dimensions the given model planes on a line offset from them, harvesting the face
        /// references from every wall in the document first.
        /// <para>
        /// Example — the top wall's chain of a 5215 mm envelope, on a line 900 mm above it:
        /// <c>ActiveView.ChainDim("X", 8400, 0, 150, 3150, 3265, 5065, 5215)</c>
        /// </para>
        /// <para>
        /// ⚠ <paramref name="lineMm"/> is the position of the DIMENSION LINE along the other axis
        /// (for <c>"X"</c>, the line's Y). Put it clear of the geometry — a chain laid on top of a
        /// wall is unreadable and, in a plan, collides with the model.
        /// </para>
        /// </summary>
        /// <param name="view">The view to create the dimension in.</param>
        /// <param name="axis">"X" or "Y" — the direction the chain measures along.</param>
        /// <param name="lineMm">Where the dimension line sits, in millimetres, on the other axis.</param>
        /// <param name="planeMm">The model planes to chain, in millimetres, in order.</param>
        public static Dimension ChainDim(this View view, string axis, double lineMm, params double[] planeMm)
        {
            if (view == null) { throw new ArgumentNullException(nameof(view)); }
            return view.ChainDim(view.Document.FaceRefs(), axis, lineMm, planeMm);
        }

        /// <summary>
        /// As the harvesting overload, but against an ALREADY harvested <see cref="FaceRefIndex"/> —
        /// use this for several chains so the model is walked once.
        /// </summary>
        /// <param name="view">The view to create the dimension in.</param>
        /// <param name="faces">A previously harvested face index.</param>
        /// <param name="axis">"X" or "Y" — the direction the chain measures along.</param>
        /// <param name="lineMm">Where the dimension line sits, in millimetres, on the other axis.</param>
        /// <param name="planeMm">The model planes to chain, in millimetres, in order.</param>
        public static Dimension ChainDim(this View view, FaceRefIndex faces, string axis, double lineMm,
                                        params double[] planeMm)
        {
            if (view == null) { throw new ArgumentNullException(nameof(view)); }
            if (faces == null) { throw new ArgumentNullException(nameof(faces)); }
            if (planeMm == null || planeMm.Length < 2)
            {
                throw new ArgumentException("A chain dimension needs at least two planes.", nameof(planeMm));
            }

            string wanted = FaceRefIndex.NormalizeAxis(axis);
            ReferenceArray refs = faces.Array(wanted, planeMm);

            if (refs.Size < 2)
            {
                throw new InvalidOperationException(
                    "ChainDim(" + wanted + "): fewer than two of the requested planes resolved to a"
                    + " face reference, so no dimension was created. Unresolved: "
                    + (faces.Misses.Count == 0 ? "(none recorded)" : string.Join("; ", faces.Misses)));
            }

            Document doc = view.Document;
            double z = view.Origin.Z;
            double low = planeMm.Min();
            double high = planeMm.Max();

            Line line = wanted == "X"
                ? Line.CreateBound(new XYZ(low.InputUnit("mm"), lineMm.InputUnit("mm"), z),
                                   new XYZ(high.InputUnit("mm"), lineMm.InputUnit("mm"), z))
                : Line.CreateBound(new XYZ(lineMm.InputUnit("mm"), low.InputUnit("mm"), z),
                                   new XYZ(lineMm.InputUnit("mm"), high.InputUnit("mm"), z));

            Dimension? made = null;
            void Create() { made = doc.Create.NewDimension(view, line, refs); }

            if (doc.IsModifiable) { Create(); }
            else { _ = Tx.Transact(doc, "ChainDim " + wanted, Create); }

            if (made == null)
            {
                throw new InvalidOperationException(
                    "ChainDim(" + wanted + "): Revit did not create the dimension — the transaction"
                    + " did not commit. Check the view supports dimensions and the line lies in it.");
            }
            return made;
        }
    }
}
