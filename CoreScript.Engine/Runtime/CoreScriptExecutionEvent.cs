using Autodesk.Revit.UI;

namespace CoreScript.Engine.Runtime
{
    /// <summary>
    /// Provides a wrapper around Revit's ExternalEvent system used to raise code execution requests.
    /// </summary>
    public class CoreScriptExecutionEvent
    {
        private readonly ICoreScriptActionHandler _handler;
        public ExternalEvent ExternalEvent { get; }

        public CoreScriptExecutionEvent(ICoreScriptActionHandler handler)
        {
            _handler = handler;
            ExternalEvent = ExternalEvent.Create(_handler);
        }

        public void Raise()
        {
            if (ExternalEvent?.IsPending != true)
                ExternalEvent?.Raise();
        }
    }
}