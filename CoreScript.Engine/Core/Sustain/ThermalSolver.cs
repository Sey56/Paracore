using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using MathNet.Numerics;

namespace CoreScript.Engine.Core.Sustain
{
    /// <summary>
    /// Performs thermal analysis on Revit elements.
    /// Uses MathNet for numerical operations where required.
    /// </summary>
    public class ThermalSolver
    {
        // Default film resistances (R-values in m2K/W)
        private const double R_INTERNAL_FILM = 0.13; 
        private const double R_EXTERNAL_FILM = 0.04;

        /// <summary>
        /// Calculates the U-Value (W/m2K) of a host element (Wall, Floor, Roof).
        /// Iterates through the compound structure layers.
        /// </summary>
        public double CalculateUValue(Element element)
        {
            if (element == null) return 0;

            // Handle Curtain Walls (Area-weighted average of all panels)
            if (element is Wall wall && wall.WallType.Kind == WallKind.Curtain)
            {
                var grid = wall.CurtainGrid;
                if (grid != null)
                {
                    double sumUA = 0;
                    double totalArea = 0;

                    foreach (ElementId id in grid.GetPanelIds())
                    {
                        var panel = wall.Document.GetElement(id);
                        if (panel == null) continue;

                        double u = CalculateUValue(panel);
                        double a = GetArea(panel);
                        
                        // Panels often have extremely high default U-values if unassigned.
                        // We filter for plausible data to avoid poisoning the average.
                        if (u > 0)
                        {
                            sumUA += u * a;
                            totalArea += a;
                        }
                    }

                    if (totalArea > 0) return sumUA / totalArea;
                }
                
                // Fallback to type parameter if grid is empty or failing
                var typeU = element.LookupParameter("Heat Transfer Coefficient (U)") ?? 
                            element.LookupParameter("U-Value") ?? 
                            element.LookupParameter("Heat Transfer Coefficient");
                
                if (typeU != null && typeU.HasValue) return typeU.AsDouble();
            }

            // Handle Host Objects with Compound Structures
            var hostObj = element as HostObject;
            if (hostObj != null)
            {
                var type = element.Document.GetElement(element.GetTypeId()) as HostObjAttributes;
                var structure = type?.GetCompoundStructure();

                if (structure != null)
                {
                    double totalR = R_INTERNAL_FILM + R_EXTERNAL_FILM;

                    foreach (var layer in structure.GetLayers())
                    {
                        var materialId = layer.MaterialId;
                        var material = materialId != ElementId.InvalidElementId 
                                        ? element.Document.GetElement(materialId) as Material 
                                        : null;

                        double conductivity = GetThermalConductivity(material);
                        double thicknessMeters = layer.Width * 0.3048; // Feet to Meters

                        if (conductivity > 0)
                        {
                            totalR += thicknessMeters / conductivity;
                        }
                    }

                    return 1.0 / totalR;
                }
            }

            // Handle Windows/Curtain Panels (resilient string-based lookup for Revit 2025+)
            var pUValue = element.LookupParameter("Heat Transfer Coefficient (U)") ?? 
                          element.LookupParameter("U-Value") ??
                          element.LookupParameter("Heat Transfer Coefficient") ??
                          element.LookupParameter("Thermal Transmittance (U)");

            if (pUValue != null && pUValue.HasValue)
            {
                return pUValue.AsDouble(); 
            }

            // NEW: Look upward to the Type if Instance data is missing
            var typeId = element.GetTypeId();
            if (typeId != ElementId.InvalidElementId)
            {
                var type = element.Document.GetElement(typeId);
                var pTypeU = type?.LookupParameter("Heat Transfer Coefficient (U)") ?? 
                             type?.LookupParameter("U-Value") ??
                             type?.LookupParameter("Heat Transfer Coefficient") ??
                             type?.LookupParameter("Thermal Transmittance (U)");

                if (pTypeU != null && pTypeU.HasValue)
                {
                    return pTypeU.AsDouble();
                }
            }

            return 0;
        }

        /// <summary>
        /// Calculates steady-state heat loss (Watts) for an element.
        /// Q = U * A * DeltaT
        /// </summary>
        public double CalculateHeatLoss(Element element, double deltaT)
        {
            double uValue = CalculateUValue(element);
            double area = GetArea(element);

            return uValue * area * deltaT;
        }

        private double GetThermalConductivity(Material material)
        {
            if (material == null) return 0.15; // Default for "Generic" construction material (e.g., masonry/timber average)

            var assetId = material.ThermalAssetId;
            if (assetId != ElementId.InvalidElementId)
            {
                var pse = material.Document.GetElement(assetId) as PropertySetElement;
                if (pse != null)
                {
                    var asset = pse.GetThermalAsset();
                    if (asset.ThermalConductivity > 0) return asset.ThermalConductivity;
                }
            }

            // Fallback heuristics based on name if no thermal asset is defined
            string name = material.Name.ToLower();
            if (name.Contains("brick")) return 0.8;
            if (name.Contains("concrete")) return 1.5;
            if (name.Contains("insulation") || name.Contains("wool")) return 0.04;
            if (name.Contains("gypsum") || name.Contains("plaster")) return 0.17;
            if (name.Contains("wood") || name.Contains("timber")) return 0.13;
            if (name.Contains("steel")) return 50.0;
            if (name.Contains("air")) return 0.025;

            return 0.15; // General fallback
        }

        private double GetArea(Element element)
        {
            var pArea = element.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED) ?? 
                        element.LookupParameter("Area");

            if (pArea != null && pArea.HasValue)
            {
                // Convert square feet to square meters
                return pArea.AsDouble() * 0.092903;
            }

            return 0;
        }
    }
}
