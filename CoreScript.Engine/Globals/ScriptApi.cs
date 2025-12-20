using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;

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
    }
}
