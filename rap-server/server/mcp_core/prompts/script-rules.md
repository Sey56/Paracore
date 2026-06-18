# Script Rules

Top-level statements only. No namespace, class Program, or Main() — the script IS the entry.
Classes/interfaces go at the BOTTOM after all top-level code.

ALL namespaces pre-imported — NEVER write `using` or fully-qualified names:
  CORRECT: XYZ p = new XYZ(0,0,0);  Wall.Create(...);  GetElements<Room>();
  WRONG:   using Autodesk.Revit.DB;  Autodesk.Revit.DB.XYZ p = ...;

NO IExternalApplication, IExternalCommand — this is dynamic execution, not an add-in.
NO FilteredElementCollector — use GetElements<T>() or GetElements("Category") instead.
