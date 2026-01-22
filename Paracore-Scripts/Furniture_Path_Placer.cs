using Autodesk.Revit.DB;

/*
DocumentType: Project
Categories: Tutorials, Placement
Author: Paracore Team
Dependencies: RevitAPI 2025, CoreScript.Engine, Paracore.Addin

Description:
Places furniture instances along a selected model line path at regular intervals.
Demonstrates Reference selection, FamilySymbol lookup, and instance placement.

UsageExamples:
- "Place chairs along a curved path"
- "Distribute furniture evenly on a line"
*/

var p = new Params();

// 1. Resolve the selected path line to a Curve
Element lineElement = Doc.GetElement(p.PathLine);
if (lineElement == null)
{
    Println("🚫 No line selected. Please pick a Model Line or Detail Line.");
    return;
}

Curve pathCurve = null;
if (lineElement is CurveElement curveEl)
{
    pathCurve = curveEl.GeometryCurve;
}
else
{
    Println($"🚫 Selected element ({lineElement.Category?.Name}) is not a valid line.");
    return;
}

// 2. Resolve the FamilySymbol
FamilySymbol furnitureSymbol = new FilteredElementCollector(Doc)
    .OfClass(typeof(FamilySymbol))
    .OfCategory(BuiltInCategory.OST_Furniture)
    .Cast<FamilySymbol>()
    .FirstOrDefault(fs => $"{fs.FamilyName}: {fs.Name}" == p.FurnitureName);

if (furnitureSymbol == null)
{
    Println($"🚫 Furniture type '{p.FurnitureName}' not found.");
    return;
}

// 3. Divide the curve into segments
double curveLength = pathCurve.Length;
int instanceCount = (int)Math.Floor(curveLength / p.Spacing);

if (instanceCount < 1)
{
    Println($"⚠️ Path is too short for the specified spacing ({p.Spacing} ft). Placing 1 instance at the start.");
    instanceCount = 1;
}

// Handle unbound curves (full circles, ellipses)
bool isUnbound = !pathCurve.IsBound;
double startParam = isUnbound ? 0 : pathCurve.GetEndParameter(0);
double endParam = isUnbound ? (pathCurve.IsCyclic ? Math.PI * 2 : 1) : pathCurve.GetEndParameter(1);
double paramRange = endParam - startParam;

// 4. Place furniture at each point
Transact("Place Furniture on Path", () =>
{
    // Activate the symbol if needed
    if (!furnitureSymbol.IsActive)
    {
        furnitureSymbol.Activate();
        Doc.Regenerate();
    }

    int placed = 0;
    for (int i = 0; i < instanceCount; i++) // Changed to < to avoid overlap on closed curves
    {
        double t = (double)i / instanceCount;
        double param = startParam + t * paramRange;
        XYZ point = pathCurve.Evaluate(param, false); // Use raw parameter, not normalized

        // Get the tangent for rotation
        Transform curveTransform = pathCurve.ComputeDerivatives(param, false);
        XYZ tangent = curveTransform.BasisX.Normalize();
        double angle = Math.Atan2(tangent.Y, tangent.X);

        // Create the instance
        FamilyInstance inst = Doc.Create.NewFamilyInstance(point, furnitureSymbol, Autodesk.Revit.DB.Structure.StructuralType.NonStructural);

        // Rotate to align with path
        if (Math.Abs(angle) > 0.001)
        {
            Line axis = Line.CreateBound(point, point + XYZ.BasisZ);
            ElementTransformUtils.RotateElement(Doc, inst.Id, axis, angle);
        }

        placed++;
    }

    Println($"✅ Placed {placed} '{furnitureSymbol.FamilyName}' instances along the path.");
});

// --- Parameters ---
public class Params
{
    /// <summary>Click a Model Line or Detail Line to use as the path</summary>
    [Select(SelectionType.Element)]
    [Required]
    public Reference PathLine { get; set; }

    /// <summary>Choose the furniture type to place</summary>
    [RevitElements(TargetType = "FamilySymbol", Category = "Furniture")]
    [Required]
    public string FurnitureName { get; set; }

    /// <summary>Spacing between instances (in feet)</summary>
    [Range(0.5, 50.0)]
    [Unit("ft")]
    public double Spacing { get; set; } = 5.0;
}
