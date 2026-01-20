using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: ConceptualMass
Categories: Architectural, Conceptual, Prototyping
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Creates a spiral lofted mass between two user-defined levels with customizable parameters including height, rotation, tapering, and a bulge/squeeze effect that preserves the base and top profiles. Ideal for conceptual architectural forms.

UsageExamples:
- "Create a spiral lofted mass"
- "Add a twisting mass between Level 1 and Level 2"
- "Generate a concept form with 1000cm side length"
*/

// ===== PARAMETERS =====
var p = new Params();

Print("⏳ Creating SpiralMass with anchor-preserving bulge effect...");

Transact("Create SpiralMass", doc =>
{
    var fc = doc.FamilyCreate;
    
    // Get levels by name
    var levels = new FilteredElementCollector(doc)
        .OfClass(typeof(Level))
        .Cast<Level>()
        .ToList();

    Level? baseLevel = levels.FirstOrDefault(l => l.Name == p.BaseLevelName);
    Level?  topLevel = levels.FirstOrDefault(l => l.Name == p.TopLevelName);

    if (baseLevel == null || topLevel == null)
    {
        Print("❌ Error: Could not find specified levels");
        return;
    }

    // Calculate height parameters
    double baseHeightFt = baseLevel.Elevation;
    double topHeightFt = topLevel.Elevation;
    double totalHeightFt = topHeightFt - baseHeightFt;
    
    // Ensure minimum segments
    int segments = Math.Max(3, p.Segments);
    int profileCount = segments + 1;  // Profiles = segments + 1
    
    Print($"   - Base Level: {p.BaseLevelName} ({UnitUtils.ConvertFromInternalUnits(baseHeightFt, UnitTypeId.Meters):0.00} m)");
    Print($"   - Top Level: {p.TopLevelName} ({UnitUtils.ConvertFromInternalUnits(topHeightFt, UnitTypeId.Meters):0.00} m)");
    Print($"   - Segments: {segments}, Profiles: {profileCount}");
    Print($"   - Total height: {UnitUtils.ConvertFromInternalUnits(totalHeightFt, UnitTypeId.Meters):0.00} m");
    Print($"   - Position: ({p.CenterX:0.00}m, {p.CenterY:0.00}m)");

    // Convert inputs to Revit internal units (feet)
    double sideFt = p.SideLengthCm;
    double topSideFt = p.TopSideLengthCm;
    
    // Convert position offsets to feet
    double offsetX = p.CenterX;
    double offsetY = p.CenterY;
    XYZ positionOffset = new(offsetX, offsetY, 0);
    
    double rotationSign = p.ClockwiseRotation ? 1 : -1;
    double rotationRad = p.RotationDeg * Math.PI / 180.0 * rotationSign;
    double twistRad = p.TwistAngle * Math.PI / 180.0;

    var profileArrays = new ReferenceArrayArray();

    // Calculate bulge center and radius
    double bulgeCenterZ = baseHeightFt + totalHeightFt * p.BulgeCenterHeightRatio;
    double bulgeRadiusFt = totalHeightFt * p.BulgeRadiusRatio;

    // Calculate bulge boundaries
    double bulgeStartZ = Math.Max(baseHeightFt, bulgeCenterZ - bulgeRadiusFt);
    double bulgeEndZ = Math.Min(topHeightFt, bulgeCenterZ + bulgeRadiusFt);

    // NEW: Anchor profiles (first and last) are never modified
    const int BASE_PROFILE_INDEX = 0;
    //const int TOP_PROFILE_INDEX = -1; // Will set later

    for (int i = 0; i < profileCount; i++)
    {
        // Calculate current profile properties
        double heightRatio = (double)i / (profileCount - 1);
        double z = baseHeightFt + heightRatio * totalHeightFt;
        double rotation = rotationRad * heightRatio;
        double side = sideFt + (topSideFt - sideFt) * heightRatio;
        
        // Initialize bulge effect to 1.0 (no effect)
        double bulgeEffect = 1.0;

        // NEW: Skip bulge calculation for anchor profiles
        bool isAnchorProfile = (i == BASE_PROFILE_INDEX) || (i == profileCount - 1);
        
        // Only calculate bulge effect if within bulge radius and not anchor
        if (!isAnchorProfile && Math.Abs(p.BulgeFactor) > 0.001 && 
            z > bulgeStartZ && z < bulgeEndZ)
        {
            // Calculate normalized distance from bulge center (0 at center, 1 at boundaries)
            double normalizedDistance = Math.Abs(z - bulgeCenterZ) / bulgeRadiusFt;
            
            // Apply smoothstep function for smooth transition
            double smoothFactor = 1 - 3 * Math.Pow(normalizedDistance, 2) + 
                                  2 * Math.Pow(normalizedDistance, 3);
            
            // Apply bulge factor
            bulgeEffect = 1.0 + p.BulgeFactor * smoothFactor;
        }

        var ringRefs = new ReferenceArray();

        // Create square profile
        for (int sideIndex = 0; sideIndex < 4; sideIndex++)
        {
            double startAngle = sideIndex * Math.PI / 2;
            double endAngle = (sideIndex + 1) * Math.PI / 2;
            
            // Create multiple segments per side
            for (int seg = 0; seg < p.SegmentsPerSide; seg++)
            {
                double segStartAngle = startAngle + (endAngle - startAngle) * seg / p.SegmentsPerSide;
                double segEndAngle = startAngle + (endAngle - startAngle) * (seg + 1) / p.SegmentsPerSide;
                
                // Apply twist along the height
                double twist = twistRad * heightRatio;
                
                // Calculate start and end points
                var start = new XYZ(
                    Math.Cos(segStartAngle + rotation + twist) * side / 2,
                    Math.Sin(segStartAngle + rotation + twist) * side / 2,
                    z
                );
                
                var end = new XYZ(
                    Math.Cos(segEndAngle + rotation + twist) * side / 2,
                    Math.Sin(segEndAngle + rotation + twist) * side / 2,
                    z
                );
                
                // Apply bulge effect only if within the affected zone and not anchor
                if (!isAnchorProfile && Math.Abs(p.BulgeFactor) > 0.001 && 
                    z > bulgeStartZ && z < bulgeEndZ)
                {
                    // Apply bulge effect only radially
                    start = new XYZ(
                        start.X * bulgeEffect,
                        start.Y * bulgeEffect,
                        start.Z
                    );
                    
                    end = new XYZ(
                        end.X * bulgeEffect,
                        end.Y * bulgeEffect,
                        end.Z
                    );
                }
                
                // Apply position offset
                start += positionOffset;
                end += positionOffset;
                
                // Create reference points and curve
                var ptStart = fc.NewReferencePoint(start);
                var ptEnd = fc.NewReferencePoint(end);
                
                var pair = new ReferencePointArray();
                pair.Append(ptStart);
                pair.Append(ptEnd);
                
                var curve = fc.NewCurveByPoints(pair);
                ringRefs.Append(curve.GeometryCurve.Reference);
            }
        }
        
        profileArrays.Append(ringRefs);
    }

    // Create loft form
    Form loft = fc.NewLoftForm(true, profileArrays);
    
    Print($"✅ SpiralMass created successfully");
    Print($"   - Segments: {segments}, Profiles: {profileCount}");
    Print($"   - Base: {p.SideLengthCm} cm (exact), Top: {p.TopSideLengthCm} cm (exact)");
    Print($"   - Total rotation: {p.RotationDeg}° {(p.ClockwiseRotation ? "CW" : "CCW")}");
    
    if (Math.Abs(p.BulgeFactor) > 0.001)
    {
        string effect = p.BulgeFactor > 0 ? "Bulge" : "Squeeze";
        double startHeightM = UnitUtils.ConvertFromInternalUnits(bulgeStartZ - baseHeightFt, UnitTypeId.Meters);
        double endHeightM = UnitUtils.ConvertFromInternalUnits(bulgeEndZ - baseHeightFt, UnitTypeId.Meters);
        
        Print($"   - {effect} effect: {Math.Abs(p.BulgeFactor * 100):0}%");
        Print($"     Anchor profiles preserved at base and top");
        Print($"     Center at {p.BulgeCenterHeightRatio * 100:0}% height ({UnitUtils.ConvertFromInternalUnits(bulgeCenterZ - baseHeightFt, UnitTypeId.Meters):0.00}m)");
        Print($"     Affects from {startHeightM:0.00}m to {endHeightM:0.00}m");
    }
});

