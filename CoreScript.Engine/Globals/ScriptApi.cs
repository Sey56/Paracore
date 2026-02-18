using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.DB.Mechanical;
using Autodesk.Revit.DB.Plumbing;
using Autodesk.Revit.DB.Electrical;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
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
        /// <para>
        /// Contains methods for creating, deleting, and modifying elements. 
        /// Most transactional operations should verify against this document.
        /// </para>
        /// </summary>
        public static Document Doc => Globals.Doc;

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
        public static void Println(string message) => Globals.Println(message);

        /// <summary>
        /// Prints an empty line to the unified output console.
        /// </summary>
        public static void Println() => Globals.Println(""); // Restored for backward compatibility

        /// <summary>
        /// Alias for <see cref="Println(string)"/>. Prints a message to the console.
        /// </summary>
        public static void Print(string message) => Globals.Print(message);

        /// <summary>
        /// Internal use only. Sets data to be passed back to the host application.
        /// </summary>
        public static void SetInternalData(string data) => Globals.SetInternalData(data);
        
        /// <summary>
        /// Starts a new Revit transaction with the specified name.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The action to execute within the transaction scope. The current <see cref="Document"/> is passed as an argument.</param>
        public static void Transact(string name, Action<Document> action) => Globals.Transact(name, action);

        /// <summary>
        /// Starts a new Revit transaction with the specified name.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The parameterless action to execute within the transaction scope.</param>
        public static void Transact(string name, Action action) => Globals.Transact(name, action);

        /// <summary>
        /// Renders data provided as a specific type in the UI.
        /// </summary>
        /// <param name="type">The type of display (e.g., "table", "chart-bar").</param>
        /// <param name="data">The structured data object to display.</param>
        public static void Show(string type, object data) => Globals.Output.Show(type, data);

        /// <summary>
        /// Renders a list of objects as an interactive table in the Summary tab.
        /// </summary>
        public static void Table(object data) => Globals.Output.Show("table", data);
        
        /// <summary>
        /// Renders a bar chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void ChartBar(object data) => Globals.Output.ChartBar(data);

        /// <summary>
        /// Renders a pie chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void ChartPie(object data) => Globals.Output.ChartPie(data);

        /// <summary>
        /// Renders a line chart in the Summary tab. Data should have 'name' and 'value' properties.
        /// </summary>
        public static void ChartLine(object data) => Globals.Output.ChartLine(data);

        /// <summary> Alias for ChartBar. </summary>
        public static void BarChart(object data) => Globals.Output.ChartBar(data);

        /// <summary> Alias for ChartPie. </summary>
        public static void PieChart(object data) => Globals.Output.ChartPie(data);

        /// <summary> Alias for ChartLine. </summary>
        public static void LineChart(object data) => Globals.Output.ChartLine(data);

        /// <summary> Alias for ChartLine. </summary>
        public static void LineGraph(object data) => Globals.Output.ChartLine(data);

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
                    WatchdogRegistry.Register(path, scriptName, callback, intervalSeconds);
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
                    WatchdogRegistry.Register(path, scriptName, (doc) => callback(), intervalSeconds);
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

                /// <param name="seconds">Maximum execution time in seconds</param>

                public static void SetExecutionTimeout(int seconds) => ExecutionGlobals.SetExecutionTimeout(seconds);

        

                /// <summary>

                /// Finds the first element of type T with the specified name.

                /// </summary>

                public static T? GetElement<T>(string name) where T : Element

                {

                    return new FilteredElementCollector(Doc)

                        .OfClass(typeof(T))

                        .Cast<T>()

                        .FirstOrDefault(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

                }

        

                /// <summary>

                /// Finds all elements of type T in the document.

                /// </summary>

                public static List<T> GetElements<T>() where T : Element

                {

                    return new FilteredElementCollector(Doc)

                        .OfClass(typeof(T))

                        .Cast<T>()

                        .ToList();

                }

            }

        }

        