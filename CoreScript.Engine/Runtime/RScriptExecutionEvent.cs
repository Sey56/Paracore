using Autodesk.Revit.UI;

namespace CoreScript.Engine.Runtime
{
    /// <summary>
    /// Provides a wrapper around Revit's ExternalEvent system used to raise code execution requests.
    /// </summary>
    public class RScriptExecutionEvent
    {
        private readonly IRScriptActionHandler _handler;
        public ExternalEvent ExternalEvent { get; }

        public RScriptExecutionEvent(IRScriptActionHandler handler)
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