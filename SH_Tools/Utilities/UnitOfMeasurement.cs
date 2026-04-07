using Autodesk.Revit.DB;

namespace SH_Tools.Utilities
{
    public enum UnitOfMeasurement
    {
        Millimeters,
        Centimeters,
        Meters,
        Inches,
        Feet
    }

    public static class Converter
    {
        public static double ConvertToFeet(double value, UnitOfMeasurement sourceUnit)
        {
            switch (sourceUnit)
            {
                case UnitOfMeasurement.Millimeters:
                    return value / 304.8;
                case UnitOfMeasurement.Centimeters:
                    return value / 30.48;
                case UnitOfMeasurement.Meters:
                    return value / 0.3048;
                case UnitOfMeasurement.Inches:
                    return value / 12;
                case UnitOfMeasurement.Feet:
                    return value;
                default:
                    throw new NotSupportedException($"Unsupported unit of measurement: {sourceUnit}");
            }
        }

        public static double ConvertFromFeet(double valueInFeet, UnitOfMeasurement targetUnit)
        {
            switch (targetUnit)
            {
                case UnitOfMeasurement.Millimeters:
                    return valueInFeet * 304.8;
                case UnitOfMeasurement.Centimeters:
                    return valueInFeet * 30.48;
                case UnitOfMeasurement.Meters:
                    return valueInFeet * 0.3048;
                case UnitOfMeasurement.Inches:
                    return valueInFeet * 12;
                case UnitOfMeasurement.Feet:
                    return valueInFeet;
                default:
                    throw new NotSupportedException($"Unsupported unit of measurement: {targetUnit}");
            }
        }

        public static UnitOfMeasurement GetCurrentUnitSystem(Document doc)
        {
            // Get the current units of the document
            Units units = doc.GetUnits();
            FormatOptions formatOptions = units.GetFormatOptions(SpecTypeId.Length);

            // Get the unit type id
            ForgeTypeId unitTypeId = formatOptions.GetUnitTypeId();

            // Convert the ForgeTypeId to your UnitOfMeasurement enum
            if (unitTypeId == UnitTypeId.Millimeters)
            {
                return UnitOfMeasurement.Millimeters;
            }
            else if (unitTypeId == UnitTypeId.Centimeters)
            {
                return UnitOfMeasurement.Centimeters;
            }
            else if (unitTypeId == UnitTypeId.Meters)
            {
                return UnitOfMeasurement.Meters;
            }
            else if (unitTypeId == UnitTypeId.Inches)
            {
                return UnitOfMeasurement.Inches;
            }
            else if (unitTypeId == UnitTypeId.Feet)
            {
                return UnitOfMeasurement.Feet;
            }
            else
            {
                throw new NotSupportedException($"Unsupported unit of measurement: {unitTypeId}");
            }
        }
    }
}
