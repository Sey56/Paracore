using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class UnitExtensions
    {
        /// <summary> Converts a value FROM internal Revit units (feet/sqft) to the target unit for display/output. </summary>
        public static double FromUnits(this double value, string unit, int decimals = 2)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return Math.Round(value, decimals);
            double converted = UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            return Math.Round(converted, decimals);
        }

        public static double FromUnits(this int value, string unit, int decimals = 2) => ((double)value).FromUnits(unit, decimals);
        public static double FromUnits(this decimal value, string unit, int decimals = 2) => ((double)value).FromUnits(unit, decimals);

        /// <summary> Converts a value TO internal Revit units (feet/sqft) from the target unit for calculation/input. </summary>
        public static double ToUnits(this double value, string unit)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return value;
            return UnitUtils.ConvertToInternalUnits(value, unitTypeId);
        }

        public static double ToUnits(this int value, string unit) => ((double)value).ToUnits(unit);
        public static double ToUnits(this decimal value, string unit) => ((double)value).ToUnits(unit);

        public static string FormatUnit(this double value, string unit, int decimals = 2)
        {
            double converted = value.FromUnits(unit);
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
