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
        /// <summary>
        /// The unit spellings GetUnitTypeId accepts, for the refusal message.
        /// </summary>
        internal const string SupportedUnits =
            "mm, cm, m, in, ft (length); m2, ft2 (area); m3, ft3 (volume)";

        /// <summary>
        /// Resolve a unit string, or REFUSE it. Returns null only for an EMPTY unit, which
        /// means "the value is already in Revit's internal units" and is deliberate.
        /// <para>
        /// ⚠⚠ WHY THIS THROWS (2026-10-27, pre-release review round 3). This used to return
        /// the value unconverted when the unit was not recognised, so
        /// <c>SetNum("Base Offset", 5, "furlongs")</c> silently wrote <b>5 feet (1524 mm)</b>
        /// and reported success. In a tool that edits models, a silent wrong write is worse
        /// than an exception: the user has no way to notice it. Measured by the reviewer.
        /// </para>
        /// </summary>
        private static ForgeTypeId? _resolveUnitOrThrow(string unit, string context)
        {
            if (string.IsNullOrWhiteSpace(unit)) return null;   // explicitly internal units
            var id = GetUnitTypeId(unit);
            if (id == null)
            {
                throw new ArgumentException(
                    $"{context}: unknown unit \"{unit}\". Supported: {SupportedUnits}. "
                    + "Pass an empty unit only if the value is already in Revit's internal "
                    + "units (feet) — that is the one case where no conversion happens.");
            }
            return id;
        }

        public static double InputUnit(this double value, string unit)
        {
            var unitTypeId = _resolveUnitOrThrow(unit, "InputUnit");
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
        /// Converts an internal Revit value (feet/sqft) TO the specified unit.
        /// <para>
        /// ⚠⚠ THE VALUE IS NOT ROUNDED UNLESS YOU ASK (2026-10-27). <c>decimals</c> defaults to
        /// <b>-1</b>, meaning "return the exact conversion". Rounding belongs to DISPLAY —
        /// FormatUnit / FormatValueOnly / GetVal / GetStr pass an explicit 2 — because a rounded
        /// number that is then summed, compared or re-used is a wrong number with a tidy face.
        /// Measured before the fix: <c>GetNum("Length","m")</c> returned <b>5.07</b> for a wall
        /// whose exact length is <b>5.065 m</b>, a 915 mm door width became <b>0.91 m</b>, and
        /// summing 2-dp wall areas gave <b>95.23 m²</b> against <b>95.2417</b> exact — per-element
        /// rounding loss that grows with the size of the building.
        /// </para>
        /// <para>
        /// ⚠ <c>MidpointRounding.AwayFromZero</c>, not the .NET default. A quantity surveyor
        /// expects 5.065 to round to 5.07; banker's rounding gives 5.06 whenever the binary value
        /// lands a hair below the midpoint. Half-away-from-zero is also what makes a column of
        /// numbers add up the way a person checking it by hand expects.
        /// </para>
        /// </summary>
        public static double OutputUnit(this double value, string unit, int decimals = -1)
        {
            var unitTypeId = _resolveUnitOrThrow(unit, "OutputUnit");
            double converted = unitTypeId == null
                ? value
                : UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            return decimals < 0 ? converted : Math.Round(converted, decimals, MidpointRounding.AwayFromZero);
        }

        public static double OutputUnit(this int value, string unit, int decimals = -1)
        {
            return ((double)value).OutputUnit(unit, decimals);
        }

        public static double OutputUnit(this decimal value, string unit, int decimals = -1)
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
        /// <para>
        /// ⚠ This one is a deliberate DESTRUCTIVE snap — it returns a new internal value, so the
        /// rounded number flows onward. Use it only when you want the rounded value (matching a
        /// dimension string); use OutputUnit for a plain conversion.
        /// </para>
        /// </summary>
        public static double RoundTo(this double value, string unit, int decimals = 2)
        {
            var unitTypeId = GetUnitTypeId(unit);
            if (unitTypeId == null) return Math.Round(value, decimals, MidpointRounding.AwayFromZero);

            double external = UnitUtils.ConvertFromInternalUnits(value, unitTypeId);
            double rounded = Math.Round(external, decimals, MidpointRounding.AwayFromZero);
            return UnitUtils.ConvertToInternalUnits(rounded, unitTypeId);
        }

        /// <summary>
        /// DISPLAY helper — converts and rounds to <paramref name="decimals"/> for a human to read.
        /// <para>
        /// ⚠ Rounding lives HERE and in FormatValueOnly, never in OutputUnit/GetNum. If you need a
        /// number to compute with, call OutputUnit; if you need one to show, call this.
        /// </para>
        /// <para>
        /// The suffix is CANONICALISED, not echoed: <c>"m2"</c> renders as <c>m²</c> and
        /// <c>"square meters"</c> as <c>m²</c> too, so a schedule cell reads the way a quantity
        /// surveyor writes it. An unknown unit THROWS (via <see cref="_resolveUnitOrThrow"/>)
        /// rather than printing a converted-looking number next to a label that was never
        /// applied — a display helper that silently shows the wrong thing is worse than one
        /// that stops.
        /// </para>
        /// </summary>
        public static string FormatUnit(this double value, string unit, int decimals = 2)
        {
            // Resolve first so an unknown unit reports THIS helper's name, not OutputUnit's.
            _resolveUnitOrThrow(unit, "FormatUnit");
            double converted = value.OutputUnit(unit, decimals);
            string suffix = _displayUnit(unit);
            return suffix.Length == 0 ? converted.ToString() : $"{converted} {suffix}";
        }

        /// <summary>
        /// The human-facing form of a unit string. Every spelling GetUnitTypeId accepts collapses
        /// to one canonical suffix, and areas/volumes get a real superscript so a printed number
        /// is unambiguous ("m2" reads as a product; "m²" reads as an area).
        /// </summary>
        private static string _displayUnit(string unit)
        {
            switch ((unit ?? "").Trim().ToLowerInvariant())
            {
                case "mm": case "millimeter": case "millimeters":
                    return "mm";
                case "cm": case "centimeter": case "centimeters":
                    return "cm";
                case "m": case "meter": case "meters":
                    return "m";
                case "ft": case "foot": case "feet":
                    return "ft";
                case "in": case "inch": case "inches":
                    return "in";
                case "m2": case "sqm": case "sq.m": case "m²":
                case "square meter": case "square meters":
                    return "m²";
                case "ft2": case "sqft": case "sq.ft": case "ft²":
                case "square foot": case "square feet":
                    return "ft²";
                case "m3": case "cum": case "cu.m": case "m³":
                case "cubic meter": case "cubic meters":
                    return "m³";
                case "ft3": case "cuft": case "cu.ft": case "ft³":
                case "cubic foot": case "cubic feet":
                    return "ft³";
                default:
                    return (unit ?? "").Trim();   // "" = internal units, no suffix
            }
        }

        /// <summary>
        /// DISPLAY helper — the converted value as a string with no unit suffix, rounded to
        /// <paramref name="decimals"/>. See FormatUnit for why rounding belongs here.
        /// </summary>
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
