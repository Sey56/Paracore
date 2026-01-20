using Autodesk.Revit.DB;
using System;
using System.Linq;
using System.Collections.Generic;

/*
DocumentType: Project
Categories: Analysis, Dashboard
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description: 
Demonstrates ALL Data Visualization features. Renders bar, pie, and line charts 
along with interactive tables for a comprehensive project overview.

UsageExamples:
- "Generate a project dashboard"
- "Show element distribution by category"
- "list walls in an interactive table"
*/

Println("📊 Generating Project Dashboard...");

// 1. Bar Chart: Elements by Category
var categories = new List<BuiltInCategory> { 
    BuiltInCategory.OST_Walls, 
    BuiltInCategory.OST_Doors, 
    BuiltInCategory.OST_Windows,
    BuiltInCategory.OST_Rooms,
    BuiltInCategory.OST_Floors 
};

var categoryData = categories.Select(cat => new {
    name = cat.ToString().Replace("OST_", ""),
    value = new FilteredElementCollector(Doc).OfCategory(cat).WhereElementIsNotElementType().GetElementCount()
}).ToList();

Println("1️⃣ Bar Chart: Elements per Category");
ChartBar(categoryData); // Or BarChart(categoryData)

// 2. Pie Chart: Wall Types Distribution
var walls = new FilteredElementCollector(Doc)
    .OfClass(typeof(Wall))
    .Cast<Wall>()
    .ToList();

var wallTypeData = walls
    .GroupBy(w => w.WallType.Name)
    .Select(g => new {
        name = g.Key,
        value = g.Count()
    })
    .OrderByDescending(x => x.value)
    .Take(5) // Top 5 types to keep pie clean
    .ToList();

Println("2️⃣ Pie Chart: Top 5 Wall Types");
PieChart(wallTypeData);

// 3. Line Chart: Elements by Level Elevation
// We'll count how many elements are on each level, sorted by elevation
var levels = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .OrderBy(l => l.Elevation)
    .ToList();

var levelData = new List<object>();
foreach (var level in levels)
{
    // Quick approximate count of elements on this level (using ElementLevel filter)
    var count = new FilteredElementCollector(Doc)
        .WherePasses(new ElementLevelFilter(level.Id))
        .GetElementCount();

    levelData.Add(new {
        name = level.Name,
        value = count
    });
}

Println("3️⃣ Line Chart: Elements per Level (by Elevation)");
LineChart(levelData); // Or ChartLine(levelData)

// 4. Interactive Table
var wallTableData = walls.Select(w => new {
    Id = w.Id.Value, // "Id" column makes this row clickable!
    Name = w.Name,
    Type = w.WallType.Name,
    Length = Math.Round(UnitUtils.ConvertFromInternalUnits(w.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0, UnitTypeId.Meters), 2) + " m"
}).ToList();

Println($"4️⃣ Interactive Table: {walls.Count} Walls");
Table(wallTableData);