using Autodesk.Revit.DB.Structure;
using System.Linq;
using System.Collections.Generic;

// 1. Setup
var p = new Params();
SetExecutionTimeout(30); // Complex geometry operations may take time

// 2. Logic & Preparation
Println("🔍 Processing steel connection plates...");

// Get selected elements
var element1 = Doc.GetElement(new ElementId(p.BeamElement1));
var element2 = Doc.GetElement(new ElementId(p.BeamElement2));

if (element1 == null || element2 == null)
    throw new Exception("🚫 Please select two valid structural elements.");

// Verify elements are structural framing
if (!IsStructuralFraming(element1) || !IsStructuralFraming(element2))
    throw new Exception("🚫 Both elements must be structural framing (beams/columns).");

// Get geometry and intersection point
var intersection = GetIntersectionPoint(element1, element2);
if (intersection == null)
    throw new Exception("🚫 Selected elements don't intersect or are parallel.");

// Calculate plate dimensions based on element sizes and connection type
var plateDimensions = CalculatePlateDimensions(element1, element2, p.PlateThickness, p.ConnectionType);
Println($"📏 Plate dimensions: {UnitUtils.ConvertFromInternalUnits(plateDimensions.Width, UnitTypeId.Millimeters):F0}mm × " +
        $"{UnitUtils.ConvertFromInternalUnits(plateDimensions.Height, UnitTypeId.Millimeters):F0}mm × " +
        $"{UnitUtils.ConvertFromInternalUnits(p.PlateThickness, UnitTypeId.Millimeters):F0}mm");

// Calculate bolt hole pattern
var boltHoles = CalculateBoltPattern(plateDimensions, p.BoltDiameter, p.BoltSpacing, p.EdgeDistance);
Println($"🔩 Bolt pattern: {boltHoles.Count} holes, Ø{UnitUtils.ConvertFromInternalUnits(p.BoltDiameter, UnitTypeId.Millimeters):F0}mm");

// Get plate material
var material = new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Materials)
    .Cast<Material>()
    .FirstOrDefault(m => m.Name == p.PlateMaterial);

if (material == null)
    throw new Exception($"🚫 Material '{p.PlateMaterial}' not found in project.");

// 3. Execution - Create plate and bolt holes
Transact("Create Steel Connection Plate", () =>
{
    // Create plate solid (aligned to primary beam's web)
    var plateSolid = CreatePlateSolid(plateDimensions, intersection, element1);
    
    // Create DirectShape for the plate
    var directShape = DirectShape.CreateElement(Doc, new ElementId(BuiltInCategory.OST_GenericModel));
    directShape.ApplicationId = "SteelConnectionPlate";
    directShape.ApplicationDataId = "PlateV1";
    
    // Get orientation transform for bolts (to match plate)
    var curve = (element1.Location as LocationCurve)?.Curve;
    XYZ direction = (curve != null) ? (curve.GetEndPoint(1) - curve.GetEndPoint(0)).Normalize() : XYZ.BasisX;
    XYZ normal = direction.CrossProduct(XYZ.BasisZ).Normalize();
    
    Transform boltBaseTransform = Transform.Identity;
    boltBaseTransform.Origin = intersection;
    boltBaseTransform.BasisX = direction;
    boltBaseTransform.BasisY = XYZ.BasisZ;
    boltBaseTransform.BasisZ = normal;

    // Subtract bolt holes
    foreach (var holeLocalPos in boltHoles)
    {
        // Transform hole location to global
        XYZ holeGlobal = boltBaseTransform.OfPoint(holeLocalPos);
        var boltSolid = CreateBoltHoleSolid(holeGlobal, p.BoltDiameter, normal);
        plateSolid = BooleanOperationsUtils.ExecuteBooleanOperation(plateSolid, boltSolid, BooleanOperationsType.Difference);
    }
    
    // Set final geometry
    var geomList = new List<GeometryObject> { plateSolid };
    directShape.SetShape(geomList);
    
    // Set parameters
    directShape.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set("Steel Connection Plate");
    directShape.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set($"Connection between {element1.Id} and {element2.Id}");
    directShape.get_Parameter(BuiltInParameter.MATERIAL_ID_PARAM)?.Set(material.Id);
    
    // Add steel connection parameters
    using (var t2 = new SubTransaction(Doc))
    {
        t2.Start();
        
        var param = directShape.get_Parameter(BuiltInParameter.ALL_MODEL_TYPE_COMMENTS);
        if (param != null && param.IsReadOnly == false)
        {
            param.Set($"Type: {p.ConnectionType}, Thickness: {p.PlateThickness * 304.8:F1}mm");
        }
        
        // Add shared parameters if they exist
        AddSteelParameters(directShape, p);
        
        t2.Commit();
    }
    
    // Create dimension annotations if requested
    if (p.CreateDimensions)
    {
        CreatePlateDimensions(Doc, directShape, plateDimensions, intersection);
    }

    Println($"✅ Successfully created steel connection plate with {boltHoles.Count} bolt holes.");
    Println($"📄 Plate ID: {directShape.Id.Value}");
});

