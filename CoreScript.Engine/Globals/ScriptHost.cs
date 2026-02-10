using CoreScript.Engine.Context;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Neutral host class exposing ExecutionGlobals for consumers to extend.
    /// This class must not include any UI logic or toolkit-specific extensions.
    /// </summary>
    public class ScriptHost : ExecutionGlobals
    {
        public ScriptHost(ICoreScriptContext context) : base(context, new Dictionary<string, object>()) { }
    }
}
