using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Quantity TakeOff extension methods for Paracore.
    /// Provides material extraction, formwork computation, compound structure
    /// analysis, and structured room data — all in fluent one-liners.
    ///
    /// These are commercial extensions. In production, each method gates behind
    /// LicenseContext.RequireEnterprise("TakeOff") or similar.
    /// </summary>
    public static class TakeOffExtensions
    {
        // ── Material Quantities ──────────────────────────────────────────

        /// <summary>
        /// Extracts material quantities from elements: material name, total volume
        /// (m³), total area (m²), and element count. Groups and sums by material.
        /// Usage: GetElements("Walls").GetMaterialQuantities().Table()
        /// </summary>
        public static IEnumerable<object> GetMaterialQuantities(this IEnumerable<Element> elements)
        {
            var results = new List<(string Material, double Volume, double Area)>();

            foreach (var el in elements)
            {
                if (el == null) continue;
                var mats = el.MaterialNames().ToList();
                foreach (var mat in mats)
                {
                    var vol = el.GetNum("Volume", "m3");
                    var area = el.GetNum("Area", "m2");
                    results.Add((mat, vol, area));
                }
            }

            return results
                .GroupBy(r => r.Material)
                .Select(g => new
                {
                    Material = g.Key,
                    TotalVolume_m3 = Math.Round(g.Sum(r => r.Volume), 3),
                    TotalArea_m2 = Math.Round(g.Sum(r => r.Area), 3),
                    ElementCount = g.Count()
                })
                .OrderByDescending(r => r.TotalVolume_m3);
        }

        /// <summary>
        /// Returns per-element material breakdown with Id and name.
        /// Usage: GetElements("Walls").Take(100).GetMaterialBreakdown().Table()
        /// </summary>
        public static IEnumerable<object> GetMaterialBreakdown(this IEnumerable<Element> elements)
        {
            foreach (var el in elements)
            {
                if (el == null) continue;
                var mats = el.MaterialNames().ToList();
                foreach (var mat in mats)
                {
                    yield return new
                    {
                        ElementId = el.Id.IntegerValue,
                        ElementName = el.GetStr("Name"),
                        Material = mat,
                        Volume_m3 = el.GetNum("Volume", "m3"),
                        Area_m2 = el.GetNum("Area", "m2")
                    };
                }
            }
        }

        // ── Compound Structure ───────────────────────────────────────────

        /// <summary>
        /// Extracts layer-by-layer composition of wall/floor/roof/ceiling types.
        /// Usage: GetElements("WallType").GetCompoundStructureLayers().Table()
        /// </summary>
        public static IEnumerable<object> GetCompoundStructureLayers(this IEnumerable<ElementType> types)
        {
            foreach (var typ in types)
            {
                if (typ == null) continue;
                if (typ is not HostObjAttributes hostAttrs) continue;
                var cs = hostAttrs.GetCompoundStructure();
                if (cs == null) continue;

                foreach (var layer in cs.GetLayers())
                {
                    var mat = typ.Document.GetElement(layer.MaterialId);
                    yield return new
                    {
                        TypeName = typ.Name,
                        LayerFunction = layer.Function.ToString(),
                        Material = mat?.Name ?? "Unknown",
                        Thickness_mm = Math.Round(UnitUtils.ConvertFromInternalUnits(layer.Width, UnitTypeId.Millimeters), 1)
                    };
                }
            }
        }

        // ── Formwork ─────────────────────────────────────────────────────

        /// <summary>
        /// Computes shuttering/formwork area (m²) for concrete elements.
        /// Columns: perimeter × height × 2 (both sides of rectangular column).
        /// Walls/Slabs: 2 × face area.
        /// Usage: GetElements("Structural Columns").ComputeFormwork().Table()
        /// </summary>
        public static IEnumerable<object> ComputeFormwork(this IEnumerable<Element> elements)
        {
            foreach (var el in elements)
            {
                if (el == null) continue;
                double formwork = 0;

                // Column: perimeter × height, approximation from b × h dimensions
                var bParam = el.GetNum("b", "mm");
                var hParam = el.GetNum("h", "mm");
                var length = el.GetNum("Length", "m");

                if (bParam > 0 && hParam > 0 && length > 0)
                {
                    // Rectangular column: 2 sides (b+h) × height
                    var perimeterM = (bParam + hParam) * 2 / 1000.0; // mm → m
                    formwork = Math.Round(perimeterM * length, 3);
                }
                else
                {
                    // Non-column: 2 × face area
                    var area = el.GetNum("Area", "m2");
                    if (area > 0)
                        formwork = Math.Round(area * 2, 3);
                }

                if (formwork > 0)
                {
                    yield return new
                    {
                        ElementId = el.Id.IntegerValue,
                        Name = el.GetStr("Name"),
                        Level = el.GetStr("Level"),
                        Formwork_m2 = formwork
                    };
                }
            }
        }

        // ── Room Data ────────────────────────────────────────────────────

        /// <summary>
        /// Extracts room data: name, number, area (m²), perimeter (m), volume (m³).
        /// Usage: GetElements<Room>().GetRoomData().Table()
        /// </summary>
        public static IEnumerable<object> GetRoomData(this IEnumerable<Room> rooms)
        {
            return rooms.Select(r => new
            {
                r.Id,
                Name = r.GetStr("Name"),
                Number = r.GetStr("Number"),
                Level = r.GetStr("Level"),
                Area_m2 = Math.Round(UnitUtils.ConvertFromInternalUnits(r.Area, UnitTypeId.SquareMeters), 2),
                Perimeter_m = Math.Round(UnitUtils.ConvertFromInternalUnits(r.Perimeter, UnitTypeId.Meters), 2),
                Volume_m3 = r.GetNum("Volume", "m3")
            }).OrderBy(r => r.Level).ThenByDescending(r => r.Area_m2);
        }

        // ── Counts ───────────────────────────────────────────────────────

        /// <summary>
        /// Counts elements grouped by family type name.
        /// Usage: GetElements("Doors").GetCountsByType().Table()
        /// </summary>
        public static IEnumerable<object> GetCountsByType(this IEnumerable<Element> elements)
        {
            return elements
                .GroupBy(e => e.GetStr("Family and Type"))
                .Select(g => new { Type = g.Key, Count = g.Count() })
                .OrderByDescending(r => r.Count);
        }

        // ── Category Discovery ───────────────────────────────────────────

        /// <summary>
        /// Lists all model categories with element counts.
        /// Usage: Doc.GetModelCategoryCounts().Table() or GetCategoriesWithCounts().Table()
        /// </summary>
        public static IEnumerable<object> GetModelCategoryCounts(this Document doc)
        {
            var cats = doc.Settings.Categories.Cast<Category>().Select(c => c.Name);
            foreach (var cat in cats)
            {
                var count = new FilteredElementCollector(doc)
                    .OfCategoryId(doc.Settings.Categories.get_Item(cat).Id)
                    .WhereElementIsNotElementType()
                    .GetElementCount();

                if (count > 0)
                    yield return new { Category = cat, Count = count };
            }
        }

        // ── Element Summary ──────────────────────────────────────────────

        /// <summary>
        /// Returns a summary of elements with basic info: Id, Name, Level, Type.
        /// Usage: GetElements("Walls").GetElementSummary(200).Table()
        /// </summary>
        public static IEnumerable<object> GetElementSummary(this IEnumerable<Element> elements, int maxCount = 200)
        {
            return elements.Take(maxCount).Select(e => new
            {
                Id = e.Id.IntegerValue,
                Name = e.GetStr("Name"),
                Level = e.GetStr("Level"),
                Type = e.GetStr("Family and Type")
            });
        }
    }
}
