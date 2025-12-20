using Autodesk.Revit.UI;

namespace CoreScript.Engine.Runtime
{
    /// <summary>
    /// Interface abstraction for handling Revit external events used to execute scripts safely within Revit's API context.
    /// Implementations should defer execution to the engine dispatcher.
    /// </summary>
    public interface ICoreScriptActionHandler : IExternalEventHandler
    {
        /// <summary>
        /// Gets the name of the execution handler for diagnostic or debug purposes.
        /// </summary>
        /// <returns>Handler name.</returns>
        string GetName();
    }
}
