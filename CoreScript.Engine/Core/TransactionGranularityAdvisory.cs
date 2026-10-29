using CoreScript.Engine.Context;
using CoreScript.Engine.Core.Rewriters;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// The ONE place that warns about the TRANSACTION GRANULARITY footgun.
    ///
    /// ⚠ <b>Why this type exists.</b> The rule was previously stated twice: a semantic
    /// analyser in <see cref="TransactionLoopGuard"/> (correct — it resolves the receiver
    /// type, proves the call sits inside the loop body, and honours an enclosing
    /// <c>Transact</c>) and a regex in the MCP server's Python lint (a bare co-presence
    /// test: `foreach` appears somewhere AND `.SetVal(` appears somewhere). The regex
    /// fired on a script with a read-only loop and a single write AFTER it — a false
    /// positive on correct code, which is the fastest way to teach an agent to ignore a
    /// warning. Two copies of one rule drift; this type makes the accurate one the only one.
    ///
    /// ⚠ <b>The contract being protected.</b> A single-element mutator (<c>SetVal</c>,
    /// <c>SetNum</c>, <c>SetTypeVal</c>, <c>SetTypeNum</c>, <c>Delete</c>, <c>Hide</c>,
    /// <c>Unhide</c>, <c>Isolate</c>) checks <c>Document.IsModifiable</c> and opens its OWN
    /// transaction when none is open. That is what makes one write convenient — and what
    /// makes a loop of them cost one undo entry PER ELEMENT. An enclosing <c>Transact</c>
    /// makes <c>IsModifiable</c> true, so the per-write transactions are suppressed and the
    /// whole loop costs ONE undo entry. The collection helpers (<c>SetParam</c>,
    /// <c>SetTypeParam</c>) are declared on <c>IEnumerable&lt;T&gt;</c> and already wrap the
    /// enumeration in one transaction — they are correct and must NOT be flagged.
    ///
    /// MEASURED on Revit 2025, 2026-10-29 (transaction names captured from DocumentChanged
    /// inside the script, 3 walls):
    ///     one el.SetVal(...)                        -> 1  transaction  ["Set Comments"]
    ///     foreach { el.SetVal(...) }                -> 3  transactions ["Set Comments" ×3]
    ///     Transact(() =&gt; foreach { el.SetVal(…) })  -> 1  transaction  ["loop inside Transact"]
    ///     walls.SetParam("Comments", …)             -> 1  transaction  ["Set Comments"]
    ///
    /// ⚠ Advisory ONLY, on both call paths. It never refuses a run and never throws: any
    /// failure degrades to "no warning", because an analysis that can break a write is
    /// worse than an analysis that misses one.
    /// </summary>
    public static class TransactionGranularityAdvisory
    {
        /// <summary>
        /// Cheap pre-filter. Roslyn analysis with the full Revit reference set is far too
        /// expensive to run on every submission, and a loop cannot be reported if the
        /// source contains no loop keyword — nor a mutator if it names none. This gate can
        /// only cause a MISSED analysis, never a wrong verdict: the verdict always comes
        /// from <see cref="TransactionLoopGuard"/>.
        /// </summary>
        private static readonly string[] LoopKeywords =
        {
            "foreach", "for ", "for(", "for (", "while", "do ", "do{", "ForEach", "Select(", "Where(", "All(", "Any("
        };

        private static readonly string[] MutatorNames =
        {
            "SetVal", "SetNum", "SetTypeVal", "SetTypeNum", "Delete", "Hide", "Unhide", "Isolate"
        };

        /// <summary>
        /// Prints the granularity warning into <paramref name="context"/>'s output if — and
        /// only if — a per-element mutator really sits inside a loop with no enclosing
        /// <c>Transact</c>. Returns the number of findings (0 when the code is fine).
        /// </summary>
        public static int Warn(ICoreScriptContext context, string userCode, string scriptName)
        {
#pragma warning disable CA1031 // Deliberate: an advisory must never break a run.
            try
            {
                if (context == null || string.IsNullOrWhiteSpace(userCode))
                    return 0;
                if (!MayContainLoopWrite(userCode))
                    return 0;

                // The SAME reference set and imports the real compilation uses, from the one
                // provider that owns them — otherwise the analyser would resolve different
                // symbols than the compiler and could report a call that does not exist.
                var imports = ScriptReferenceProvider.GetImports(includeRevitSelection: false);
                var refs = ScriptReferenceProvider.GetCoreReferences("GranularityAdvisory");
                refs.AddRange(ScriptReferenceProvider.GetRevitReferences("GranularityAdvisory"));

                var findings = TransactionLoopGuard.Analyze(userCode, imports, refs);
                if (findings == null || findings.Count == 0)
                    return 0;

                const int maxShown = 10;
                var lines = findings
                    .Take(maxShown)
                    .Select(f => $"  line {f.Line}:{f.Column} — {f.Call}() inside {f.LoopKind}");

                context.Println(
                    $"⚠️ TRANSACTION GRANULARITY — {findings.Count} write(s) sit inside a loop with no " +
                    "enclosing Transact(). Each iteration opens its OWN transaction, so N elements cost " +
                    "N undo entries, and the undo stack can run out before you can get back to where you " +
                    "started. Wrap the WHOLE loop in ONE Transact(...) — a Transact() placed INSIDE the " +
                    "loop is the mistake. (A collection .SetParam() already wraps one transaction and " +
                    "needs no Transact.)" + Environment.NewLine +
                    string.Join(Environment.NewLine, lines) +
                    (findings.Count > maxShown
                        ? Environment.NewLine + $"  … and {findings.Count - maxShown} more."
                        : string.Empty));

                FileLogger.LogWarning(
                    $"[Granularity] {findings.Count} unwrapped loop write(s) in '{scriptName}'.");
                return findings.Count;
            }
            catch (Exception ex)
            {
                // Advisory only. A broken analysis must never break a run.
                FileLogger.LogWarning($"[Granularity] check failed: {ex.Message}");
                return 0;
            }
#pragma warning restore CA1031
        }

        private static bool MayContainLoopWrite(string code)
        {
            if (!ContainsAny(code, MutatorNames))
                return false;
            foreach (var kw in LoopKeywords)
            {
                if (code.IndexOf(kw, StringComparison.Ordinal) >= 0)
                    return true;
            }
            return false;
        }

        private static bool ContainsAny(string haystack, IReadOnlyList<string> needles)
        {
            for (int i = 0; i < needles.Count; i++)
            {
                if (haystack.IndexOf(needles[i], StringComparison.Ordinal) >= 0)
                    return true;
            }
            return false;
        }
    }
}
