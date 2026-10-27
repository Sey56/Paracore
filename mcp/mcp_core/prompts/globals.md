# Globals & Forbidden Patterns

## GLOBALS — use EXACTLY these names (PascalCase)

```
Doc          → Autodesk.Revit.DB.Document (active document)
UIDoc        → Autodesk.Revit.UI.UIDocument
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
Regen()                      → regenerate the document (safe wrapper around Doc.Regenerate())
Table(object)                → render as interactive data grid
BarGraph(object)             → render bar chart
PieGraph(object)             → render pie chart
LineGraph(object)            → render line chart
```

## QUERY PATTERNS — use Paracore methods

```
GetElements("Walls")                     → all elements of that category
GetElements<Wall>()                      → typed retrieval
GetElements("Walls").Count()             → count elements
.WhereParam("Name", "value")             → filter by parameter value
.WhereParam("Name", "contains", "txt")   → filter by parameter CONTAINS text
.WhereParam("Area", ">", 25, "m2")       → numeric comparison
.WhereMatches("pattern")                 → element NAME / family name only — NOT a parameter
.OrderByParam("Name")                    → sort ascending
.OrderByParamDesc("Name")                → sort descending
.GroupByParam("Name")                    → group + count → chain .Table()
.GroupByParam("Name", "Area", "m2")      → group + count + sum → chain .Table()
.Select(e => new { ... })                → project columns → .Table()
.First().CombinedParams().Table()        → discover ALL parameters on an element
```

## WRITE PATTERNS (the `_execute_dynamic_query` tool only — auto-transacted)

```
e.SetVal("Comments", "Done")             → single element write
e.SetNum("Offset", -150, "mm")           → unit-aware numeric write
e.Delete()                               → single element delete
e.Hide() / e.Unhide() / e.Isolate()      → visibility control
GetElements("Walls").SetParam("Comments", "Done")   → bulk write, ONE transaction
GetElements("Walls").Delete()            → BIM-safe bulk delete
```

⚠ **A write COMMITS and nothing keeps the old values.** Before overwriting or clearing a
parameter — especially with a bulk `.SetParam()` — read the current value and put it in your
answer, so the user can put it back:

```
GetElements("Walls").Select(e => new { e.Id, Mark = e.GetStr("Mark") }).Table()
```

Never call a value "the original" unless you read it. Restoring something you never captured
means guessing, so say that you are guessing, or ask.

## REJECTED — these cannot work, so they are refused before anything runs

```
❌ doc  /  document  (lowercase)                 → use Doc (capital D)
❌ doc.ProjectInformation                        → use Doc.ProjectInformation
❌ .GroupByParam("X").Select(...)                → chain .Table() straight onto the group
❌ Transact(() => { ... })                       → the first argument MUST be a name string
❌ .CombinedParams("anything")                   → it takes NO arguments
❌ AllElements                                   → use GetElements()
❌ .WhereParam(...).SetVal(...) / .SetNum(...)   → single-element only; use .SetParam() for bulk
```

## AVOID — these RUN, with an advisory note attached

⚠ A note is not a refusal. These snippets EXECUTE — the engine only suggests the Paracore
method. Do not avoid this list as though it were an error; use it when it is genuinely better.

```
⚠ new FilteredElementCollector(Doc)...          → prefer GetElements()
⚠ .OfCategory(BuiltInCategory.OST_...)          → the name alone: GetElements("Walls")
⚠ .WhereElementIsNotElementType()               → GetElements() already excludes types
⚠ foreach+Println loops for data display        → .Select(...).Table()
⚠ LookupParameter / get_Parameter("Name")       → .GetStr() / .GetNum()
⚠ .AsString() / .AsDouble()                     → .GetStr() / .GetNum()
⚠ Console.WriteLine()                           → its output is NOT captured; use Println()
⚠ UnitType.UT_Area / OutputUnit.SquareMeters    → unit strings: "m2", "mm", etc.
```

## TIME BUDGET — a script is killed after 90 s of wall clock

The engine injects a timeout check into every loop body, so an accidental infinite loop
throws instead of freezing Revit. The check runs at the START of each loop iteration.

```
SetExecutionTimeout(600);        → FIRST line of the snippet to raise the budget for a long run
```

⚠ It must be the first statement: a check that has already fired cannot be un-fired.

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
