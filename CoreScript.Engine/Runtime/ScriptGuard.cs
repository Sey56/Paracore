using System;
using System.Runtime.CompilerServices;
using CoreScript.Engine.Context;

namespace CoreScript.Engine.Runtime
{
    /// <summary>
    /// Thrown when a call chain has consumed the available STACK. Catchable — which is the entire
    /// point: the alternative is <c>StackOverflowException</c>, which .NET forbids anyone from
    /// catching and which terminates the process (exception code 0xc00000fd).
    /// </summary>
    public sealed class ScriptRecursionException : Exception
    {
        /// <summary>Creates the exception with a default message.</summary>
        public ScriptRecursionException() : base("Script recursion exceeded the available stack.") { }

        /// <summary>Creates the exception with the agent-facing explanation.</summary>
        public ScriptRecursionException(string message) : base(message) { }

        /// <summary>Creates the exception with a message and an inner exception.</summary>
        public ScriptRecursionException(string message, Exception innerException) : base(message, innerException) { }
    }

    /// <summary>
    /// Runtime protection against UNBOUNDED RECURSION in engine-internal and agent-authored code.
    ///
    /// <para><b>Why a stack check and not a depth cap.</b>
    /// <see cref="RuntimeHelpers.TryEnsureSufficientExecutionStack"/> answers "is there room for
    /// another call?" — it measures the RESOURCE THAT ACTUALLY RUNS OUT, so it is depth-independent.
    /// That is what makes it safe for legitimate deep work: a nested family 40
    /// <c>GeometryInstance</c> levels deep is ordinary and passes, while a runaway recursion trips
    /// the check with enough stack left to throw and unwind. No fixed number could do this — any
    /// depth cap is either too small for a real model or too large to fire before the crash.</para>
    ///
    /// <para><b>Depth is a SIGNAL, never a brake.</b> <see cref="MaxDepth"/> and
    /// <see cref="DeepestScope"/> record how deep a run went so a suspicious depth can be reported,
    /// but they never stop anything. Deep is not the same as wrong, and only the stack knows.</para>
    ///
    /// <para><b>⚠⚠ LOOPS ARE NOT THIS CLASS'S JOB — DO NOT ADD A DEADLINE HERE.</b>
    /// A <c>while</c> loop consumes no stack, so no stack check can see it. Loops are already
    /// covered by a separate, script-facing mechanism: <c>TimeoutRewriter</c> injects
    /// <c>ExecutionGlobals.CheckTimeout()</c> into every <c>for</c>/<c>foreach</c>/<c>while</c>/
    /// <c>do</c> body and every block-bodied lambda, against the deadline armed by
    /// <c>ExecutionGlobals.SetContext</c> (and raisable by the script itself with
    /// <c>SetExecutionTimeout(n)</c>). Adding a second budget here would give the product two
    /// sources of truth for the same limit, with different defaults — the exact mistake this note
    /// exists to prevent.</para>
    ///
    /// <para><b>What neither mechanism can do, stated plainly:</b> code that calls NOTHING —
    /// <c>while (true) { }</c> with an empty body, or <c>int f(int n) =&gt; f(n + 1);</c> — never
    /// reaches a guard. Nothing in-process can stop it: .NET Core removed <c>Thread.Abort</c>, and a
    /// stack overflow on any thread takes the whole process down. Every loop or recursion that
    /// touches the model — i.e. every one that can do damage — is covered.</para>
    /// </summary>
    public static class ScriptGuard
    {
        /// <summary>
        /// Depth at which a ONE-TIME advisory is attached. Diagnostic only; execution continues.
        /// For a geometry walk this is several times deeper than any real nested family, and for a
        /// parameter read the honest value is 1-3 — so 100 means something is genuinely wrong.
        /// </summary>
        private const int SoftDepthNotice = 100;

        [ThreadStatic] private static int _depth;
        [ThreadStatic] private static int _maxDepth;
        [ThreadStatic] private static string? _deepestScope;
        [ThreadStatic] private static long _calls;
        [ThreadStatic] private static int _nesting;
        [ThreadStatic] private static bool _active;
        [ThreadStatic] private static bool _softDepthNoticed;
        [ThreadStatic] private static ICoreScriptContext? _context;
        // ⚠ NO INLINE INITIALIZER on a [ThreadStatic] field: the initializer runs for the FIRST
        //   thread only, so every other thread would see the default (null) and the code would look
        //   like it had a value when it did not. Read it as nullable instead (CA2019).
        [ThreadStatic] private static string? _label;

        /// <summary>Deepest nesting reached by the current (or last) execution. Diagnostic only.</summary>
        public static int MaxDepth => _maxDepth;

        /// <summary>The engine member that was running at the deepest point. Diagnostic only.</summary>
        public static string DeepestScope => _deepestScope ?? "-";