// 4. Helper Functions
bool IsStructuralFraming(Element element)
{
    return element.Category != null && 
           element.Category.Id.Value == (long)BuiltInCategory.OST_StructuralFraming;
}

XYZ GetIntersectionPoint(Element elem1, Element elem2)
{
    try
    {
        var curve1 = (elem1.Location as LocationCurve)?.Curve;
        var curve2 = (elem2.Location as LocationCurve)?.Curve;
        
        if (curve1 == null || curve2 == null)
            return null;
            
        var result = curve1.Intersect(curve2, out IntersectionResultArray results);
        if (result != SetComparisonResult.Overlap || results == null || results.Size == 0)
            return null;
            
        return results.get_Item(0).XYZPoint;
    }
    catch
    {
        return null;
    }
}

PlateDimensions CalculatePlateDimensions(Element elem1, Element elem2, double thickness, string connectionType)
{
    // Get beam profile dimensions (Width and Height/Depth)
    var dims1 = GetBeamProfileDimensions(elem1);
    var dims2 = GetBeamProfileDimensions(elem2);
    
    // For a fin plate (web connection), the height must fit BETWEEN the flanges.
    // Structural Rule of Thumb: Plate height is approx 60-80% of beam depth.
    double beamDepth = Math.Min(dims1.Height, dims2.Height);
    double plateHeight = beamDepth * 0.7; // Fit comfortably within the 'I' profile
    
    // Width should be enough for two rows of bolts + edge distance
    double plateWidth = 200.0 / 304.8; // 200mm default width

    // Apply minimum sizes (100mm -> ft)
    double minSize = 100.0 / 304.8;
    plateWidth = Math.Max(plateWidth, minSize);
    plateHeight = Math.Max(plateHeight, minSize);
    
    return new PlateDimensions(plateWidth, plateHeight, thickness);
}

(double Width, double Height) GetBeamProfileDimensions(Element elem)
{
    // Default to a reasonable beam size (300mm x 150mm in feet)
    double defaultW = 150.0 / 304.8;
    double defaultH = 300.0 / 304.8;

    try 
    {
        var typeId = elem.GetTypeId();
        if (typeId == ElementId.InvalidElementId) return (defaultW, defaultH);
        
        var type = Doc.GetElement(typeId) as FamilySymbol;
        if (type == null) return (defaultW, defaultH);

        // Try standard Revit structural parameter names ('b' for width, 'd' or 'h' for depth)
        double w = type.LookupParameter("b")?.AsDouble() ?? 
                   type.LookupParameter("Width")?.AsDouble() ?? 
                   type.LookupParameter("Section Width")?.AsDouble() ?? defaultW;

        double h = type.LookupParameter("d")?.AsDouble() ?? 
                   type.LookupParameter("Height")?.AsDouble() ?? 
                   type.LookupParameter("Section Height")?.AsDouble() ?? defaultH;

        return (w, h);
    }
    catch 
    {
        return (defaultW, defaultH);
    }
}

List<XYZ> CalculateBoltPattern(PlateDimensions dims, double boltDiameter, double spacing, double edgeDist)
{
    var holes = new List<XYZ>();
    
    // Protect against zero spacing
    if (spacing <= 0) spacing = 80.0 / 304.8;

    // available space
    double availW = dims.Width - 2 * edgeDist;
    double availH = dims.Height - 2 * edgeDist;

    // Number of bolts (at least 2 if space allows)
    int boltsX = (int)Math.Max(2, Math.Floor(availW / spacing) + 1);
    int boltsY = (int)Math.Max(2, Math.Floor(availH / spacing) + 1);
    
    // Centering calculation
    double startX = -(boltsX - 1) * spacing / 2.0;
    double startY = -(boltsY - 1) * spacing / 2.0;
    
    // Generate bolt positions relative to plate center
    for (int i = 0; i < boltsX; i++)
    {
        for (int j = 0; j < boltsY; j++)
        {
            double x = startX + i * spacing;
            double y = startY + j * spacing;
            holes.Add(new XYZ(x, y, 0));
        }
    }
    
    return holes;
}

