using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using CoreScript.Engine.Core.Clash;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Global API for High-End Clash Detection and Interference Checking.
    /// Provides tiered performance from fast boolean checks to precise volumetric audits.
    /// </summary>
    public static class Clash
    {
        /// <summary>
        /// Finds all elements of a specific category that clash with the given element.
        /// Uses a tiered approach: Broad-phase (Bounding Box) -> Precise-phase (Boolean).
        /// </summary>
        public static IEnumerable<ClashResult> Find(Element element, string categoryName, double toleranceMeters = 0, bool calculateVolume = false)
        {
            if (element == null) return Enumerable.Empty<ClashResult>();

            // 1. Resolve Categories (Handling fragmented Revit categories)
            var targetBIPs = new List<BuiltInCategory>();
            if (!string.IsNullOrEmpty(categoryName))
            {
                var cleanName = categoryName.Replace(" ", "").ToLower();
                
                // Logic Hub for Category Aliases
                if (cleanName == "columns") {
                    targetBIPs.Add(BuiltInCategory.OST_Columns);
                    targetBIPs.Add(BuiltInCategory.OST_StructuralColumns);
                }
                else if (cleanName == "structuralcolumns") targetBIPs.Add(BuiltInCategory.OST_StructuralColumns);
                else if (cleanName == "pipes") targetBIPs.Add(BuiltInCategory.OST_PipeCurves);
                else if (cleanName == "ducts") targetBIPs.Add(BuiltInCategory.OST_DuctCurves);
                else if (Enum.TryParse<BuiltInCategory>(categoryName, true, out var bic)) targetBIPs.Add(bic);
                else if (Enum.TryParse<BuiltInCategory>("OST_" + categoryName.Replace(" ", ""), true, out var bicOst)) targetBIPs.Add(bicOst);
            }

            var collector = new FilteredElementCollector(element.Document);
            if (targetBIPs.Any())
            {
                var filter = new ElementMulticategoryFilter(targetBIPs);
                collector.WherePasses(filter);
            }

            // 2. TIER 1: Broad Phase (Expanded Bounding Box for Soft Clashes)
            var bb = element.get_BoundingBox(null);
            if (bb == null) return Enumerable.Empty<ClashResult>();
            
            // Expand BB if tolerance is provided (Soft Clash detection)
            XYZ min = bb.Min;
            XYZ max = bb.Max;
            if (toleranceMeters > 0)
            {
                double tolFeet = toleranceMeters * 3.28084;
                min = new XYZ(min.X - tolFeet, min.Y - tolFeet, min.Z - tolFeet);
                max = new XYZ(max.X + tolFeet, max.Y + tolFeet, max.Z + tolFeet);
            }
            
            Outline outline = new Outline(min, max);
            collector.WherePasses(new BoundingBoxIntersectsFilter(outline));

            // 3. TIER 2: Precise Phase
            // If tolerance is 0, we use the fast ElementIntersectsElementFilter
            // If tolerance > 0, we allow the BB filter results since a precise distance check is expensive
            if (toleranceMeters <= 0)
            {
                collector.WherePasses(new ElementIntersectsElementFilter(element));
            }

            // 4. Generate Results
            return collector.Where(el => el.Id != element.Id)
                            .Select(other => CreateResult(element, other, toleranceMeters, calculateVolume));
        }

        /// <summary>
        /// Detailed check between two specific elements.
        /// </summary>
        public static ClashResult Check(Element a, Element b, double toleranceMeters = 0, bool calculateVolume = true)
        {
            if (a == null || b == null) return null;
            
            // Fast BB check first
            var bbA = a.get_BoundingBox(null);
            var bbB = b.get_BoundingBox(null);
            if (bbA == null || bbB == null) return null;

            // Expand for tolerance
            double tolFeet = toleranceMeters * 3.28084;
            if (bbA.Min.X - tolFeet > bbB.Max.X || bbA.Max.X + tolFeet < bbB.Min.X ||
                bbA.Min.Y - tolFeet > bbB.Max.Y || bbA.Max.Y + tolFeet < bbB.Min.Y ||
                bbA.Min.Z - tolFeet > bbB.Max.Z || bbA.Max.Z + tolFeet < bbB.Min.Z)
                return null;

            // Physical intersection filter
            if (toleranceMeters <= 0)
            {
                var filter = new ElementIntersectsElementFilter(a);
                if (!filter.PassesFilter(b)) return null;
            }

            return CreateResult(a, b, toleranceMeters, calculateVolume);
        }

        private static ClashResult CreateResult(Element a, Element b, double toleranceMeters, bool calculateVolume)
        {
            var result = new ClashResult
            {
                ElementIdA = a.Id,
                ElementIdB = b.Id,
                NameA = a.Name,
                NameB = b.Name,
                CategoryA = a.Category?.Name ?? "Unknown",
                CategoryB = b.Category?.Name ?? "Unknown",
                // MEP Systems fallback to Level for Arch/Struct coordination context
                SystemA = a.LookupParameter("System Name")?.AsString() ?? a.LookupParameter("System Abbreviation")?.AsString() ?? a.Document.GetElement(a.LevelId)?.Name,
                SystemB = b.LookupParameter("System Name")?.AsString() ?? b.LookupParameter("System Abbreviation")?.AsString() ?? b.Document.GetElement(b.LevelId)?.Name
            };

            // Check if it's "Hard" (actually touching)
            var hardFilter = new ElementIntersectsElementFilter(a);
            bool isHard = hardFilter.PassesFilter(b);
            result.Type = isHard ? ClashType.Hard : ClashType.Soft;

            if (isHard)
            {
                var (vol, centroid) = CalculateIntersectionMetrics(a, b);
                result.IntersectionVolume = vol;
                result.Centroid = centroid;
            }
            else
            {
                // Soft Clash Fallback: Center of the intersection of their Bounding Boxes in pure internal FEET
                var bbA = a.get_BoundingBox(null);
                var bbB = b.get_BoundingBox(null);
                if (bbA != null && bbB != null)
                {
                    result.Centroid = new XYZ(
                        (Math.Max(bbA.Min.X, bbB.Min.X) + Math.Min(bbA.Max.X, bbB.Max.X)) / 2,
                        (Math.Max(bbA.Min.Y, bbB.Min.Y) + Math.Min(bbA.Max.Y, bbB.Max.Y)) / 2,
                        (Math.Max(bbA.Min.Z, bbB.Min.Z) + Math.Min(bbA.Max.Z, bbB.Max.Z)) / 2
                    );
                }
            }

            return result;
        }

        /// <summary>
        /// Performs expensive Boolean Operation to find the exact overlap volume and centroid.
        /// Returns values in Revit Internal Units (Feet).
        /// </summary>
        public static (double volume, XYZ centroid) CalculateIntersectionMetrics(Element a, Element b)
        {
            try
            {
                Options opt = new Options { DetailLevel = ViewDetailLevel.Fine };
                var geomA = a.get_Geometry(opt);
                var geomB = b.get_Geometry(opt);

                if (geomA == null || geomB == null) return (0, null);

                var solidsA = ExtractSolids(geomA);
                var solidsB = ExtractSolids(geomB);

                double totalVol = 0;
                XYZ weightedCentroidSum = new XYZ(0, 0, 0);

                foreach (var solidA in solidsA)
                {
                    if (solidA.Volume <= 0) continue;
                    foreach (var solidB in solidsB)
                    {
                        if (solidB.Volume <= 0) continue;

                        try
                        {
                            var intersection = BooleanOperationsUtils.ExecuteBooleanOperation(solidA, solidB, BooleanOperationsType.Intersect);
                            if (intersection != null && intersection.Volume > 0)
                            {
                                var v = intersection.Volume;
                                totalVol += v;
                                weightedCentroidSum += intersection.ComputeCentroid() * v;
                            }
                        }
                        catch { }
                    }
                }

                XYZ finalCentroid = totalVol > 0 ? weightedCentroidSum / totalVol : null;
                return (totalVol, finalCentroid); 
            }
            catch { return (0, null); }
        }

        private static List<Solid> ExtractSolids(GeometryElement geom)
        {
            var res = new List<Solid>();
            foreach (var obj in geom)
            {
                if (obj is Solid s && s.Volume > 0) res.Add(s);
                else if (obj is GeometryInstance inst)
                {
                    res.AddRange(ExtractSolids(inst.GetInstanceGeometry()));
                }
            }
            return res;
        }
    }
}
