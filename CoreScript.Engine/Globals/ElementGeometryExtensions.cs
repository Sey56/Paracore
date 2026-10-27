using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Geometry analysis — recursive solid/curve/arc extraction.
    /// </summary>
    public static partial class ElementExtensions
    {
        /// <summary>
        /// Gets a recursive summary of the element's geometry (Solids, Curves, Arcs).
        /// Automatically accumulates transformations to provide World-Space results.
        /// </summary>
        public static List<object> GeometrySummary(this Element e)
        {
            var summary = new List<object>();
            if (e == null) return summary;

            var options = new Options
            {
                IncludeNonVisibleObjects = true,
                View = e.Document.ActiveView
            };

            var geom = e.get_Geometry(options);
            if (geom != null) ScanGeometryRecursive(e.Document, geom, Transform.Identity, summary, "Base");

            return summary;
        }

        private static void ScanGeometryRecursive(Document doc, GeometryElement geom, Transform tr, List<object> summary, string source)
        {
            // ⚠⚠ THE ENGINE'S ONLY LEGITIMATE UNBOUNDED RECURSION. A nested family is a
            //   GeometryInstance holding more GeometryInstances, so the depth is a property of the
            //   MODEL, not a mistake — 40 levels is ordinary and must keep working. A fixed depth
            //   cap would therefore break real work, which is why the guard measures remaining
            //   STACK instead of depth: deep nesting passes, and a cycle (an instance that contains
            //   itself, directly or through its symbol) throws a catchable exception instead of
            //   killing Revit with 0xc00000fd.
            using var _guard = Runtime.ScriptGuard.Enter("ScanGeometryRecursive");

            foreach (var obj in geom)
            {
                if (obj == null) continue;

                if (obj is Solid solid && solid.Volume > 0)
                {
                    summary.Add(new
                    {
                        Type = "Solid",
                        Source = source,
                        Material = solid.Faces.Size > 0 ? (doc.GetElement(solid.Faces.get_Item(0).MaterialElementId)?.Name ?? "-") : "-",
                        Volume = Math.Round(solid.Volume, 4) + " CF",
                        Area = Math.Round(solid.SurfaceArea, 4) + " SF",
                        Faces = solid.Faces.Size,
                        Edges = solid.Edges.Size
                    });
                }
                else if (obj is Curve curve)
                {
                    var worldCurve = curve.CreateTransformed(tr);
                    summary.Add(new
                    {
                        Type = worldCurve is Arc ? "Arc" : "Curve (Line)",
                        Source = source,
                        Material = "-",
                        Volume = "-",
                        Area = "-",
                        Faces = "-",
                        Edges = "Length: " + Math.Round(worldCurve.Length, 4) + " ft"
                    });
                }
                else if (obj is PolyLine polyline)
                {
                    summary.Add(new
                    {
                        Type = "PolyLine",
                        Source = source,
                        Material = "-",
                        Volume = "-",
                        Area = "-",
                        Faces = "-",
                        Edges = "Vertices: " + polyline.GetCoordinates().Count
                    });
                }
                else if (obj is GeometryInstance inst)
                {
                    var subTr = tr.Multiply(inst.Transform);
                    ScanGeometryRecursive(doc, inst.GetSymbolGeometry(), subTr, summary, "Symbol: " + source);
                }
            }
        }

        /// <summary>
        /// The room's vertical span in project Z, in internal units (feet).
        /// <para>
        /// <c>Bot</c> = the room's level elevation plus its <c>Base Offset</c>.
        /// <c>Top</c> = <c>Bot</c> + <see cref="Room.UnboundedHeight"/>, which is
        /// Revit's own value and already folds in the <c>Upper Limit</c> and
        /// <c>Limit Offset</c> — so it is correct whether the upper limit is a
        /// different level with an offset (3.00 − 0.15 = 2.85) or the room's own
        /// level with a positive one (0.00 + 2.85 = 2.85).
        /// </para>
        /// <para>
        /// ⚠ <c>UnboundedHeight</c> is the height to the upper-limit PLANE. It does
        /// not know about geometry intruding into the room, so it is the design
        /// band, not an as-built bounded height.
        /// </para>
        /// <para>
        /// Revit reports a non-positive <c>UnboundedHeight</c> for a room that is
        /// unplaced or not properly enclosed, so that case falls back to the
        /// level/upper-limit arithmetic the UI uses. The degenerate guard is kept
        /// from the original call sites.
        /// </para>
        /// </summary>
        public static (double Bot, double Top) GetZSpan(this Room room)
        {
            if (room == null) return (0, 10);

            var level = room.Level;
            double levelZ = level?.Elevation ?? 0;
            double bot = levelZ + room.BaseOffset;

            double h = room.UnboundedHeight;
            if (!(h > 0))
            {
                double upOff = room.get_Parameter(BuiltInParameter.ROOM_UPPER_OFFSET)?.AsDouble() ?? 0;
                var upLvl = room.UpperLimit;
                h = (upLvl?.Elevation ?? levelZ) + upOff - levelZ;
            }

            double top = bot + h;
            if (top <= bot) top = bot + 10;
            return (bot, top);
        }
    }
}
