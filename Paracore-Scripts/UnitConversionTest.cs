using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;

/*
DocumentType: Project
Categories: Utility, Testing
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Diagnostic tool for verifying Paracore's automatic unit conversion engine. 
Checks mm, m, m2, and m3 conversions against Revit's internal feet/sqft/cuft units.

UsageExamples:
- "Run unit conversion test"
- "Verify internal unit mappings"
*/

var p = new Params();

// Verify Mm
double expectedMmInFt = UnitUtils.ConvertToInternalUnits(1000, UnitTypeId.Millimeters);
Println($"Input: {p.Length} (mm) -> Internal: {p.Length} (ft)");
if (IsClose(p.Length, expectedMmInFt)) Println("✅ mm Conversion SUCCESS");
else Println($"❌ mm Conversion FAILED. Expected {expectedMmInFt}, Got {p.Length}");

// Verify M
double expectedMInFt = UnitUtils.ConvertToInternalUnits(1, UnitTypeId.Meters);
Println($"Input: {p.Height} (m) -> Internal: {p.Height} (ft)");
if (IsClose(p.Height, expectedMInFt)) Println("✅ m Conversion SUCCESS");
else Println($"❌ m Conversion FAILED");

// Verify Dimensionless (No Change)
if (p.Count == 5) Println("✅ Dimensionless (Count) SUCCESS");
else Println($"❌ Dimensionless FAILED. Expected 5, Got {p.Count}");

// Verify Area (m2 -> ft2)
double expectedAreaSqFt = UnitUtils.ConvertToInternalUnits(10, UnitTypeId.SquareMeters);
Println($"Input: {p.Area} (m2) -> Internal: {p.Area} (ft2)");
if (IsClose(p.Area, expectedAreaSqFt)) Println("✅ m2 Conversion SUCCESS");
else Println($"❌ m2 Conversion FAILED. Expected {expectedAreaSqFt}, Got {p.Area}");

// Verify Volume (m3 -> ft3)
double expectedVolCuFt = UnitUtils.ConvertToInternalUnits(5, UnitTypeId.CubicMeters);
Println($"Input: {p.Volume} (m3) -> Internal: {p.Volume} (ft3)");
if (IsClose(p.Volume, expectedVolCuFt)) Println("✅ m3 Conversion SUCCESS");
else Println($"❌ m3 Conversion FAILED. Expected {expectedVolCuFt}, Got {p.Volume}");

// Helper
bool IsClose(double a, double b) => Math.Abs(a - b) < 0.001;

public class Params
{
    // 1. Attribute Convention (Standard C#, Zero Semantic Issues)
    [Unit("mm")]
    public double Length { get; set; } = 1000; // UI: 1000 mm, Script: 3.28 ft

    [Unit("m")]
    public double Height { get; set; } = 1; // UI: 1 m, Script: 3.28 ft
    
    [Unit("m2")]
    public double Area { get; set; } = 10; // UI: 10 m2, Script: ~107.6 ft2

    [Unit("m3")]
    public double Volume { get; set; } = 5; // UI: 5 m3, Script: ~176.5 ft3

    // 2. Dimensionless
    public int Count { get; set; } = 5;

    // 4. Suffix Fallback (Deprecated)
    public double Depth_in { get; set; } = 12; 
}