Solid CreatePlateSolid(PlateDimensions dims, XYZ location, Element primaryBeam)
{
    var halfWidth = dims.Width / 2;
    var halfHeight = dims.Height / 2;
    
    // Base geometry in the local XY plane
    var curves = new CurveLoop();
    curves.Append(Line.CreateBound(new XYZ(-halfWidth, -halfHeight, 0), new XYZ(halfWidth, -halfHeight, 0)));
    curves.Append(Line.CreateBound(new XYZ(halfWidth, -halfHeight, 0), new XYZ(halfWidth, halfHeight, 0)));
    curves.Append(Line.CreateBound(new XYZ(halfWidth, halfHeight, 0), new XYZ(-halfWidth, halfHeight, 0)));
    curves.Append(Line.CreateBound(new XYZ(-halfWidth, halfHeight, 0), new XYZ(-halfWidth, -halfHeight, 0)));
    
    var solid = GeometryCreationUtilities.CreateExtrusionGeometry(
        new List<CurveLoop> { curves },
        XYZ.BasisZ,
        dims.Thickness
    );
    
    // ROTATION & ALIGNMENT:
    // A Fin Plate is VERTICAL. We need to rotate the XY plane so it aligns with the beam's web.
    var curve = (primaryBeam.Location as LocationCurve)?.Curve;
    XYZ direction = (curve != null) ? (curve.GetEndPoint(1) - curve.GetEndPoint(0)).Normalize() : XYZ.BasisX;
    
    // We want the plate's 'depth' to be the beam's vertical axis (Z)
    // And the plate's 'width' to be along the beam's direction (X)
    XYZ normal = direction.CrossProduct(XYZ.BasisZ).Normalize(); // Normal to the web
    
    Transform transform = Transform.Identity;
    transform.Origin = location - (normal * (dims.Thickness / 2.0)); // Center thickness on web
    transform.BasisX = direction;
    transform.BasisY = XYZ.BasisZ;
    transform.BasisZ = normal;

    return SolidUtils.CreateTransformed(solid, transform);
}

Solid CreateBoltHoleSolid(XYZ location, double diameter, XYZ normal)
{
    var radius = diameter / 2;
    double holeDepth = 1.0; 
    
    var curveLoop = new CurveLoop();
    var center = location - normal * (holeDepth / 2.0);
    
    // Define the circle plane using the web normal
    XYZ basisX = (Math.Abs(normal.Z) < 0.9) ? XYZ.BasisZ : XYZ.BasisX;
    XYZ basisY = normal.CrossProduct(basisX).Normalize();
    basisX = basisY.CrossProduct(normal).Normalize();

    var arc1 = Arc.Create(center, radius, 0, Math.PI, basisX, basisY);
    var arc2 = Arc.Create(center, radius, Math.PI, 2 * Math.PI, basisX, basisY);
    curveLoop.Append(arc1);
    curveLoop.Append(arc2);
    
    return GeometryCreationUtilities.CreateExtrusionGeometry(
        new List<CurveLoop> { curveLoop },
        normal,
        holeDepth
    );
}

void AddSteelParameters(Element element, Params p)
{
    try
    {
        // Try to set shared parameters if they exist
        var steelGradeParam = element.LookupParameter("Steel Grade");
        if (steelGradeParam != null && !steelGradeParam.IsReadOnly)
            steelGradeParam.Set(p.SteelGrade);
            
        var fabricationParam = element.LookupParameter("Fabrication Date");
        if (fabricationParam != null && !fabricationParam.IsReadOnly)
            fabricationParam.Set(DateTime.Now.ToString("yyyy-MM-dd"));
            
        var safetyFactorParam = element.LookupParameter("Safety Factor");
        if (safetyFactorParam != null && !safetyFactorParam.IsReadOnly)
            safetyFactorParam.Set(p.SafetyFactor);
    }
    catch
    {
        // Parameters don't exist - that's OK
    }
}

