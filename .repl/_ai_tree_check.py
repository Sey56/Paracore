#!/usr/bin/env python3
"""GATE — the AI-instruction tree must still teach every rule it used to teach.

WHY THIS EXISTS
    The instruction set was restructured (2026-10-09) from ONE 831-line gallery guide plus a
    321-line VS Code guide into a progressive-disclosure tree under `paracore/ai/`. A restructure
    that silently drops a rule is worse than no restructure: the agent keeps writing code, and
    nothing says the guidance changed.

    The rules below are an INVENTORY of what the two old guides taught, written down as literal
    strings. Each one must appear in the composed tree. ⚠ The list is deliberately literal rather
    than semantic — a phrase is either there or it is not, and "it is obviously still covered" is
    exactly the reasoning that loses a rule.

WHAT IT CHECKS
    `EVERYWHERE`  — must be present in BOTH composed trees (shared + vscode, shared + desktop).
                    These are the shared contract and the engine API, which both flows use.
    `DESKTOP`     — must be present in the desktop tree only (the `Params`/tool anatomy, and the
                    gallery-specific layout). The VS Code tree must NOT contain the tool skill.
    `VSCODE`      — must be present in the VS Code tree only.

⚠ A MISSING RULE IS A FAILURE, NOT A WARNING. An empty scan must fail (rule 3): if the trees are
absent, that is an error, never a pass.

Usage:  python _ai_tree_check.py     (exit 0 = every rule survived)
"""
import sys
from pathlib import Path

FREE = Path(r"C:\Users\seyou\Paracore\paracore")
DESKTOP_TREE = FREE / "rap-server" / "server" / "api" / "ai_workspace"
VSCODE_TREE = FREE / "corescript-vscode" / "ai"