// ======================
public class Params
{
    #region Levels
    /// <summary>Name of the base level</summary>
    [RevitElements(TargetType = "Level")]
    public string BaseLevelName { get; set; } = "Level 1";

    /// <summary>Name of the top level</summary>
    [RevitElements(TargetType = "Level")]
    public string TopLevelName { get; set; } = "Level 2";
    #endregion

    #region Segments
    /// Number of segments for entire height (min 3)
    [Range(3, 200)]
    public int Segments { get; set; } = 82;

    /// Base square side length in cm
    [Range(100, 5000, 10), Unit("cm")]
    public double SideLengthCm { get; set; } = 1000;

    /// Top square side length in cm (tapering)
    [Range(100, 5000, 10), Unit("cm")]
    public double TopSideLengthCm { get; set; } = 1000;

    /// Total rotation over height (degrees)
    [Range(0, 1080, 15)]
    public double RotationDeg { get; set; } = 360;

    /// Check for clockwise, uncheck for counter-clockwise
    public bool ClockwiseRotation { get; set; } = true;

    /// Additional twist per segment
    [Range(0, 45, 1)]
    public double TwistAngle { get; set; } = 0;

    /// Number of segments per square side
    [Range(1, 10)]
    public int SegmentsPerSide { get; set; } = 2;
    #endregion

    #region Bulge Effect
    // Bulge/Squeeze parameters
    
    /// Bulge magnitude (positive = bulge, negative = squeeze)
    [Range(-5.0, 5.0, 0.1)]
    public double BulgeFactor { get; set; } = 3;

    /// Vertical position of bulge center (0=base, 1=top)
    [Range(0.0, 1.0, 0.05)]
    public double BulgeCenterHeightRatio { get; set; } = 0.2;

    /// Vertical radius of bulge effect (0-0.5)
    [Range(0.0, 0.5, 0.05)]
    public double BulgeRadiusRatio { get; set; } = 0.3;
    #endregion

    #region Positioning
    // Positioning parameters
    
    /// X position offset in meters
    [Unit("m")]
    public double CenterX { get; set; } = 0;

    /// Y position offset in meters
    [Unit("m")]
    public double CenterY { get; set; } = 0;
    #endregion
}
