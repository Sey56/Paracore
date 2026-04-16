using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using CoreScript.Engine.Core.Sustain;
using RestSharp;
using System.Text.Json;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Provides global sustainability and energy analysis tools for Paracore scripts.
    /// Access via 'Eco.MethodName()'.
    /// </summary>
    public static class Eco
    {
        private static readonly CarbonProvider _carbonProvider = new CarbonProvider();
        private static readonly ThermalSolver _thermalSolver = new ThermalSolver();

        /// <summary>
        /// Calculates the Embodied Carbon (kgCO2e) for a Revit element.
        /// Accounts for volume, material density, and emission factors.
        /// </summary>
        public static double GetCarbon(Element element)
        {
            if (element == null) return 0;

            // Handle Curtain Walls (Traverse Grid sub-elements recursively)
            if (element is Wall wall && wall.WallType.Kind == WallKind.Curtain)
            {
                double totalAggregatedCarbon = 0;
                var grid = wall.CurtainGrid;
                if (grid != null)
                {
                    // 1. Audit all Panels (Glazed, Solid, or Doors/Windows)
                    foreach (ElementId id in grid.GetPanelIds())
                    {
                        var panel = element.Document.GetElement(id);
                        totalAggregatedCarbon += GetCarbon(panel);
                    }
                    
                    // 2. Audit all Mullions
                    foreach (ElementId id in grid.GetMullionIds())
                    {
                        var mullion = element.Document.GetElement(id);
                        totalAggregatedCarbon += GetCarbon(mullion);
                    }
                }
                
                // If we found sub-element data, return it; otherwise fallback to host area
                if (totalAggregatedCarbon > 0) return totalAggregatedCarbon;
            }

            // Handle Host Objects with Compound Structures (Walls, Floors, Roofs)
            var hostObj = element as HostObject;
            if (hostObj != null)
            {
                var type = element.Document.GetElement(element.GetTypeId()) as HostObjAttributes;
                var structure = type?.GetCompoundStructure();

                if (structure != null)
                {
                    double totalCarbon = 0;
                    double areaM2 = GetAreaM2(element);
                    foreach (var layer in structure.GetLayers())
                    {
                        var matId = layer.MaterialId;
                        var material = matId != ElementId.InvalidElementId 
                                        ? element.Document.GetElement(matId) as Material 
                                        : null;

                        double thicknessM = layer.Width * 0.3048; // Feet to Meters
                        double volumeM3 = areaM2 * thicknessM;
                        
                        // CarbonProvider now handles null materials with safe construction defaults
                        double density = _carbonProvider.GetDensity(material);
                        double intensity = _carbonProvider.GetIntensityPerKg(material);

                        totalCarbon += volumeM3 * density * intensity;
                    }

                    if (totalCarbon > 0) return totalCarbon;
                }
            }

            // Fallback for single-material elements OR HostObjects with failing layer data
            var pVolume = element.get_Parameter(BuiltInParameter.HOST_VOLUME_COMPUTED) ?? 
                          element.LookupParameter("Volume");
            
            if (pVolume != null && pVolume.HasValue)
            {
                double volM3 = pVolume.AsDouble() * 0.0283168; // CuFt to CuM
                
                // For single-material fallback, we try to find the dominant material
                var material = element.Document.GetElement(element.Document.GetElement(element.GetTypeId())?.get_Parameter(BuiltInParameter.STRUCTURAL_MATERIAL_PARAM)?.AsElementId() ?? ElementId.InvalidElementId) as Material;
                
                double density = _carbonProvider.GetDensity(material);
                double intensity = _carbonProvider.GetIntensityPerKg(material);

                return volM3 * density * intensity;
            }

            return 0;
        }

        /// <summary>
        /// Gets the U-Value (W/m2K) of an element (Wall, Floor, Roof, Window).
        /// </summary>
        public static double GetUValue(Element element)
        {
            return _thermalSolver.CalculateUValue(element);
        }

        /// <summary>
        /// Fetches live weather data for the project location using the Open-Meteo API.
        /// </summary>
        /// <returns>A dynamic object containing Temperature, WindSpeed, etc.</returns>
        public static dynamic GetWeather()
        {
            var doc = ExecutionGlobals.Current.Value?.Doc;
            if (doc == null) return new { Error = "No active document" };

            var site = doc.SiteLocation;
            double lat = site.Latitude * 180 / Math.PI;
            double lon = site.Longitude * 180 / Math.PI;

            var client = new RestClient("https://api.open-meteo.com/v1");
            var request = new RestRequest("forecast");
            request.AddParameter("latitude", lat);
            request.AddParameter("longitude", lon);
            request.AddParameter("current_weather", "true");

            var response = client.Get(request);
            if (response.IsSuccessful && response.Content != null)
            {
                var data = JsonDocument.Parse(response.Content);
                var current = data.RootElement.GetProperty("current_weather");
                
                return new {
                    Temperature = current.GetProperty("temperature").GetDouble(),
                    WindSpeed = current.GetProperty("windspeed").GetDouble(),
                    WindDirection = current.GetProperty("winddirection").GetDouble(),
                    WeatherCode = current.GetProperty("weathercode").GetInt32(),
                    Time = current.GetProperty("time").GetString(),
                    Latitude = lat,
                    Longitude = lon
                };
            }

            return new { Error = "API Request Failed", Status = response.ResponseStatus };
        }

        private static double GetAreaM2(Element element)
        {
            var pArea = element.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED) ?? 
                        element.LookupParameter("Area");

            return (pArea != null && pArea.HasValue) ? pArea.AsDouble() * 0.092903 : 0;
        }
    }
}
