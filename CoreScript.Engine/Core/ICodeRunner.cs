using Autodesk.Revit.UI;
using CoreScript.Engine.Context;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Represents an abstract contract for executing C# scripts dynamically.
    /// Used by consumers like Paracore and RScript Toolkit.
    /// </summary>
    public interface ICodeRunner
    {
        /// <summary>
        /// Executes user-provided script content within the context of a Revit session.
        /// </summary>
        /// <param name="scriptContent">
        /// A string that can be either raw C# top-level statements or a serialized list of ScriptFile objects.
        /// </param>
        /// <param name="context">
        /// Execution context for the script, including access to UIApp, Doc, UIDoc, and PrintCallback.
        /// </param>
        /// <returns>
        /// ExecutionResult describing success, failure, output logs, and return value.
        /// </returns>
        ExecutionResult Execute(string scriptContent, string parametersJson, IRScriptContext context);
    }
}
