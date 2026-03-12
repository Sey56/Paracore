using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class UnitExtensions
    {
        /// <summary> 
        /// Converts an input value FROM the specified unit TO Revit's internal units (feet/sqft).
        /// Example: 10.Input("m2") -> converts 10 sqm to internal sqft.
        /// </summary>
        public static double Input(this double value, string unit)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return value;
            return UnitUtils.ConvertToInternalUnits(value, unitTypeId);
        }

        public static double Input(this int value, string unit) => ((double)value).Input(unit);
        public static double Input(this decimal value, string unit) => ((double)value).Input(unit);

        /// <summary> 
        /// Converts an internal Revit value (feet/sqft) TO the specified unit for output/display.
        /// Example: room.Area.Output("m2") -> converts internal sqft to sqm.
        /// </summary>
        public static double Output(this double value, string unit, int decimals = 2)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return Math.Round(value, decimals);
            double converted = UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            return Math.Round(converted, decimals);
        }

        public static double Output(this int value, string unit, int decimals = 2) => ((double)value).Output(unit, decimals);
        public static double Output(this decimal value, string unit, int decimals = 2) => ((double)value).Output(unit, decimals);

        // --- Backward Compatibility Aliases ---
        public static double ToInternal(this double v, string u) => v.Input(u);
        public static double ToExternal(this double v, string u, int d = 2) => v.Output(u, d);
        public static double ToUnits(this double v, string u) => v.Input(u);
        public static double FromUnits(this double v, string u, int d = 2) => v.Output(u, d);

        public static string FormatUnit(this double value, string unit, int decimals = 2)
        {
            double converted = value.Output(unit);
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
