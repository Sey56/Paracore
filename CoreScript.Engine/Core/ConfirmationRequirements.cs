using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// THE single implementation of the <c>[Confirm("WORD")]</c> rule.
    ///
    /// ⚠⚠ WHY THIS TYPE EXISTS. <c>ParameterExtractor</c> compiles <c>[Confirm("APPLY")]</c> into
    /// <c>Pattern = "^APPLY$"</c> on a <c>ScriptParameter</c>, and that is the ONLY writer of
    /// <c>Pattern</c>. Two places now need to ask the same question — "does this script require a
    /// typed confirmation, and what is the word?":
    ///   * the engine's execution gate (<c>CodeRunner</c>), which ENFORCES it, and
    ///   * the add-in's pre-dispatch prompt (<c>ScriptExecutionHandler</c>), which ASKS the human
    ///     for an agent-driven run.
    /// A rule in two places is a rule that drifts (rule 14) — so the extraction lives here, once,
    /// and both callers use it.
    /// </summary>
    public static class ConfirmationRequirements
    {
        /// <summary>
        /// Parameter name → confirmation pattern, for every parameter in the script that carries a
        /// non-empty <c>Pattern</c>. Empty dictionary when the script requires no confirmation.
        /// </summary>
        public static Dictionary<string, string> FromScript(string combinedUserCode, IParameterExtractor extractor)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(combinedUserCode) || extractor == null)
                return result;

            foreach (var p in extractor.ExtractParameters(combinedUserCode))
            {
                if (!string.IsNullOrEmpty(p.Name) && !string.IsNullOrEmpty(p.Pattern))
                    result[p.Name] = p.Pattern;
            }

            return result;
        }

        /// <summary>
        /// Same, but from the raw <c>ExecuteScript</c> payload — the JSON array of script files that
        /// the gRPC request carries.
        ///
        /// ⚠ The add-in needs this BEFORE dispatch, so it cannot reuse what <c>CodeRunner</c> computes
        /// later. The parse+combine lives here rather than in the add-in so the two paths cannot
        /// disagree about which files make up the script.
        /// </summary>
        public static Dictionary<string, string> FromPayload(string scriptContent, IScriptCombiner combiner, IParameterExtractor extractor)
        {
            if (string.IsNullOrWhiteSpace(scriptContent))
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            List<ScriptFile> files;
            try
            {
                files = JsonSerializer.Deserialize<List<ScriptFile>>(
                            scriptContent,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                        ?? new List<ScriptFile>();
            }
            catch
            {
                // Not a JSON file array — treat the whole payload as a single script, which is what
                // CodeRunner does when its own deserialisation fails.
                files = new List<ScriptFile> { new ScriptFile { FileName = "Script.cs", Content = scriptContent } };
            }

            var combined = combiner?.Combine(files) ?? scriptContent;
            return FromScript(combined, extractor);
        }

        /// <summary>
        /// The literal a person is asked to type. The engine writes <c>^WORD$</c>; anything else is a
        /// hand-authored regex and is returned as-is (⚠ the prompt cannot usefully ask a person to
        /// type a regex, so a non-<c>^WORD$</c> pattern is reported rather than guessed at).
        /// </summary>
        public static string Literal(string pattern)
        {
            if (string.IsNullOrEmpty(pattern)) return string.Empty;
            var m = Regex.Match(pattern, @"^\^([a-zA-Z0-9_-]+)\$$");
            return m.Success ? m.Groups[1].Value : pattern;
        }

        /// <summary>
        /// Does this reserved-parameter VALUE mean "dry run"? Read from <c>__dry_run__</c>, which
        /// travels the same channel as <c>__script_name__</c>.
        ///
        /// ⚠⚠ WHY THIS IS SHARED. The engine's gate and the add-in's prompt must agree about the
        /// gate's <b>scope</b>, not only about its word. <c>CodeRunner</c> deliberately EXEMPTS a dry
        /// run — it is rolled back, and refusing it would remove the only safe way to preview a
        /// destructive script. If the add-in prompted on a dry run it would gate a run the engine
        /// considers ungated: the person would be asked to approve a preview, and the agent would
        /// lose its safe path. One rule, one home (rule 14).
        /// </summary>
        public static bool IsDryRun(object? rawValue)
        {
            if (rawValue == null) return false;
            if (rawValue is bool b) return b;
            return string.Equals(rawValue.ToString(), "true", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Same question, asked of the raw parameters JSON — the add-in's view. ⚠ Handles BOTH payload
        /// shapes, because <c>ParameterService.MapParameters</c> branches on the JSON root: an ARRAY of
        /// <c>{"name","value"}</c> for Forge, a plain OBJECT otherwise. (Same two-shape handling as
        /// <c>ReadScriptName</c> and <c>InjectConfirmations</c> in the add-in.)
        /// </summary>
        public static bool IsDryRunInPayload(string parametersJson)
        {
            if (string.IsNullOrWhiteSpace(parametersJson)) return false;
            try
            {
                var node = JsonNode.Parse(parametersJson);
                if (node is JsonArray arr)
                {
                    foreach (var item in arr)
                    {
                        if (item is JsonObject o && o["name"]?.ToString() == "__dry_run__")
                            return IsDryRun(o["value"]?.ToString());
                    }
                }
                else if (node is JsonObject jo && jo["__dry_run__"] != null)
                {
                    return IsDryRun(jo["__dry_run__"]!.ToString());
                }
            }
            catch { }
            return false;
        }
    }

    /// <summary>
    /// The vocabulary of <c>ExecuteScriptResponse.confirmation</c> — WHO satisfied the
    /// <c>[Confirm("WORD")]</c> gate, if anyone.
    ///
    /// ⚠⚠ WHY THIS EXISTS. A caller could previously see <c>is_success: true</c> and
    /// <c>user_rejected: false</c> for a run a person approved AND for a run with no gate at all.
    /// Those are not the same thing, and the difference is the whole point of the gate — so the
    /// add-in now states which one it was, and the caller never has to infer it.
    ///
    /// ⚠ ONE home for these strings (rule 14). The values are mirrored in
    /// <c>protos/corescript.proto</c>, which is where the wire contract is documented; if a value
    /// is added or renamed it must change in both places.
    /// </summary>
    public static class ConfirmationStatus
    {
        /// <summary>The gate was never reached — the run failed before it was consulted.</summary>
        public const string NotEvaluated = "";

        /// <summary>The script declares no <c>[Confirm]</c>, so there was nothing to confirm.</summary>
        public const string NotRequired = "not_required";

        /// <summary>
        /// Not an agent run, so no dialog was involved. The engine's gate still enforced that a
        /// value was supplied, but a person was already in the Configurator — that is not a
        /// "a human approved agent-authored code" event and must not be reported as one.
        /// </summary>
        public const string NotAgentRun = "not_agent_run";

        /// <summary>
        /// A DRY RUN. ⚠ Reported separately rather than as <see cref="NotRequired"/>, because for a
        /// tool that DOES declare <c>[Confirm]</c> "not_required" would be false: the gate exists, it
        /// is simply out of scope here (<c>CodeRunner</c> exempts dry runs deliberately — see
        /// <see cref="ConfirmationRequirements.IsDryRun"/>). An agent seeing this on a REAL run would
        /// be looking at a bug.
        /// </summary>
        public const string DryRunExempt = "dry_run_exempt";

        /// <summary>An agent run; a person typed the word in the Revit dialog.</summary>
        public const string UserConfirmed = "user_confirmed";

        /// <summary>An agent run; the person declined. <c>user_rejected</c> is also true.</summary>
        public const string UserDeclined = "user_declined";

        /// <summary>
        /// The <c>[Confirm]</c> requirements could not be read, so the run was refused. ⚠ Reported
        /// rather than folded into <see cref="NotRequired"/>: a gate that cannot see its input must
        /// never read as green (rule 3).
        /// </summary>
        public const string Unavailable = "unavailable";
    }
}
