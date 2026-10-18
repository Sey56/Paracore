using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.DB.Electrical;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.PixelFormats;
using RestSharp;
using MiniExcelLibs;
using MathNet.Numerics;
using MathNet.Numerics.LinearAlgebra;
using MathNet.Numerics.Statistics;
using Microsoft.CSharp;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Provides the core API for Paracore scripts. 
    /// These members are available globally in every script via implicit static usings.
    /// </summary>
    public static partial class ScriptApi
    {
        private static ExecutionGlobals Globals => ExecutionGlobals.Current.Value ?? throw new InvalidOperationException("Script context is not available. Ensure the script is run through the engine.");

        /// <summary>
        /// Represents the active Revit UI application.
        /// <para>Provides access to UI events, ribbon panels, and the currently active document.</para>
        /// </summary>
        public static UIApplication UIApp => Globals.UIApp;

        /// <summary>
        /// Represents the currently active project document in the Revit user interface.
        /// <para>
        /// Use this to access UI-specific operations like the active selection
        /// (<see cref="Autodesk.Revit.UI.UIDocument.Selection">UIDocument.Selection</see>)
        /// or to prompt the user for input.
        /// </para>
        /// </summary>
        public static UIDocument UIDoc => Globals.UIDoc;

        /// <summary>
        /// Represents the currently active database level Document.
        /// </summary>
        public static Document Doc => Globals.Doc;

        /// <summary>
        /// Represents the currently active view in Revit.
        /// </summary>
        public static View ActiveView => Doc.ActiveView;

        /// <summary>
        /// Gets the current selection in the Revit user interface.
        /// </summary>
        public static List<Element> Selection => UIDoc.Selection.GetElementIds().Select(id => Doc.GetElement(id)).ToList();

        /// <summary>
        /// Prompts the user to pick a single element in the Revit UI.
        /// </summary>
        public static Element Pick() => Doc.GetElement(UIDoc.Selection.PickObject(Autodesk.Revit.UI.Selection.ObjectType.Element));

        /// <summary>
        /// A dictionary of parameters passed from the agent or UI context.
        /// </summary>
        public static Dictionary<string, object> Parameters => Globals.Parameters;

        /// <summary>
        /// Prints a message to the unified output console.
        /// <para>
        /// Supports standard string interpolation (e.g., <c>$"Count: {x}"</c>).
        /// </para>
        /// </summary>
        /// <param name="message">The message string to print. Use <c>$""</c> for variables.</param>
        public static void Println(string message)
        {
            Globals.Println(message);
        }

        public static void Println(object message)
        {
            Globals.Println(message);
        }

        /// <summary>
        /// Prints an empty line to the unified output console.
        /// </summary>
        public static void Println()
        {
            Globals.Println(""); // Restored for backward compatibility
        }

        /// <summary>
        /// Alias for <see cref="Println(string)">Println</see>. Prints a message to the console.
        /// </summary>
        public static void Print(string message)
        {
            Globals.Print(message);
        }

        public static void Print(object message)
        {
            Globals.Print(message);
        }


        /// <summary>
        /// Starts a new Revit transaction with the specified name and RETURNS what it did.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The action to execute within the transaction scope. The current <see cref="Document"/> is passed as an argument.</param>
        /// <returns>
        /// A <see cref="TxReport"/> — the ids created, modified and deleted, plus an explicit
        /// <see cref="TxReport.RolledBack"/> flag.
        /// <para>
        /// ⚠ <b>Read it.</b> Revit answers a refused edit by rolling the transaction back and
        /// returning a status INSTEAD of throwing, so a write call that returns normally can
        /// still have changed nothing. A bare <c>Transact("…", () =&gt; …);</c> is fine — the
        /// report is PRINTED for you — but when you need to branch on the outcome, read this.
        /// </para>
        /// </returns>
        public static TxReport Transact(string name, Action<Document> action)
        {
            return Globals.Transact(name, action);
        }

        /// <summary>
        /// Starts a new Revit transaction with the specified name and RETURNS what it did.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The parameterless action to execute within the transaction scope.</param>
        /// <returns>A <see cref="TxReport"/> — read <see cref="TxReport.RolledBack"/>.</returns>
        public static TxReport Transact(string name, Action action)
        {
            return Globals.Transact(name, action);
        }

        /// <summary>
        /// Regenerates the document — a safe wrapper around
        /// <see cref="Document.Regenerate">Document.Regenerate()</see>.
        /// <para>
        /// ⚠ <b>Why this exists.</b> <c>Doc.Regenerate()</c> requires an open transaction, and
        /// calling it without one throws Revit's generic
        /// <i>"Modification of the document is forbidden"</i> — a message that names neither the
        /// method nor the cause. This wrapper opens the transaction for you, so the safe path is
        /// also the easy one.
        /// </para>
        /// <para>
        /// ⚠ <b>You usually do not need it.</b> A committed transaction already regenerates, and
        /// <see cref="ExportImage">ExportImage</see> exports after the model has settled. Reach
        /// for <c>Regen()</c>
        /// only when you must force a regeneration <i>between</i> two reads in the same script,
        /// outside any transaction of your own.
        /// </para>
        /// </summary>
        public static void Regen()
        {
            // ⚠ The report is discarded HERE ON PURPOSE, not by accident: the regenerated model
            //   is already the answer, and Regen() is called from read paths that have no use
            //   for a created/modified id list. The report is still PRINTED by Tx itself, so a
            //   regeneration that Revit refused is never silent. (A bare statement would trip
            //   IDE0058, which is exactly the analyzer enforcing "discard this on purpose".)
            _ = Transact("Regenerate", () => Doc.Regenerate());
        }

        /// <summary>
        /// Renders data provided as a specific type in the UI.
        /// </summary>
        /// <param name="type">The type of display (e.g., "table", "chart-bar").</param>
        /// <param name="data">The structured data object to display.</param>
        public static void Show(string type, object data)
        {
            Globals.Output.Show(type, data);
        }

        /// <summary>
        /// Renders a list of objects as an interactive table in the Summary tab.
        /// </summary>
        public static void Table(object data)
        {
            Globals.Output.Table(data);
        }

        /// <summary>
        /// Renders elements as a compact table with columns adapted to element kind.
        /// Types/Symbols: Id | Family | Type | Category
        /// Instances:     Id | Family | Type | Category
        /// Use .Select() before .Table() for custom columns.
        /// Use .CombinedParams().Table() for full parameter discovery.
        /// </summary>
        public static void Table(IEnumerable<Element> elements)
        {
            // The element→compact-column adaptation is shared with the .Table() extension;
            // see Output.AdaptElementsForTable. It used to exist twice and could drift.
            var compact = Output.AdaptElementsForTable(elements);
            if (compact == null) return;

            Globals.Output.Table(compact);
        }

        /// <summary>
        /// Selects the specified elements in the Revit user interface and zooms to them.
        /// </summary>
        public static void Select(IEnumerable<Element> elements)
        {
            if (UIDoc == null)
            {
                return;
            }

            var ids = elements.Select(e => e.Id).ToList();
            UIDoc.Selection.SetElementIds(ids);
            Zoom(elements);
        }

        /// <summary>
        /// Temporarily isolates the specified elements in the active view and zooms to them.
        /// </summary>
        public static void Isolate(IEnumerable<Element> elements)
        {
            if (Doc == null || Doc.ActiveView == null)
            {
                return;
            }

            var ids = elements.Select(e => e.Id).ToList();
            Doc.ActiveView.IsolateElementsTemporary(ids);
            Zoom(elements);
        }

        /// <summary>
        /// Zooms the active view to fit the specified elements.
        /// </summary>
        public static void Zoom(IEnumerable<Element> elements)
        {
            if (UIDoc == null)
            {
                return;
            }

            var elementList = elements.ToList();
            if (elementList.Count == 0)
            {
                return;
            }

            // Compute a union bounding box of all elements
            BoundingBoxXYZ unionBox = null;
            foreach (var el in elementList)
            {
                var bb = el.get_BoundingBox(Doc.ActiveView);
                if (bb == null)
                {
                    continue;
                }

                if (unionBox == null)
                {
                    unionBox = new BoundingBoxXYZ { Min = bb.Min, Max = bb.Max };
                }
                else
                {
                    unionBox.Min = new XYZ(
                        Math.Min(unionBox.Min.X, bb.Min.X),
                        Math.Min(unionBox.Min.Y, bb.Min.Y),
                        Math.Min(unionBox.Min.Z, bb.Min.Z));
                    unionBox.Max = new XYZ(
                        Math.Max(unionBox.Max.X, bb.Max.X),
                        Math.Max(unionBox.Max.Y, bb.Max.Y),
                        Math.Max(unionBox.Max.Z, bb.Max.Z));
                }
            }
            if (unionBox == null)
            {
                return;
            }

            var uiViews = UIDoc.GetOpenUIViews();
            var activeView = Doc.ActiveView;
            var currentUIView = uiViews.FirstOrDefault(v => v.ViewId == activeView.Id);

            if (currentUIView != null)
            {
                currentUIView.ZoomAndCenterRectangle(unionBox.Min, unionBox.Max);
            }
        }

        /// <summary>
        /// Renders a bar chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void BarGraph(object data)
        {
            Globals.Output.BarGraph(data);
        }

        /// <summary>
        /// Renders a pie chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void PieGraph(object data)
        {
            Globals.Output.PieGraph(data);
        }

        /// <summary>
        /// Renders a line chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void LineGraph(object data)
        {
            Globals.Output.LineGraph(data);
        }

        /// <summary>
        /// Sets the execution timeout for the current script. Default is 10 seconds.
        /// Call this at the start of your script if you need more time for long-running operations.
        /// </summary>
        public static void SetExecutionTimeout(int seconds)
        {
            ExecutionGlobals.SetExecutionTimeout(seconds);
        }

        /// <summary>
        /// Finds the first element of type T with the specified name or magic identity.
        /// </summary>
        public static T? GetElement<T>(string identity) where T : Element
        {
            var collector = Core.ParameterOptionsComputer.CreateResilientCollector(Doc, typeof(T));
            return collector
                .Cast<Element>()
                .Where(e => e is T)
                .Cast<T>()
                .FirstOrDefault(x =>
                    x.Name.Equals(identity, StringComparison.OrdinalIgnoreCase) ||
                    Core.ParameterOptionsComputer.GetElementIdentity(x).Equals(identity, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Finds the first element matching the specified name or magic identity.
        /// </summary>
        public static Element? GetElement(string identity)
        {
            // Use a broad collector for generic discovery
            var collector = new FilteredElementCollector(Doc).WhereElementIsNotElementType();
            return collector
                .Cast<Element>()
                .FirstOrDefault(x =>
                    x.Name.Equals(identity, StringComparison.OrdinalIgnoreCase) ||
                    Core.ParameterOptionsComputer.GetElementIdentity(x).Equals(identity, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Finds all elements of type T in the document. ⚠ T alone decides INSTANCES vs TYPES:
        /// `GetElements&lt;Wall&gt;()` is wall instances, `GetElements&lt;WallType&gt;()` is the
        /// wall types. ⚠⚠ With NO category filter this scans the WHOLE document —
        /// `GetElements&lt;FamilyInstance&gt;()` returns EVERY loadable instance in the model and
        /// `GetElements&lt;FamilySymbol&gt;()` every symbol, so prefer
        /// `GetElements&lt;FamilyInstance&gt;("Doors")` unless you truly want all of them.
        /// </summary>
        public static PipelineEnumerable<T> GetElements<T>() where T : Element
        {
            var collector = Core.ParameterOptionsComputer.CreateResilientCollector(Doc, typeof(T));
            var results = collector
                .Cast<Element>()
                .Where(e => e is T)
                .Cast<T>()
                .ToList();
            return new PipelineEnumerable<T>(results, track: false);
        }

        /// <summary>
        /// Finds all elements of type T belonging to a specific category. Example:
        /// `GetElements&lt;FamilyInstance&gt;("Doors")`. ⚠ T decides INSTANCES vs TYPES and it is
        /// the ONLY thing that does: `GetElements&lt;FamilyInstance&gt;("Doors")` is door
        /// instances, while `GetElements&lt;FamilySymbol&gt;("Doors")` is the door symbols (the
        /// types). ⚠ A LOADABLE family needs BOTH — the C# class in the angle brackets and the
        /// CATEGORY name in the string (there is no `StructuralColumn` type: it is
        /// `GetElements&lt;FamilyInstance&gt;("Structural Columns")`); a SYSTEM family needs no
        /// category at all — `GetElements&lt;Wall&gt;()`. A category with 0 instances returns an
        /// EMPTY list — never a substitute set of types.
        /// </summary>
        public static PipelineEnumerable<T> GetElements<T>(string categoryName) where T : Element
        {
            var computer = new Core.ParameterOptionsComputer(Doc);
            var results = computer.ComputeElementOptions(typeof(T).Name, categoryName)
                .Cast<T>()
                .ToList();

            // ⚠⚠ A ZERO MUST BE VISIBLE. Before this, `GetElements<FamilyInstance>("Doors")` on a
            //    project with no doors returned an empty list and printed NOTHING — so "there are
            //    no doors" and "the call never ran" were indistinguishable, and the caller had to
            //    guess which. The string overload has always reported its zero; this one is the
            //    spelling a script uses when it wants real FamilyInstance objects, so it needs the
            //    same sentence. (Skipped when T is itself an ElementType: a type query that finds
            //    no types is answered by the count, not by an "instances" line.)
            if (results.Count == 0 && !typeof(ElementType).IsAssignableFrom(typeof(T)))
            {
                Println($"[INFO] GetElements<{typeof(T).Name}>(\"{categoryName}\"):"
                    + " 0 instances in this document.");
            }

            return new PipelineEnumerable<T>(results, track: false);
        }


        /// <summary>
        /// Finds all INSTANCES belonging to a specific BuiltInCategory. Example:
        /// `GetElements(BuiltInCategory.OST_Doors)`. ⚠ The result is typed `Element`, not the
        /// concrete class — cast it, or use the typed spelling `GetElements&lt;Wall&gt;()`. Works
        /// with Params hydrated BuiltInCategory properties.
        /// </summary>
        public static PipelineEnumerable<Element> GetElements(BuiltInCategory category)
        {
            var results = new FilteredElementCollector(Doc)
                .OfCategory(category)
                .WhereElementIsNotElementType()
                .ToList();
            return new PipelineEnumerable<Element>(results, track: false);
        }

        /// <summary>
        /// Discovery helper for the REPL: one string that resolves a CATEGORY or a CLASS name —
        /// `GetElements("Doors")`, `GetElements("Walls")`. ⚠⚠ The result is UNTYPED
        /// (`PipelineEnumerable&lt;Element&gt;`) whatever the name resolved to, so CAST to use a
        /// concrete type's members — `GetElements("Walls").Cast&lt;Wall&gt;()` — or use the typed
        /// `GetElements&lt;Wall&gt;()` instead. ⚠ A CATEGORY name yields its INSTANCES; a name
        /// that is ITSELF a type name (`"WallType"`, `"FamilySymbol"`) yields TYPES instead, and
        /// the INFO line says which. A valid category with 0 instances returns an EMPTY list and
        /// SAYS SO; it never substitutes the category's types. Plural and singular both resolve
        /// (`"Doors"` = `"Door"`) and a category name needs no space (`"StructuralColumns"` =
        /// `"Structural Columns"`). An unknown name THROWS with near matches — `GetMagicNames()`
        /// lists everything targetable.
        /// </summary>
        public static PipelineEnumerable<Element> GetElements(string categoryOrClass)
        {
            var computer = new Core.ParameterOptionsComputer(Doc);
            var results = computer.ComputeElementOptions(categoryOrClass);

            if (results.Count > 0)
            {
                // ⚠ ALL-TYPES is now reachable ONLY when the NAME is itself a type name
                //   ("WallType", "FamilySymbol"), because the automatic instance→type fallback was
                //   REMOVED on 2026-10-14 (ParameterOptionsComputer.GetGenericElements). So this is
                //   not a "fallback" any more and must not be described as one: it is reported as
                //   what it is, and the sentence cannot be misread as "your instances are here".
                if (results.All(e => e is ElementType))
                {
                    Println($"[INFO] {categoryOrClass}: {results.Count} TYPE(s) — the name resolves to"
                        + " a type class. For instances of a category use GetElements(\"<Category>\");"
                        + " for a loadable family's symbols use GetElements<FamilySymbol>(\"<Category>\").");
                }
            }
            else
            {
                var cleanName = categoryOrClass.Trim();
                var allValidTerms = GetMagicNames();

                // ⚠⚠ A NAME THAT RESOLVES TO A REAL CATEGORY / CLASS / FAMILY IS VALID — the
                //    document simply has no instances of it (e.g. "Doors" in a project where no
                //    doors have been placed yet). Return an empty list, but SAY SO.
                //
                //    ⚠⚠ This branch used to return SILENTLY for a "magic" name, and because the
                //    result is built with `track: false` it did not even reach PipelineDiagnostics
                //    — so `GetElements("Doors")` on a project with 0 doors produced NO output at
                //    all. An empty list with no explanation is indistinguishable from "the filter
                //    matched nothing" and from "your query was wrong"; an agent cannot tell
                //    "there are 0" from "the call did nothing". A query for 0 placed doors must
                //    report 0 through this (string) form just as plainly as the fallback-to-types
                //    case above reports its fallback.
                if (allValidTerms.Any(t => t.Equals(cleanName, StringComparison.OrdinalIgnoreCase))
                    || Core.ParameterOptionsComputer.IsKnownElementName(cleanName))
                {
                    Println($"[INFO] {cleanName}: valid Class or Category with 0 instances in this document.");
                    return new PipelineEnumerable<Element>(results, track: false); // Empty list
                }

                // --- SUGGESTION ENGINE (for genuine typos only) ---
                var singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? cleanName.Substring(0, cleanName.Length - 1) : cleanName;
                var matches = allValidTerms.Where(t => t.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                                                       t.StartsWith(cleanName, StringComparison.OrdinalIgnoreCase)).Take(3).ToList();

                if (matches.Any())
                {
                    string suggestions = string.Join("' or '", matches);
                    throw new ArgumentException($"'{cleanName}' is not a valid Class or Category. Did you mean '{suggestions}'? For a list of supported Hydrations run GetMagicNames().");
                }

                throw new ArgumentException($"'{cleanName}' is not a valid Class or Category. For a list of supported Hydrations run GetMagicNames().");
            }

            return new PipelineEnumerable<Element>(results, track: false);
        }

        /// <summary>
        /// Lists all potential "Magic" strings targetable by
        /// <see cref="GetElements(string)">GetElements("Category")</see>.
        /// Includes Categories, Class names, and Family names available in the document.
        /// </summary>
        public static List<string> GetMagicNames()
        {
            var docCategories = Doc.Settings.Categories.Cast<Category>().Select(c => c.Name);
            var familyNames = new FilteredElementCollector(Doc).OfClass(typeof(Family)).Cast<Family>().Select(f => f.Name);

            // Standard Classes commonly used
            var commonClasses = new[] { "Wall", "Floor", "Roof", "Window", "Door", "Room", "Level", "View", "Sheet" };

            return docCategories
                .Concat(familyNames)
                .Concat(commonClasses)
                .Distinct()
                .OrderBy(s => s)
                .ToList();
        }

        /// <summary>
        /// Lists all Revit categories currently available in the document settings.
        /// </summary>
        public static List<string> GetCategories()
        {
            return Doc.Settings.Categories.Cast<Category>()
                .Select(c => c.Name)
                .OrderBy(s => s)
                .ToList();
        }
    }
}
