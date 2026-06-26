using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Door/window orientation helpers — room adjacency, handing, hinge side,
    /// swing arc detection, curtain-wall filtering.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary> Returns the Room the door leads FROM. Stable regardless of flips. </summary>
        public static string RoomFrom(this Element e) => e.GetRoomNames().From;

        /// <summary> Returns the Room the door leads TO. Stable regardless of flips. </summary>
        public static string RoomTo(this Element e) => e.GetRoomNames().To;

        /// <summary> Gets the name of the "Access Room". </summary>
        public static string RoomAccess(this Element e) => e.GetRoomNames().From;

        /// <summary> Gets the name of the "Destination Room". </summary>
        public static string RoomDestination(this Element e) => e.GetRoomNames().To;

        private static (string From, string To) GetRoomNames(this Element e)
        {
            if (e == null) return ("-", "-");

            try
            {
                var doc = e.Document;
                var phaseId = e.CreatedPhaseId;
                if (phaseId == ElementId.InvalidElementId)
                    phaseId = doc.GetElement(e.GetTypeId())?.CreatedPhaseId ?? ElementId.InvalidElementId;

                var phase = doc.GetElement(phaseId) as Phase;

                XYZ? loc = null;
                if (e is FamilyInstance fi) loc = (fi.Location as LocationPoint)?.Point;
                else if (e is Panel panel) loc = (panel.Location as LocationPoint)?.Point;

                if (loc == null) return ("-", "-");

                XYZ? facing = null;
                if (e is FamilyInstance fi2) facing = fi2.FacingOrientation.Normalize();
                else if (e is Panel panel2) facing = panel2.FacingOrientation.Normalize();

                if (facing == null) return ("-", "-");

                var zOffset = new XYZ(0, 0, 3.0);
                var probeA = loc + (facing * 2.5) + zOffset;
                var probeB = loc - (facing * 2.5) + zOffset;

                var roomA = doc.GetRoomAtPoint(probeA, phase);
                var roomB = doc.GetRoomAtPoint(probeB, phase);
                var nameA = roomA?.Name ?? "External";
                var nameB = roomB?.Name ?? "External";

                var arc = e.FindSwingArc();
                if (arc == null) return (nameB, nameA);

                var swingMid = arc.Evaluate(0.5, true);
                double distA = swingMid.DistanceTo(probeA);
                double distB = swingMid.DistanceTo(probeB);

                return distA < distB ? (nameB, nameA) : (nameA, nameB);
            }
            catch { return ("-", "-"); }
        }

        /// <summary> Returns industry standard handing (LH or RH). </summary>
        public static string Handing(this Element e)
        {
            if (e == null) return "-";
            var arc = e.FindSwingArc();

            if (arc == null)
            {
                if (e is FamilyInstance fi) return fi.HandFlipped ? "RH" : "LH";
                return "-";
            }

            XYZ? loc = null;
            if (e is FamilyInstance fi2) loc = (fi2.Location as LocationPoint)?.Point;
            else if (e is Panel panel) loc = (panel.Location as LocationPoint)?.Point;

            if (loc == null) return "-";

            var rooms = e.GetRoomNames();

            XYZ? facing = null;
            if (e is FamilyInstance fi3) facing = fi3.FacingOrientation.Normalize();
            else if (e is Panel panel2) facing = panel2.FacingOrientation.Normalize();

            if (facing == null) return "-";

            var probeA = loc + (facing * 2.5);
            var phaseId = e.CreatedPhaseId;
            var roomA = e.Document.GetRoomAtPoint(new XYZ(probeA.X, probeA.Y, loc.Z + 3.0), e.Document.GetElement(phaseId) as Phase);
            var nameA = roomA?.Name ?? "External";

            var toFrom = (rooms.From == nameA) ? facing : -facing;
            var lookDir = -toFrom;

            var hinge = arc.Center;
            var toHinge = (hinge - loc).Normalize();

            var rightVector = lookDir.CrossProduct(XYZ.BasisZ);
            bool isRight = rightVector.DotProduct(toHinge) > 0;

            return isRight ? "RH" : "LH";
        }

        /// <summary> Returns "Left" or "Right" hinge side as seen from the Access room. </summary>
        public static string HingeSide(this Element e)
        {
            var handing = e.Handing();
            if (handing.StartsWith("LH")) return "Left";
            if (handing.StartsWith("RH")) return "Right";
            return "-";
        }

        public static Arc? FindSwingArc(this Element e)
        {
            var doc = e.Document;
            var view = doc.ActiveView;

            if (view == null || (view.ViewType != ViewType.FloorPlan && view.ViewType != ViewType.AreaPlan && view.ViewType != ViewType.CeilingPlan))
            {
                var levelId = e.LevelId;
                var allPlanViews = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<ViewPlan>();
                view = allPlanViews.FirstOrDefault(v => v.GenLevel?.Id == levelId && !v.IsTemplate)
                       ?? allPlanViews.FirstOrDefault(v => !v.IsTemplate);
            }

            if (view == null) return null;

            var options = new Options
            {
                IncludeNonVisibleObjects = true,
                View = view
            };

            var geom = e.get_Geometry(options);
            if (geom == null) return null;

            return ScanForArcRecursive(geom, Transform.Identity);
        }

        private static Arc? ScanForArcRecursive(GeometryElement geom, Transform tr)
        {
            Arc? bestArc = null;
            if (geom == null) return null;

            foreach (var obj in geom)
            {
                if (obj == null) continue;

                if (obj is Arc arc)
                {
                    var worldArc = arc.CreateTransformed(tr) as Arc;
                    if (worldArc != null && worldArc.Radius > 0.5)
                    {
                        if (bestArc == null || worldArc.Radius > bestArc.Radius)
                            bestArc = worldArc;
                    }
                }
                else if (obj is GeometryInstance inst)
                {
                    var subTr = tr.Multiply(inst.Transform);
                    var subArc = ScanForArcRecursive(inst.GetSymbolGeometry(), subTr);
                    if (subArc != null && (bestArc == null || subArc.Radius > bestArc.Radius))
                        bestArc = subArc;
                }
            }
            return bestArc;
        }

        public static bool IsHandFlipped(this FamilyInstance fi) => fi?.HandFlipped ?? false;
        public static bool IsFacingFlipped(this FamilyInstance fi) => fi?.FacingFlipped ?? false;

        /// <summary>
        /// Returns true if the FamilyInstance is a standard door (not in a Curtain Wall).
        /// </summary>
        public static bool IsStandardDoor(this FamilyInstance fi)
        {
            if (fi == null) return false;
            return !(fi.Host is Wall w && w.WallType.Kind == WallKind.Curtain);
        }

        /// <summary>
        /// Filters a collection of FamilyInstance elements to only standard doors,
        /// excluding Curtain Wall hosted panels.
        /// </summary>
        public static IEnumerable<FamilyInstance> StandardDoor(this IEnumerable<FamilyInstance> elements)
        {
            var list = elements.Where(fi => fi.IsStandardDoor()).ToList();
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }
    }
}
