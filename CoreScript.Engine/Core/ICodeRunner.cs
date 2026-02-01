using Autodesk.Revit.UI;
using CoreScript.Engine.Context;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Represents an abstract contract for executing C# scripts dynamically.
    /// Used by consumers like Paracore and CoreScript Toolkit.
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
        ExecutionResult Execute(string scriptContent, string parametersJson, ICoreScriptContext context);

        /// <summary>
        /// Executes a pre-compiled C# assembly binary.
        /// Used for protected/proprietary tools.
        /// </summary>
        ExecutionResult ExecuteBinary(byte[] assemblyBytes, string parametersJson, ICoreScriptContext context);

        /// <summary>
        /// Compiles a script into a binary assembly and returns the bytes.
        /// </summary>
        byte[] CompileToBytes(string scriptContent);
    }
}
