using CoreScript.Engine.Context;
using System.Collections.Concurrent;

namespace CoreScript.Engine.Runtime
{
    /// <summary>
    /// Provides a simple thread-safe queue for managing script execution requests.
    /// </summary>
    public class ExecutionQueue
    {
        private readonly ConcurrentQueue<(string script, IRScriptContext context)> _queue = new();

        public void Enqueue(string script, IRScriptContext context)
        {
            _queue.Enqueue((script, context));
        }

        public bool TryDequeue(out string script, out IRScriptContext context)
        {
            if (_queue.TryDequeue(out var item))
            {
                script = item.script;
                context = item.context;
                return true;
            }

            script = null;
            context = null;
            return false;
        }

        public bool HasPending => !_queue.IsEmpty;
    }
}