using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class UnitExtensions
    {
        public static double ToUnit(this double value, string unit)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return value;
            return UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
        }

        public static double FromUnit(this double value, string unit)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return value;
            return UnitUtils.ConvertToInternalUnits(value, unitTypeId);
        }

        public static string FormatUnit(this double value, string unit, int decimals = 2)
        {
            double converted = value.ToUnit(unit);
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
            if (u == "m2" || u == "sqm" || u == "squaremeter" || u == "squaremeters") return UnitTypeId.SquareMeters;
            if (u == "ft2" || u == "sqft" || u == "squarefoot" || u == "squarefeet") return UnitTypeId.SquareFeet;
            if (u == "m3" || u == "cum" || u == "cubicmeter" || u == "cubicmeters") return UnitTypeId.CubicMeters;
            if (u == "ft3" || u == "cuft" || u == "cubicfoot" || u == "cubicfeet") return UnitTypeId.CubicFeet;
            return null;
        }
    }
}
