using Autodesk.Revit.DB;
using System;

namespace CoreScript.Engine.Globals
{
    public static class UnitExtensions
    {
        /// <summary> 
        /// Converts an input value FROM the specified unit TO Revit's internal units (feet/sqft).
        /// Example: 10.InputUnit("m2") -> converts 10 sqm to internal sqft.
        /// </summary>
        public static double InputUnit(this double value, string unit)
        {
            var unitTypeId = GetUnitTypeId(unit);
            return unitTypeId == null ? value : UnitUtils.ConvertToInternalUnits(value, unitTypeId);
        }

        public static double InputUnit(this int value, string unit)
        {
            return ((double)value).InputUnit(unit);
        }

        public static double InputUnit(this decimal value, string unit)
        {
            return ((double)value).InputUnit(unit);
        }

        /// <summary> 
        /// Converts an internal Revit value (feet/sqft) TO the specified unit for output/display.
        /// Example: room.Area.OutputUnit("m2") -> converts internal sqft to sqm.
        /// </summary>
        public static double OutputUnit(this double value, string unit, int decimals = 2)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null)
            {
                return Math.Round(value, decimals);
            }

            double converted = UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            return Math.Round(converted, decimals);
        }

        public static double OutputUnit(this int value, string unit, int decimals = 2)
        {
            return ((double)value).OutputUnit(unit, decimals);
        }

        public static double OutputUnit(this decimal value, string unit, int decimals = 2)
        {
            return ((double)value).OutputUnit(unit, decimals);
        }


        // --- Precision-Aware Comparisons (Floating Point Tolerance) ---
        // These methods use a standard Revit tolerance (1e-9 ft) to handle floating-point noise
        // while maintaining the precision needed for geometry.

        /// <summary> Returns true if two numbers are within the specified tolerance (fuzzy equality). Defaults to 1e-9 ft. </summary>
        public static bool IsAlmostEqualTo(this double value, double other, double tolerance = 1e-9)
        {
            return Math.Abs(value - other) < tolerance;
        }

        /// <summary> Returns true if the value is essentially zero within the specified tolerance. </summary>
        public static bool AlmostZero(this double value, double tolerance = 1e-9)
        {
            return Math.Abs(value) < tolerance;
        }

        /// <summary> Returns true if the value is strictly less than the limit, outside the tolerance range. </summary>
        public static bool IsLessThan(this double value, double limit, double tolerance = 1e-9)
        {
            if (value.IsAlmostEqualTo(limit, tolerance)) return false;
            return value < limit;
        }

        /// <summary> Returns true if the value is strictly greater than the limit, outside the tolerance range. </summary>
        public static bool IsGreaterThan(this double value, double limit, double tolerance = 1e-9)
        {
            if (value.IsAlmostEqualTo(limit, tolerance)) return false;
            return value > limit;
        }

        /// <summary> Returns true if the value is less than or approximately equal to the limit. </summary>
        public static bool IsLessThanOrEqual(this double value, double limit, double tolerance = 1e-9)
        {
            return value < limit || value.IsAlmostEqualTo(limit, tolerance);
        }

        /// <summary> Returns true if the value is greater than or approximately equal to the limit. </summary>
        public static bool IsGreaterThanOrEqual(this double value, double limit, double tolerance = 1e-9)
        {
            return value > limit || value.IsAlmostEqualTo(limit, tolerance);
        }

        /// <summary> Returns true if the value is positive and outside the zero-tolerance range. </summary>
        public static bool IsPositive(this double value, double tolerance = 1e-9)
        {
            return value > tolerance;
        }

        /// <summary> Returns true if the value is negative and outside the zero-tolerance range. </summary>
        public static bool IsNegative(this double value, double tolerance = 1e-9)
        {
            return value < -tolerance;
        }

        /// <summary> 
        /// Rounds the raw internal value to match the precision of a specific human unit.
        /// Example: wallLength.RoundTo("mm") snaps 6.561679... to the exact internal value for 2000.00mm.
        /// </summary>
        public static double RoundTo(this double value, string unit, int decimals = 2)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return Math.Round(value, decimals);

            double external = UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            double rounded = Math.Round(external, decimals);
            return UnitUtils.ConvertToInternalUnits(rounded, unitTypeId);
        }

        public static string FormatUnit(this double value, string unit, int decimals = 2)
        {
            double converted = value.OutputUnit(unit, decimals);
            return $"{converted} {unit}";
        }

        /// <summary> Returns only the numeric value converted to the unit as a string, without suffix. </summary>
        public static string FormatValueOnly(this double value, string unit, int decimals = 2)
        {
            double converted = value.OutputUnit(unit, decimals);
            return converted.ToString();
        }

        public static ForgeTypeId? GetUnitTypeId(string unit)
        {
            string u = unit.ToLower().Trim();
            if (u == "mm" || u == "millimeter" || u == "millimeters")
            {
                return UnitTypeId.Millimeters;
            }

            if (u == "cm" || u == "centimeter" || u == "centimeters")
            {
                return UnitTypeId.Centimeters;
            }

            if (u == "m" || u == "meter" || u == "meters")
            {
                return UnitTypeId.Meters;
            }

            if (u == "ft" || u == "foot" || u == "feet")
            {
                return UnitTypeId.Feet;
            }

            if (u == "in" || u == "inch" || u == "inches")
            {
                return UnitTypeId.Inches;
            }

            if (u == "m2" || u == "sqm" || u == "square meter" || u == "square meters" || u == "m²" || u == "sq.m")
            {
                return UnitTypeId.SquareMeters;
            }

            if (u == "ft2" || u == "sqft" || u == "square foot" || u == "square feet" || u == "ft²" || u == "sq.ft")
            {
                return UnitTypeId.SquareFeet;
            }

            if (u == "m3" || u == "cum" || u == "cubic meter" || u == "cubic meters" || u == "m³" || u == "cu.m")
            {
                return UnitTypeId.CubicMeters;
            }

            return u == "ft3" || u == "cuft" || u == "cubic foot" || u == "cubic feet" || u == "ft³" || u == "cu.ft"
                ? UnitTypeId.CubicFeet
                : null;
        }

        /// <summary> 
        /// Parses a dimension string (e.g., "50mm", "0.1m", "2ft") and returns the value in METERS.
        /// Defaults to meters if no unit suffix is found.
        /// </summary>
        public static double ToMeters(this string value)
        {
            if (string.IsNullOrEmpty(value) || value == "0") return 0;

            string input = value.Trim().ToLower();
            string numPart = "";
            string unitPart = "";
            bool foundUnit = false;

            foreach (char c in input)
            {
                if (!foundUnit && (char.IsDigit(c) || c == '.' || c == '-'))
                {
                    numPart += c;
                }
                else if (char.IsLetter(c) || c == '²' || c == '³')
                {
                    foundUnit = true;
                    unitPart += c;
                }
            }

            if (!double.TryParse(numPart, out double val)) return 0;
            if (string.IsNullOrEmpty(unitPart)) return val; 

            var unitTypeId = GetUnitTypeId(unitPart);
            if (unitTypeId == null) return val;

            // Convert to internal (feet) then to meters
            double internalValue = UnitUtils.ConvertToInternalUnits(val, unitTypeId);
            return UnitUtils.ConvertFromInternalUnits(internalValue, UnitTypeId.Meters);
        }
    }
}
