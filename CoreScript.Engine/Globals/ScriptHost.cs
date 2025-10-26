// ❗️Only include this in the ENGINE if you want to expose a neutral alias.
// Otherwise, delete it and let TOOLKIT project define its own host wrapper.

using CoreScript.Engine.Context;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Neutral host class exposing ExecutionGlobals for consumers to extend.
    /// This class must not include any UI logic or toolkit-specific extensions.
    /// </summary>
    public class ScriptHost : ExecutionGlobals
    {
        public ScriptHost(IRScriptContext context) : base(context, new Dictionary<string, object>()) { }

        // No overrides.
        // No PrintCallback.
        // No SpecialToolkitMethod.
        // No Toolkit logic of any kind.
    }
}