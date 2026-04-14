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
    public static class ScriptApi
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
        /// Use this to access UI-specific operations like the active selection (<see cref="Autodesk.Revit.UI.UIDocument.Selection"/>) 
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
        /// Alias for <see cref="Println(string)"/>. Prints a message to the console.
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
        /// Internal use only. Sets data to be passed back to the host application.
        /// </summary>
        public static void SetInternalData(string data)
        {
            Globals.SetInternalData(data);
        }

        /// <summary>
        /// Starts a new Revit transaction with the specified name.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The action to execute within the transaction scope. The current <see cref="Document"/> is passed as an argument.</param>
        public static void Transact(string name, Action<Document> action)
        {
            Globals.Transact(name, action);
        }

        /// <summary>
        /// Starts a new Revit transaction with the specified name.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The parameterless action to execute within the transaction scope.</param>
        public static void Transact(string name, Action action)
        {
            Globals.Transact(name, action);
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
        /// Renders a list of Revit elements as an interactive table in the Summary tab.
        /// </summary>
        public static void Table(IEnumerable<Element> elements)
        {
            Globals.Output.Table(elements);
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
        public static void BarChart(object data)
        {
            Globals.Output.BarChart(data);
        }

        /// <summary> Alias for BarChart. </summary>
        public static void BarGraph(object data)
        {
            Globals.Output.BarChart(data);
        }

        /// <summary>
        /// Renders a pie chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void PieChart(object data)
        {
            Globals.Output.PieChart(data);
        }

        /// <summary> Alias for PieChart. </summary>
        public static void PieGraph(object data)
        {
            Globals.Output.PieChart(data);
        }

        /// <summary>
        /// Renders a line chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void LineChart(object data)
        {
            Globals.Output.LineChart(data);
        }

        /// <summary> Alias for LineChart. </summary>
        public static void LineGraph(object data)
        {
            Globals.Output.LineChart(data);
        }

        /// <summary>
        /// Registers a background watchdog that runs when Revit is idle.
        /// Useful for continuous model validation or background tasks.
        /// </summary>
        /// <param name="callback">The logic to run during Revit idle time.</param>
        /// <param name="intervalSeconds">Minimum seconds between executions. Default is 5s.</param>
        public static void Watchdog(Action<Document> callback, int intervalSeconds = 5)
        {
            bool isRegistration = Parameters.TryGetValue("__is_watchdog_registration__", out var isReg) && isReg is bool b && b;

            if (isRegistration)
            {
                if (Parameters.TryGetValue("__absolute_path__", out var pathObj) && pathObj is string path)
                {
                    string scriptName = Parameters.TryGetValue("__script_name__", out var nameObj) ? nameObj.ToString()! : "Watcher";
                    WatchdogRegistry.Register(path, scriptName, callback, intervalSeconds, new Dictionary<string, object>(Parameters), new Dictionary<string, object>(ExecutionGlobals.Current.Value.RawParameters));
                }
                else
                {
                    Println("[WARNING] Watchdog registration failed: Script path not found in context.");
                }
            }
            else
            {
                // MANUAL TEST MODE: Just run the logic once so the user sees results in the Console/Table
                Println("[INFO] Running Watchdog logic in Manual Test mode (no background registration).");
                callback(Doc);
            }
        }

        /// <summary>
        /// Registers a background watchdog that runs when Revit is idle.
        /// Simplified overload that uses the global Doc context.
        /// </summary>
        /// <param name="callback">The logic to run during Revit idle time.</param>
        /// <param name="intervalSeconds">Minimum seconds between executions. Default is 5s.</param>
        public static void Watchdog(Action callback, int intervalSeconds = 5)
        {
            bool isRegistration = Parameters.TryGetValue("__is_watchdog_registration__", out var isReg) && isReg is bool b && b;

            if (isRegistration)
            {
                if (Parameters.TryGetValue("__absolute_path__", out var pathObj) && pathObj is string path)
                {
                    string scriptName = Parameters.TryGetValue("__script_name__", out var nameObj) ? nameObj.ToString()! : "Watcher";
                    WatchdogRegistry.Register(path, scriptName, (doc) => callback(), intervalSeconds, new Dictionary<string, object>(Parameters), new Dictionary<string, object>(ExecutionGlobals.Current.Value.RawParameters));
                }
                else
                {
                    Println("[WARNING] Watchdog registration failed: Script path not found in context.");
                }
            }
            else
            {
                // MANUAL TEST MODE: Just run the logic once
                Println("[INFO] Running Watchdog logic in Manual Test mode (no background registration).");
                callback();
            }
        }

        /// <summary>
        /// Sends a status report for the current background watchdog.
        /// </summary>
        /// <param name="summary">Short text description (e.g. 'Found 5 errors')</param>
        /// <param name="status">'success', 'warning', or 'error'</param>
        /// <param name="data">Optional list of elements or objects for details</param>
        public static void WatchdogReport(string summary, string status = "success", object? data = null)
        {
            string? path = null;

            // Priority 1: Current execution context (when running via UI)
            if (ExecutionGlobals.Current.Value != null && Parameters.TryGetValue("__absolute_path__", out var pathObj))
            {
                path = pathObj as string;
            }
            // Priority 2: Background loop context
            else
            {
                path = WatchdogRegistry.CurrentWatchdogPath;
            }

            if (!string.IsNullOrEmpty(path))
            {
                string json = data != null ? System.Text.Json.JsonSerializer.Serialize(data) : "[]";
                WatchdogRegistry.SetReport(path!, summary, status, json);
            }
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
        /// Finds all elements of type T in the document.
        /// </summary>
        public static List<T> GetElements<T>() where T : Element
        {
            var collector = Core.ParameterOptionsComputer.CreateResilientCollector(Doc, typeof(T));
            return collector
                .Cast<Element>()
                .Where(e => e is T)
                .Cast<T>()
                .ToList();
        }

        /// <summary>
        /// Finds all elements of type T belonging to a specific category.
        /// <para>Example: <c>GetElements&lt;FamilyInstance&gt;("Doors")</c></para>
        /// </summary>
        public static List<T> GetElements<T>(string categoryName) where T : Element
        {
            var computer = new Core.ParameterOptionsComputer(Doc);
            return computer.ComputeElementOptions(typeof(T).Name, categoryName)
                .Cast<T>()
                .ToList();
        }


        /// <summary>
        /// Finds all elements belonging to a specific BuiltInCategory.
        /// <para>Example: <c>GetElements(BuiltInCategory.OST_Doors)</c></para>
        /// <para>Works seamlessly with Params hydrated BuiltInCategory properties.</para>
        /// </summary>
        public static List<Element> GetElements(BuiltInCategory category)
        {
            return new FilteredElementCollector(Doc)
                .OfCategory(category)
                .WhereElementIsNotElementType()
                .ToList();
        }

        /// <summary>
        /// Discovery helper for the REPL. Targets categories or classes automatically.
        /// <para>Example: <c>GetElements("Doors")</c></para>
        /// </summary>
        public static List<Element> GetElements(string categoryOrClass)
        {
            var computer = new Core.ParameterOptionsComputer(Doc);
            var results = computer.ComputeElementOptions(categoryOrClass);

            if (results.Count > 0)
            {
                // TRANSPARENCY: Inform the user if we had to fall back to Types (e.g. for Grid Heads)
                var isTypeRequested = categoryOrClass.EndsWith("Type", StringComparison.OrdinalIgnoreCase);
                
                // If the user didn't ask for Types, but we only found ElementTypes, it's a fallback.
                if (!isTypeRequested && results.All(e => e is ElementType))
                {
                    Println($"[INFO] {categoryOrClass}: Fallback to Types (0 Instances found).");
                }
            }
            else
            {
                var cleanName = categoryOrClass.Trim();
                var allValidTerms = GetMagicNames();

                // If the exact name exists in GetMagicNames(), it's a valid category with 0 instances.
                // Return an empty list — don't throw.
                if (allValidTerms.Any(t => t.Equals(cleanName, StringComparison.OrdinalIgnoreCase)))
                {
                    return results; // Empty list
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

            return results;
        }

        /// <summary>
        /// Lists all potential "Magic" strings targetable by <see cref="GetElements(string)"/>.
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