# (label, [literal strings that must all appear])
EVERYWHERE = [
    ("never FilteredElementCollector", ["FilteredElementCollector"]),
    ("never get_Parameter / LookupParameter", ["get_Parameter", "LookupParameter"]),
    ("never .AsString()/.AsDouble()", [".AsString()", ".AsDouble()"]),
    ("never Console.WriteLine", ["Console.WriteLine"]),
    ("ElementId.Value, not IntegerValue", ["IntegerValue", ".Value"]),
    ("no namespace / class Program / Main()", ["namespace", "class Program", "static void Main()"]),
    ("top-level statements", ["Top-level statements", "top-level statements"]),
    ("exactly one entry file", ["Only one script file can contain top-level statements"]),
    ("definitions last", ["class", "struct", "interface", "enum"]),
    ("types-only in other files", ["TYPES ONLY"]),
    ("no using statements", ["using"]),
    ("RestSharp exception", ["RestSharp", "Autodesk.Revit.DB.Parameter"]),
    ("globals.cs is IntelliSense only", ["Globals.cs", "IntelliSense only"]),
    ("3-tier order: API -> LINQ -> raw", ["LINQ", "raw Revit API"]),
    ("Transact", ["Transact"]),
    ("no manual Transaction", ["new Transaction"]),
    ("no Doc.Regenerate outside a tx", ["Doc.Regenerate()", "Regen()"]),
    ("no foreach write without Transact", ["foreach"]),
    ("units: pass the string", ["InputUnit", "OutputUnit"]),
    ("never manual unit math", ["3.28084", "0.3048"]),
    ("unit strings list", ["mm", "sqm", "cuft"]),
    ("no == on doubles", ["IsAlmostEqualTo", "AlmostZero"]),
    ("comparisons", ["IsLessThan", "IsGreaterThan", "IsLessThanOrEqual", "IsGreaterThanOrEqual",
                     "IsPositive", "IsNegative"]),
    ("Select before Table", [".Select()", ".Table()"]),
    ("GroupByParam chains to Table", ["GroupByParam"]),
    ("no unit suffix in columns", ["unit suffix"]),
    ("Println", ["Println"]),
    ("SetExecutionTimeout", ["SetExecutionTimeout"]),
    ("GetElements<T>() typed", ["GetElements<Wall>()"]),
    ("GetElements<T>(category)", ['GetElements<FamilyInstance>("Doors")']),
    ("GetElements(category)", ['GetElements("Walls")']),
    ("BuiltInCategory query", ["BuiltInCategory"]),
    ("no StructuralColumn type", ["StructuralColumn"]),
    ("plural category name", ["PLURAL category name"]),
    ("lenient category matching", ["StructuralColumns"]),
    ("GetElement single", ["GetElement<"]),
    ("GetMagicNames / GetCategories", ["GetMagicNames()", "GetCategories()"]),
    ("PipelineEnumerable diagnostics", ["PipelineEnumerable"]),
    ("parameter name table: walls", ["Base Constraint", "Unconnected Height"]),
    ("parameter name table: columns", ["Base Level"]),
    ("GetStr / GetNum / GetVal / GetInt", ["GetStr", "GetNum", "GetVal", "GetInt"]),
    ("type-level getters", ["GetTypeStr", "GetTypeNum", "GetTypeInt", "GetTypeVal",
                            "GetElementType()"]),
    ("GetStr Level fallback", ["Level"]),
    ("SetVal / SetNum", ["SetVal", "SetNum"]),
    ("type-level setters", ["SetTypeVal", "SetTypeNum"]),
    ("WhereParam string", ["WhereParam"]),
    ("WhereParam operators", ["contains", "starts", "ends"]),
    ("WhereCategory OR", ["WhereCategory"]),
    ("WhereAnyParam", ["WhereAnyParam"]),
    ("WhereTypeParam", ["WhereTypeParam"]),
    ("WhereMatches", ["WhereMatches"]),
    ("WhereMaterial / Not", ["WhereMaterial", "WhereMaterialNot"]),
    ("Where lambda", [".Where("]),
    ("OrderByParam / Desc", ["OrderByParam", "OrderByParamDesc"]),
    ("GroupByParam with sum", ["GroupByParam", "SumParam"]),
    ("SetParam", ["SetParam"]),
    ("SetTypeParam", ["SetTypeParam"]),
    ("SetParam factory overloads", ["=>"]),
    ("collection UI", ["Select()", "Zoom()", "Isolate()", "Hide()", "Unhide()", "Delete()"]),
    ("StandardDoor", ["StandardDoor"]),
    ("doors: RoomFrom/RoomTo", ["RoomFrom()", "RoomTo()"]),
    ("doors: Handing/HingeSide", ["Handing()", "HingeSide()"]),
    ("doors: flips", ["IsHandFlipped", "IsFacingFlipped"]),
    ("doors: FindSwingArc", ["FindSwingArc()"]),
    ("materials", ["Materials()", "MaterialNames()", "GetMaterialNames()"]),
    ("geometry", ["GeometrySummary()"]),
    ("discovery", ["CombinedParams()", "InstanceParams()", "TypeParams()", "BuiltInParams()",
                   "NativeProperties()", "ParamsDict()", "ReflectionProperties()",
                   "ReflectionMethods()"]),
    ("Peek", ["Peek()"]),
    ("FamilyName / Matches", ["FamilyName", "Matches("]),
    ("ToElement", ["ToElement("]),
    ("ToNotebook", ["ToNotebook("]),
    ("charts", ["BarGraph", "PieGraph", "LineGraph"]),
    ("FormatUnit / FormatValueOnly", ["FormatUnit", "FormatValueOnly"]),
    ("RoundTo / ToMeters", ["RoundTo", "ToMeters"]),
    ("ExportImage", ["ExportImage"]),
    ("raw-API fallback example", ["get_Geometry", "Options"]),
    ("not an add-in", ["IExternalCommand", "IExternalApplication"]),
    ("skills exist", ["paracore-engine"]),
    ("instructions file referenced", ["instructions/scripts.instructions.md"]),
]

