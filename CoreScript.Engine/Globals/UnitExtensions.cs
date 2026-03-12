using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class UnitExtensions
    {
        /// <summary> 
        /// Converts a value FROM an external unit TO Revit's internal units (feet/sqft).
        /// Used for inputs (e.g. "10 meters to internal").
        /// </summary>
        public static double ToInternal(this double value, string unit)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return value;
            return UnitUtils.ConvertToInternalUnits(value, unitTypeId);
        }

        public static double ToInternal(this int value, string unit) => ((double)value).ToInternal(unit);
        public static double ToInternal(this decimal value, string unit) => ((double)value).ToInternal(unit);

        /// <summary> 
        /// Converts an internal Revit value (feet/sqft) TO an external unit for display.
        /// Used for outputs (e.g. "internal area to square meters").
        /// </summary>
        public static double ToExternal(this double value, string unit, int decimals = 2)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return Math.Round(value, decimals);
            double converted = UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            return Math.Round(converted, decimals);
        }

        public static double ToExternal(this int value, string unit, int decimals = 2) => ((double)value).ToExternal(unit, decimals);
        public static double ToExternal(this decimal value, string unit, int decimals = 2) => ((double)value).ToExternal(unit, decimals);

        public static string FormatUnit(this double value, string unit, int decimals = 2)
        {
            double converted = value.ToExternal(unit);
            return $"{Math.Round(converted, decimals)} {unit}";
        }

        public static ForgeTypeId? GetUnitTypeId(string unit)
        {
            string u = unit.ToLower().Trim();
            if (u == "mm" || u == "millimeter" || u == "millimeters") return UnitTypeId.Millimeters;
            if (u == "cm" || u == "centimeter" || u == "centimeters") return UnitTypeId.Centimeters;
            if (u == "m" || u == "meter" || u == "meters") return UnitTypeId.Meters;
            if (u == "ft" || u == "foot" || u == "feet") return UnitTypeId.Feet;
            if (u == "in" || u == "inch" || u == "inches") return UnitTypeId.Inches;
            if (u == "m2" || u == "sqm" || u == "square meter" || u == "square meters" || u == "m²" || u == "sq.m") return UnitTypeId.SquareMeters;
            if (u == "ft2" || u == "sqft" || u == "square foot" || u == "square feet" || u == "ft²" || u == "sq.ft") return UnitTypeId.SquareFeet;
            if (u == "m3" || u == "cum" || u == "cubic meter" || u == "cubic meters" || u == "m³" || u == "cu.m") return UnitTypeId.CubicMeters;
            if (u == "ft3" || u == "cuft" || u == "cubic foot" || u == "cubic feet" || u == "ft³" || u == "cu.ft") return UnitTypeId.CubicFeet;
            return null;
        }
    }
}
