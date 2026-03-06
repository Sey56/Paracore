using System.Diagnostics.CodeAnalysis;

// Style & Documentation (General Noise)
[assembly: SuppressMessage("Style", "IDE0008:Use explicit type", Justification = "Prefer var for readability")]
[assembly: SuppressMessage("Style", "IDE0011:Add braces", Justification = "Single line if-statements are acceptable")]
[assembly: SuppressMessage("Style", "IDE0063:Use simple using statement", Justification = "Legacy style is fine")]
[assembly: SuppressMessage("Style", "IDE0090:Use 'new(...)'", Justification = "Not a priority")]
[assembly: SuppressMessage("Style", "IDE0290:Use primary constructor", Justification = "Legacy constructors are fine")]
[assembly: SuppressMessage("Style", "IDE0058:Expression value is never used", Justification = "Intentional discards/fluent calls")]
[assembly: SuppressMessage("Style", "IDE0042:Variable declaration can be deconstructed", Justification = "Not needed")]
[assembly: SuppressMessage("Style", "IDE0078:Use pattern matching", Justification = "Not needed")]
[assembly: SuppressMessage("Style", "IDE0300:Simplify collection initialization", Justification = "Not needed")]
[assembly: SuppressMessage("Style", "IDE0028:Simplify collection initialization", Justification = "Not needed")]

// Documentation
[assembly: SuppressMessage("Design", "CA1570:XML comment has badly formed XML", Justification = "Noise")]

// Globalization (We mostly run in localized BIM environments, but these are often just noise for internal IDs)
[assembly: SuppressMessage("Globalization", "CA1304:Specify CultureInfo", Justification = "Acceptable for internal logic")]
[assembly: SuppressMessage("Globalization", "CA1305:Specify IFormatProvider", Justification = "Acceptable for internal logic")]
[assembly: SuppressMessage("Globalization", "CA1307:Specify StringComparison", Justification = "Acceptable for internal logic")]
[assembly: SuppressMessage("Globalization", "CA1308:Normalize strings to uppercase", Justification = "Lower invariant is preferred for our keys")]
[assembly: SuppressMessage("Globalization", "CA1310:Specify StringComparison", Justification = "Acceptable for internal logic")]
[assembly: SuppressMessage("Globalization", "CA1311:Specify culture", Justification = "Acceptable for internal logic")]

// Performance & Design
[assembly: SuppressMessage("Reliability", "CA2007:Do not directly await a Task", Justification = "Not needed for desktop app")]
[assembly: SuppressMessage("Design", "CA2201:Do not raise reserved exception types", Justification = "Internal exception handling is sufficient")]
[assembly: SuppressMessage("Usage", "CA1862:Use StringComparison.OrdinalIgnoreCase", Justification = "ToLowerInvariant is sufficient for current needs")]