void CreatePlateDimensions(Document doc, Element plate, PlateDimensions dims, XYZ location)
{
    try
    {
        var view = doc.ActiveView;
        if (view == null) return;
        
        // Create temporary reference planes for dimensioning
        var plane = Plane.CreateByNormalAndOrigin(view.ViewDirection, location);
        var sketchPlane = SketchPlane.Create(doc, plane);
        
        // Create dimensions (simplified - would be more complex in production)
        var line = Line.CreateBound(
            location + new XYZ(-dims.Width/2, 0, 0),
            location + new XYZ(dims.Width/2, 0, 0)
        );
        
        // Dimension creation would go here
        // This is simplified as dimension creation requires more context
    }
    catch
    {
        // Dimension creation failed - not critical
        Println("⚠️ Could not create dimensions (view may not be suitable)");
    }
}

// 5. Data Classes
public class PlateDimensions
{
    public double Width { get; }
    public double Height { get; }
    public double Thickness { get; }
    
    public PlateDimensions(double width, double height, double thickness)
    {
        Width = width;
        Height = height;
        Thickness = thickness;
    }
}

// 6. Parameters Class (MUST BE LAST)
public class Params
{
    #region Element Selection
    
    [Select(SelectionType.Element)]
    [Required]
    /// <summary>First structural element (beam or column)</summary>
    public long BeamElement1 { get; set; }
    
    [Select(SelectionType.Element)]
    [Required]
    /// <summary>Second structural element (beam or column)</summary>
    public long BeamElement2 { get; set; }
    
    #endregion
    
    #region Plate Properties
    
    [Unit("mm")]
    [Range(6, 100, 2)]
    [Required]
    /// <summary>Thickness of the connection plate</summary>
    public double PlateThickness { get; set; } = 12.0; // 12mm default
    
    [RevitElements(TargetType = "Material", Category = "Materials")]
    /// <summary>Material for the steel plate</summary>
    public string PlateMaterial { get; set; } = "Steel";
    
    public List<string> ConnectionType_Options => new List<string> { "Beam to Column", "Beam to Beam", "Column Base Plate", "Gusset Plate" };
    [Required]
    /// <summary>Type of steel connection</summary>
    public string ConnectionType { get; set; } = "Beam to Column";
    
    public List<string> SteelGrade_Options => new List<string> { "A36", "A572 Gr.50", "A992", "A500 Gr.B", "Custom" };
    /// <summary>Steel grade/material specification</summary>
    public string SteelGrade { get; set; } = "A36";
    
    [Range(1.0, 3.0, 0.1)]
    /// <summary>Safety factor for connection design</summary>
    public double SafetyFactor { get; set; } = 1.5;
    
    #endregion
    
    #region Bolt Properties
    
    [Unit("mm")]
    [Range(8, 30, 2)]
    [Required]
    /// <summary>Diameter of bolt holes</summary>
    public double BoltDiameter { get; set; } = 16.0; // M16 bolts
    
    [Unit("mm")]
    [Range(40, 200, 10)]
    [Required]
    /// <summary>Spacing between bolt centers</summary>
    public double BoltSpacing { get; set; } = 80.0;
    
    [Unit("mm")]
    [Range(20, 100, 5)]
    [Required]
    /// <summary>Distance from plate edge to first bolt</summary>
    public double EdgeDistance { get; set; } = 40.0;
    
    public List<string> BoltHeadType_Options => new List<string> { "Hex Head", "Square Head", "Socket Head", "Button Head" };
    /// <summary>Type of bolt head</summary>
    public string BoltHeadType { get; set; } = "Hex Head";
    
    #endregion
    
    #region Advanced Options
    
    [Range(1, 10, 1)]
    /// <summary>Number of washers per bolt</summary>
    public int WashersPerBolt { get; set; } = 2;
    
    public List<string> HoleType_Options => new List<string> { "Standard", "Oversized", "Slotted" };
    /// <summary>Type of hole (standard, oversized for adjustment, or slotted)</summary>
    public string HoleType { get; set; } = "Standard";
    
    /// <summary>Create dimension annotations for fabrication</summary>
    public bool CreateDimensions { get; set; } = true;
    
    /// <summary>Add weld symbols to connection</summary>
    public bool AddWeldSymbols { get; set; } = false;
    
    #endregion
    
    #region Fabrication Notes
    
    [Pattern(@"^[A-Za-z0-9\s\-_]*$")]
    /// <summary>Fabrication shop identifier</summary>
    public string FabricationShop { get; set; } = "SHOP-01";
    
    /// <summary>Additional notes for fabricator</summary>
    public string FabricationNotes { get; set; } = "Fit in field";
    
    [EnabledWhen("AddWeldSymbols", "true")]
    /// <summary>Weld size if weld symbols are added</summary>
    [Unit("mm")]
    public double WeldSize { get; set; } = 6.0;
    
    #endregion
}