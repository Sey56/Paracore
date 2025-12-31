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

        /// <summary>
        /// Prints a message to the unified output console.
        /// <para>
        /// Supports standard string interpolation (e.g., <c>$"Count: {x}"</c>).
        /// </para>
        /// </summary>
        /// <param name="message">The message string to print. Use <c>$""</c> for variables.</param>
        /// <example>
        /// <code>
        /// Println($"Found {elements.Count} items.");
        /// </code>
        /// </example>
        public static void Println(string message) => throw DesignTimeOnlyException;

        /// <summary>
        /// Alias for <see cref="Println(string)"/>. Prints a message to the console.
        /// </summary>
        public static void Print(string message) => throw DesignTimeOnlyException;

        /// <summary>
        /// Starts a new Revit transaction with the specified name.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The action to execute within the transaction scope. The current <see cref="Document"/> is passed as an argument.</param>
        /// <example>
        /// <code>
        /// Transact("Create Wall", doc => {
        ///     Wall.Create(doc, ...);
        /// });
        /// </code>
        /// </example>
        public static void Transact(string name, Action<Document> action) => throw DesignTimeOnlyException;

        /// <summary>
        /// Starts a new Revit transaction with the specified name.
        /// </summary>
        /// <param name="name">The name of the transaction (appears in Undo menu).</param>
        /// <param name="action">The parameterless action to execute within the transaction scope.</param>
        public static void Transact(string name, Action action) => throw DesignTimeOnlyException;

        /// <summary>
        /// Displays data in a rich interactive format (e.g., table, chart) in the Output UI.
        /// </summary>
        /// <param name="type">The type of display (e.g., "table").</param>
        /// <param name="data">The structured data object to display.</param>
        public static void Show(string type, object data) => throw DesignTimeOnlyException;

        public static void SetInternalData(string data) => throw DesignTimeOnlyException;

        // Properties

        /// <summary>
        /// Represents the active Revit UI application.
        /// <para>Provides access to UI events, ribbon panels, and the currently active document.</para>
        /// </summary>
        public static UIApplication UIApp => throw DesignTimeOnlyException;

        /// <summary>
        /// Represents the currently active project document in the Revit user interface.
        /// <para>
        /// Use this to access UI-specific operations like the active selection (<see cref="Autodesk.Revit.UI.UIDocument.Selection"/>) 
        /// or to prompt the user for input.
        /// </para>
        /// </summary>
        public static UIDocument UIDoc => throw DesignTimeOnlyException;

        /// <summary>
        /// Represents the currently active database level Document.
        /// <para>
        /// Contains methods for creating, deleting, and modifying elements. 
        /// Most transactional operations should verify against this document.
        /// </para>
        /// </summary>
        public static Document Doc => throw DesignTimeOnlyException;

        /// <summary>
        /// A dictionary of parameters passed from the agent or UI context.
        /// </summary>
        public static Dictionary<string, object> Parameters => throw DesignTimeOnlyException;
    }
}