DESKTOP = [
    ("Params class", ["class Params"]),
    ("Params is the only scanned class", ["only"]),
    ("flat properties", ["flat"]),
    ("instantiate at the top", ["new Params()"]),
    ("p.Prop not Params.Prop", ["p."]),
    ("region grouping", ["#region"]),
    ("UI control mapping", ["Dropdown", "Toggle"]),
    ("List<T> multi-select", ["List<T>", "checkboxes"]),
    ("[Unit]", ["[Unit("]),
    ("[Range]", ["[Range("]),
    ("[Required]", ["[Required]"]),
    ("[Confirm]", ["[Confirm("]),
    ("[Select(SelectionType", ["[Select(SelectionType"]),
    ("[EnabledWhen]", ["[EnabledWhen("]),
    ("[RevitElements]", ["[RevitElements("]),
    ("[InputFile]/[OutputFile]", ["[InputFile(", "[OutputFile("]),
    ("[FolderPath]", ["[FolderPath]"]),
    ("[Color]", ["[Color]"]),
    ("[Stepper]", ["[Stepper]"]),
    ("[Segmented]", ["[Segmented]"]),
    ("no imperial [Unit]", ["NEVER use `[Unit]` for imperial"]),
    ("[Unit] already converts", ["already"]),
    ("_Options", ["_Options"]),
    ("_Visible", ["_Visible"]),
    ("_Range", ["_Range"]),
    ("paracore-tool skill", ["paracore-tool"]),
    ("two kinds of script", ["plain script", "TOOL"]),
]

VSCODE = [
    ("Ctrl+Shift+R", ["Ctrl+Shift+R"]),
    ("Main.cs entry file", ["Main.cs"]),
    ("CoreScript output channel", ["CoreScript"]),
    ("Server toggle", ["Server"]),
    ("global.json", ["global.json"]),
    ("csproj", [".csproj"]),
    ("editorconfig", [".editorconfig"]),
    ("no Params class here", ["Params"]),
    ("not a gallery project", ["gallery"]),
    ("cannot edit between authoring and execution", ["no dialog", "in the source"]),
]


def read_tree(root: Path) -> str:
    """Every file under `root`, as ONE whitespace-normalised blob.

    ⚠ WHITESPACE IS NORMALISED, and that is load-bearing. A prose rule wraps across lines
    ("…The engine throws *\"Only one script file\\n  can contain top-level statements.\"*"), so a
    literal substring search misses a rule that IS present. An earlier version of this gate did
    exactly that and reported a phantom gap — collapsing runs of whitespace to one space makes the
    check line-wrap-insensitive. Markers must therefore contain no newline and no double space.
    """
    if not root.is_dir():
        return ""
    parts = [
        p.read_text(encoding="utf-8", errors="replace")
        for p in sorted(root.rglob("*"))
        if p.is_file()
    ]
    return " ".join(" ".join(parts).split())


def main() -> int:
    desktop = read_tree(DESKTOP_TREE)
    vscode = read_tree(VSCODE_TREE)

    # ⚠ an EMPTY scan must FAIL — a gate with no input is not a pass
    if not desktop or not vscode:
        print(f"FAIL: a tree is missing or empty.\n  desktop={DESKTOP_TREE} ({len(desktop)} chars)"
              f"\n  vscode ={VSCODE_TREE} ({len(vscode)} chars)")
        return 1

    failures: list[str] = []
    checked = 0

    for label, needles in EVERYWHERE:
        checked += 1
        for where, text in (("desktop", desktop), ("vscode", vscode)):
            absent = [n for n in needles if n not in text]
            if absent:
                failures.append(f"EVERYWHERE/{where}: {label} — missing {absent}")

    for label, needles in DESKTOP:
        checked += 1
        absent = [n for n in needles if n not in desktop]
        if absent:
            failures.append(f"DESKTOP: {label} — missing {absent}")

    for label, needles in VSCODE:
        checked += 1
        absent = [n for n in needles if n not in vscode]
        if absent:
            failures.append(f"VSCODE: {label} — missing {absent}")

    # the tool skill must NOT leak into the VS Code tree
    checked += 1
    if (VSCODE_TREE / "skills" / "paracore-tool").exists():
        failures.append("VSCODE: paracore-tool leaked into the VS Code tree")

    print(f"rule groups checked: {checked}")
    print(f"desktop tree: {len(desktop):,} chars   vscode tree: {len(vscode):,} chars")
    if failures:
        print(f"\n{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  ✗ {f}")
        return 1
    print("\nVERDICT: every rule survived the restructure")
    return 0


if __name__ == "__main__":
    sys.exit(main())
