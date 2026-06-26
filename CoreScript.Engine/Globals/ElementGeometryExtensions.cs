using Autodesk.Revit.DB;
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
    }
}
