using System.Collections.Generic;
using Autodesk.Revit.DB;

/*
** PARACORE FEATURES DEMO **
This script showcases the advanced capabilities of the Paracore Automation Ecosystem (V2).

Features Demonstrated:
1. "Pick Object" for Integer/Long IDs
2. "Pick Point" (XYZ) Input
3. "Pick Edge" (Reference Object)
4. "Pick Face" (Reference Object)
5. Standard Parameters (String, Number, Bool)
6. Convention-based Output (Table, Charts)
*/

Params p = new();

// 1. Point Selection
// Now natively supported as XYZ! The engine injects 'new XYZ(x,y,z)' automatically.
if (p.StartPoint != null)
{
    Println($"📍 Selected Point: {p.StartPoint}");
}

// 2. Element Selection (ID)
// The UI renders a "Pick Object" button because of [Select].
// The engine automatically injects the Element ID as a number (int or long).
if (p.SelectedWallId > 0)
{
    Element e = Doc.GetElement(new ElementId(p.SelectedWallId));
    if (e != null)
    {
        Println($"🧱 Selected Element: {e.Name} (ID: {e.Id})");
    }
}

// 3. Edge Selection
// Now natively supported as Reference! No need to manually parse stable strings.
if (p.SelectedEdge != null)
{
    Element e = Doc.GetElement(p.SelectedEdge);
    if (e != null)
    {
        GeometryObject geo = e.GetGeometryObjectFromReference(p.SelectedEdge);
        if (geo is Edge edge)
        {
            Println($"📏 Selected Edge Length: {edge.ApproximateLength:F2} ft");
        }
    }
}

// 4. Face Selection
if (p.SelectedFace != null)
{
    Element e = Doc.GetElement(p.SelectedFace);
    if (e != null)
    {
        GeometryObject geo = e.GetGeometryObjectFromReference(p.SelectedFace);
        if (geo is Face face)
        {
            Println($"⬜ Selected Face Area: {face.Area:F2} sqft");
        }
    }
}

// 5. Generate Data for Visualization
var data = new List<object>();
for (int i = 1; i <= 5; i++)
{
    data.Add(new { 
        Name = $"Item {i}", 
        Value = i * 10 + (p.Multiplier * i), 
        Category = i % 2 == 0 ? "Even" : "Odd" 
    });
}

// 6. Output: Table
// Renders an interactive data grid in the "Summary" tab.
Println("📊 Generating Table...");
Table(data);

// 7. Output: Chart
// Renders a chart in the "Summary" tab.
Println("📈 Generating Bar Chart...");
ChartBar(data);


// 8. Error Handling Test
// Uncomment the line below to test the unified error reporting!
// int zero = 0; int fail = 10 / zero;


public class Params
{
    /// <summary>
    /// Pick a point in the model.
    /// </summary>
    [Select(SelectionType.Point)]
    public XYZ StartPoint { get; set; }

    /// <summary>
    /// Pick a Wall to get its ID.
    /// </summary>
    [Select(SelectionType.Element)]
    public int SelectedWallId { get; set; }

    /// <summary>
    /// Pick an Edge.
    /// </summary>
    [Select(SelectionType.Edge)]
    public Reference SelectedEdge { get; set; }

    /// <summary>
    /// Pick a Face.
    /// </summary>
    [Select(SelectionType.Face)]
    public Reference SelectedFace { get; set; }

    /// <summary>
    /// Multiplier for the chart data.
    /// </summary>
    [Range(1, 10)]
    public int Multiplier { get; set; } = 2;
}
