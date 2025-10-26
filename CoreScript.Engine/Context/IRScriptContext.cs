using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Context
{
    /// <summary>
    /// Defines the execution context provided by host add-ins, including access to Revit API and logging.
    /// </summary>
    public interface IRScriptContext
    {
        UIApplication UIApp { get; }
        UIDocument UIDoc { get; }
        Document Doc { get; }

        void Println(string message);
        void Print(string message);
        void LogError(string message);
        void AddStructuredOutput(string type, string jsonData);

        Action<string>? PrintCallback { get; }

        IReadOnlyList<string> PrintLog { get; } // ✅ New: expose print buffer to engine
    }
}