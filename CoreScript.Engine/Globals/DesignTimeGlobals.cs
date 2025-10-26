using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Provides static design-time hints for IntelliSense. This class is not used at runtime.
    /// </summary>
    public static class DesignTimeGlobals
    {
        /// <summary> Throws a design-time-only exception. </summary>
        private static Exception DesignTimeOnlyException => new InvalidOperationException("This member is for design-time IntelliSense only and cannot be used at runtime.");

        // Methods
        public static void Println(string message) => throw DesignTimeOnlyException;
        public static void Print(string message) => throw DesignTimeOnlyException;
        public static void Transact(string name, Action<Document> action) => throw DesignTimeOnlyException;
        public static void Transact(string name, Action action) => throw DesignTimeOnlyException;
        public static void Show(string type, object data) => throw DesignTimeOnlyException;

        // Properties
        public static UIApplication UIApp => throw DesignTimeOnlyException;
        public static UIDocument UIDoc => throw DesignTimeOnlyException;
        public static Document Doc => throw DesignTimeOnlyException;
        public static Dictionary<string, object> Parameters => throw DesignTimeOnlyException;
    }
}