        /// <summary>Guarded calls made by the current (or last) execution.</summary>
        public static long Calls => _calls;

        /// <summary>True between <see cref="BeginExecution"/> and <see cref="EndExecution"/>.</summary>
        public static bool IsActive => _active;

        /// <summary>
        /// The scope returned by <see cref="Enter"/>. A struct, so guarding a hot path costs no
        /// allocation; <c>using var _g = ScriptGuard.Enter("GetVal");</c> releases it on every exit
        /// path, including a throw.
        /// </summary>
        public readonly struct Scope : IDisposable
        {
            /// <summary>Leaves the guarded region.</summary>
            public void Dispose() => Exit();
        }

        /// <summary>
        /// Marks entry to a recursive engine member. Throws <see cref="ScriptRecursionException"/>
        /// when the stack is nearly exhausted — an ordinary exception the dispatcher already reports
        /// to the agent, so Revit survives and the caller learns why.
        /// </summary>
        /// <param name="scope">The engine member name, used in the message and in diagnostics.</param>
        public static Scope Enter(string scope)
        {
            // ⚠ THE STACK CHECK IS FIRST AND IS THE WHOLE POINT. Everything after it is bookkeeping.
            //   The throw happens BEFORE the depth counter is incremented, so it cannot leak a depth.
            if (!RuntimeHelpers.TryEnsureSufficientExecutionStack())
                throw new ScriptRecursionException(RecursionMessage(scope));

            int depth = ++_depth;
            _calls++;

            if (depth > _maxDepth)
            {
                _maxDepth = depth;
                _deepestScope = scope;
            }

            if (!_softDepthNoticed && depth >= SoftDepthNotice)
            {
                _softDepthNoticed = true;
                Notice(DepthMessage(depth, scope));
            }

            return default;
        }

        private static void Exit()
        {
            if (_depth > 0) _depth--;
        }

        /// <summary>
        /// Resets the per-execution counters and captures the context used for advisories. Called
        /// once per script execution from the funnel both source and precompiled scripts pass
        /// through. Nested calls are counted, not restarted.
        /// </summary>
        /// <param name="context">The script context, used to surface a one-time advisory.</param>
        /// <param name="label">A script name, for <see cref="Describe"/>.</param>
        public static void BeginExecution(ICoreScriptContext? context, string label = "")
        {
            if (_nesting++ > 0) return;

            _depth = 0;
            _maxDepth = 0;
            _deepestScope = null;
            _calls = 0;
            _softDepthNoticed = false;
            _context = context;
            _label = label ?? string.Empty;
            _active = true;
        }

        /// <summary>Releases the per-execution state. Safe to call when no execution is active.</summary>
        public static void EndExecution()
        {
            if (_nesting == 0) return;
            if (--_nesting > 0) return;

            _active = false;
            _context = null;
            _depth = 0;
        }

        /// <summary>
        /// One-line summary of what the guard observed, for attaching to a result. Call BEFORE
        /// <see cref="EndExecution"/>.
        /// </summary>
        public static string Describe()
        {
            var name = string.IsNullOrEmpty(_label) ? "script" : _label;
            return $"{name}: {_calls} guarded calls, max depth {_maxDepth} ({DeepestScope})";
        }

        private static void Notice(string message)
        {
            // The guard must never be the reason a script fails.
            try { _context?.Println(message); } catch { /* advisory is best-effort */ }
        }

        // ── Messages: written for the AGENT that has to act on them ────────────────
        //    Each says what happened, why the guard fired, and what to change. A guard that reports
        //    "an error occurred" just moves the dead end one level up.

        private static string RecursionMessage(string scope)
        {
            return
                "❌ RECURSION EXCEEDED THE STACK — stopped BEFORE it crashed Revit.\n" +
                $"   Deepest call: {scope} at depth {_maxDepth}.\n" +
                "   This is a limit on stack SPACE, not on a level count, so legitimate deep work is not the cause.\n" +
                "   • Nested geometry / nested families: supported, and deep nesting is normal. Hitting this means the walk\n" +
                "     found a CYCLE (an instance that contains itself, directly or through its symbol) or a base case that\n" +
                "     never fires.\n" +
                "   • Parameter reads: a name is resolving from an element to its own type and back.\n" +
                "   FIX: repair the base case, or bound the walk to a depth you can justify, then re-run.";
        }

        private static string DepthMessage(int depth, string scope)
        {
            return
                $"⚠ Nesting reached depth {depth} (at {scope}). Not stopped — depth alone is not an error, and deep nested\n" +
                "   geometry is legitimate. If this was a parameter read the expected depth is 1-3, so check for a name that\n" +
                "   resolves element → type → element.";
        }
    }
}
