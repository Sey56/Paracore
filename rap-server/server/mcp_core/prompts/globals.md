# Globals & Forbidden Patterns

## GLOBALS — use EXACTLY these names (PascalCase)

```
Doc          → Autodesk.Revit.DB.Document (active document)
Uidoc        → Autodesk.Revit.UI.UIDocument
UIApp        → Autodesk.Revit.UI.UIApplication
ActiveView   → Autodesk.Revit.DB.View (current active view)
Selection    → List<Element> of currently selected elements
```

## METHODS — always available

```
Println(string)              → output a line of text
GetElements<T>()             → typed retrieval (e.g. GetElements<Wall>())
GetElements(string)          → category string retrieval
GetElement<T>(string)        → single element by name/id
GetMagicNames()              → all targetable category/family/class names
GetCategories()              → all project category names
Transact(string, Action)     → wrap writes in a single undo transaction
Table(object)                → render as interactive data grid
BarChart(object) / BarGraph  → render bar chart
PieChart(object) / PieGraph  → render pie chart
LineChart(object)/LineGraph  → render line chart
```

## QUERY PATTERNS — use Paracore methods

```
GetElements("Walls")                     → all elements of that category
GetElements<Wall>()                      → typed retrieval
GetElements("Walls").Count()             → count elements
.WhereParam("Name", "value")             → filter by parameter value
.WhereParam("Area", ">", 25, "m2")       → numeric comparison
.WhereMatches("pattern")                 → fuzzy name/family match
.OrderByParam("Name")                    → sort ascending
.OrderByParamDesc("Name")                → sort descending
.GroupByParam("Name")                    → group + count → chain .Table()
.GroupByParam("Name", "Area", "m2")      → group + count + sum → chain .Table()
.Select(e => new { ... })                → project columns → .Table()
.First().CombinedParams().Table()        → discover ALL parameters on an element
```

## WRITE PATTERNS (execute_dynamic_query only — auto-transacted)

```
e.SetVal("Comments", "Done")             → single element write
e.SetNum("Offset", -150, "mm")           → unit-aware numeric write
e.Delete()                               → single element delete
e.Hide() / e.Unhide() / e.Isolate()      → visibility control
GetElements("Walls").SetParam("Comments", "Done")   → bulk write, ONE transaction
GetElements("Walls").Delete()            → BIM-safe bulk delete
```

## FORBIDDEN — these raw Revit API patterns will be REJECTED

```
❌ new FilteredElementCollector(Doc)...          → use GetElements()
❌ doc  /  ActiveDocument  /  activeDocument     → use Doc (capital D)
❌ doc.ProjectInformation                        → use Doc.ProjectInformation
❌ .OfCategory(BuiltInCategory.OST_...)          → use GetElements("Category")
❌ .WhereElementIsNotElementType()               → use GetElements()
❌ foreach+Println loops for data display        → use .Select().Table()
❌ LookupParameter / get_Parameter               → use .GetStr() / .GetNum()
❌ .AsString() / .AsDouble()                     → use .GetStr() / .GetNum()
❌ Console.WriteLine()                           → use Println()
❌ UnitType.UT_Area / OutputUnit.SquareMeters     → use unit strings: "m2", "mm", etc.
```

## PROJECT INFO

```
Doc.ProjectInformation.Name      → project name
Doc.ProjectInformation.Number    → project number
Doc.ProjectInformation.ClientName → client
Doc.ProjectInformation.Address   → address
Doc.Title                        → file title
Doc.PathName                     → file path
Doc.IsWorkshared                 → workshared status
```
