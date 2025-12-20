using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

/*
DocumentType: ConceptualMass
Categories: Architectural, Conceptual, Prototyping
Author: Paracore Team
Version: 1.0.0
LastRun: null
IsDefault: true
Dependencies: RevitAPI 2025, RScript.Engine, RServer.Addin

Description:
Creates a spiral lofted mass between two user-defined levels with customizable parameters including height, rotation, tapering, and a bulge/squeeze effect that preserves the base and top profiles. Ideal for conceptual architectural forms.

History:
- 2025-07-01: Initial release
- 2025-08-10: Added height parameter
*/

// ===== PARAMETERS =====
//  [Parameter]
string baseLevelName = "Level 1";       // Base level name
// [Parameter]
string topLevelName = "Level 42";       // Top level name
// [Parameter]
int segments = 82;                      // Number of segments for entire height (min 3)
// [Parameter]
double sideLengthCm = 1000;             // Base square side length
// [Parameter]
double topSideLengthCm = 1000;          // Top square side length (tapering)
// [Parameter]
double rotationDeg = 360;               // Total rotation over height (degrees)
// [Parameter]
bool clockwiseRotation = true;          // Rotation direction
// [Parameter]
double twistAngle = 0;                  // Additional twist per segment
// [Parameter]
int segmentsPerSide = 2;                // Number of segments per square side

// Bulge/Squeeze parameters
// [Parameter]
double bulgeFactor = 3;                 // Bulge magnitude (positive = bulge, negative = squeeze)
// [Parameter]
double bulgeCenterHeightRatio = 0.2;    // Vertical position of bulge center (0=base, 1=top)
// [Parameter]
double bulgeRadiusRatio = 0.3;          // Vertical radius of bulge effect (0-0.5)

// Positioning parameters
// [Parameter]
double centerX = 0;                     // X position offset in meters
// [Parameter]
double centerY = 0;                     // Y position offset in meters
// ======================

Print("⏳ Creating SpiralMass with anchor-preserving bulge effect...");

Transact("Create SpiralMass", doc =>
{
    var fc = doc.FamilyCreate;
    
    // Get levels by name
    var levels = new FilteredElementCollector(doc)
        .OfClass(typeof(Level))
        .Cast<Level>()
        .ToList();

    Level? baseLevel = levels.FirstOrDefault(l => l.Name == baseLevelName);
    Level?  topLevel = levels.FirstOrDefault(l => l.Name == topLevelName);

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
    segments = Math.Max(3, segments);
    int profileCount = segments + 1;  // Profiles = segments + 1
    
    Print($"   - Base Level: {baseLevelName} ({UnitUtils.ConvertFromInternalUnits(baseHeightFt, UnitTypeId.Meters):0.00} m)");
    Print($"   - Top Level: {topLevelName} ({UnitUtils.ConvertFromInternalUnits(topHeightFt, UnitTypeId.Meters):0.00} m)");
    Print($"   - Segments: {segments}, Profiles: {profileCount}");
    Print($"   - Total height: {UnitUtils.ConvertFromInternalUnits(totalHeightFt, UnitTypeId.Meters):0.00} m");
    Print($"   - Position: ({centerX:0.00}m, {centerY:0.00}m)");

    // Convert inputs to Revit internal units (feet)
    double sideFt = UnitUtils.ConvertToInternalUnits(sideLengthCm, UnitTypeId.Centimeters);
    double topSideFt = UnitUtils.ConvertToInternalUnits(topSideLengthCm, UnitTypeId.Centimeters);
    
    // Convert position offsets to feet
    double offsetX = UnitUtils.ConvertToInternalUnits(centerX, UnitTypeId.Meters);
    double offsetY = UnitUtils.ConvertToInternalUnits(centerY, UnitTypeId.Meters);
    XYZ positionOffset = new(offsetX, offsetY, 0);
    
    double rotationSign = clockwiseRotation ? 1 : -1;
    double rotationRad = rotationDeg * Math.PI / 180.0 * rotationSign;
    double twistRad = twistAngle * Math.PI / 180.0;

    var profileArrays = new ReferenceArrayArray();

    // Calculate bulge center and radius
    double bulgeCenterZ = baseHeightFt + totalHeightFt * bulgeCenterHeightRatio;
    double bulgeRadiusFt = totalHeightFt * bulgeRadiusRatio;

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
        if (!isAnchorProfile && Math.Abs(bulgeFactor) > 0.001 && 
            z > bulgeStartZ && z < bulgeEndZ)
        {
            // Calculate normalized distance from bulge center (0 at center, 1 at boundaries)
            double normalizedDistance = Math.Abs(z - bulgeCenterZ) / bulgeRadiusFt;
            
            // Apply smoothstep function for smooth transition
            double smoothFactor = 1 - 3 * Math.Pow(normalizedDistance, 2) + 
                                  2 * Math.Pow(normalizedDistance, 3);
            
            // Apply bulge factor
            bulgeEffect = 1.0 + bulgeFactor * smoothFactor;
        }

        var ringRefs = new ReferenceArray();

        // Create square profile
        for (int sideIndex = 0; sideIndex < 4; sideIndex++)
        {
            double startAngle = sideIndex * Math.PI / 2;
            double endAngle = (sideIndex + 1) * Math.PI / 2;
            
            // Create multiple segments per side
            for (int seg = 0; seg < segmentsPerSide; seg++)
            {
                double segStartAngle = startAngle + (endAngle - startAngle) * seg / segmentsPerSide;
                double segEndAngle = startAngle + (endAngle - startAngle) * (seg + 1) / segmentsPerSide;
                
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
                if (!isAnchorProfile && Math.Abs(bulgeFactor) > 0.001 && 
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
    Print($"   - Base: {sideLengthCm} cm (exact), Top: {topSideLengthCm} cm (exact)");
    Print($"   - Total rotation: {rotationDeg}° {(clockwiseRotation ? "CW" : "CCW")}");
    
    if (Math.Abs(bulgeFactor) > 0.001)
    {
        string effect = bulgeFactor > 0 ? "Bulge" : "Squeeze";
        double startHeightM = UnitUtils.ConvertFromInternalUnits(bulgeStartZ - baseHeightFt, UnitTypeId.Meters);
        double endHeightM = UnitUtils.ConvertFromInternalUnits(bulgeEndZ - baseHeightFt, UnitTypeId.Meters);
        
        Print($"   - {effect} effect: {Math.Abs(bulgeFactor * 100):0}%");
        Print($"     Anchor profiles preserved at base and top");
        Print($"     Center at {bulgeCenterHeightRatio * 100:0}% height ({UnitUtils.ConvertFromInternalUnits(bulgeCenterZ - baseHeightFt, UnitTypeId.Meters):0.00}m)");
        Print($"     Affects from {startHeightM:0.00}m to {endHeightM:0.00}m");
    }
});