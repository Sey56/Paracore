using Autodesk.Revit.DB;
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
    public static class ScriptApi
    {
        private static ExecutionGlobals Globals => ExecutionGlobals.Current.Value ?? throw new InvalidOperationException("Script context is not available. Ensure the script is run through the engine.");

        public static UIApplication UIApp => Globals.UIApp;
        public static UIDocument UIDoc => Globals.UIDoc;
        public static Document Doc => Globals.Doc;
        public static Dictionary<string, object> Parameters => Globals.Parameters;

        public static void Println(string message) => Globals.Println(message);
        public static void Print(string message) => Globals.Print(message);
        public static void SetInternalData(string data) => Globals.SetInternalData(data);
        
        // Old method for backward compatibility
        public static void Transact(string name, Action<Document> action) => Globals.Transact(name, action);

        // New, preferred method
        public static void Transact(string name, Action action) => Globals.Transact(name, action);

        public static void Show(string type, object data) => Globals.Output.Show(type, data);
        public static void Table(object data) => Globals.Output.Show("table", data);
        
        public static void ChartBar(object data) => Globals.Output.ChartBar(data);
        public static void ChartPie(object data) => Globals.Output.ChartPie(data);
        public static void ChartLine(object data) => Globals.Output.ChartLine(data);

        // Aliases for better intuition
        public static void BarChart(object data) => Globals.Output.ChartBar(data);
        public static void PieChart(object data) => Globals.Output.ChartPie(data);
        public static void LineChart(object data) => Globals.Output.ChartLine(data);
        public static void LineGraph(object data) => Globals.Output.ChartLine(data);

        /// <summary>
        /// Sets the execution timeout for the current script. Default is 10 seconds.
        /// Call this at the start of your script if you need more time for long-running operations.
        /// </summary>
        /// <param name="seconds">Maximum execution time in seconds</param>
        public static void SetExecutionTimeout(int seconds) => ExecutionGlobals.SetExecutionTimeout(seconds);
    }
}
