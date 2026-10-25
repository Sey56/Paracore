using System.Diagnostics;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;

namespace Paracore.PackSdk;

/// <summary>
/// The whole life of a pack tool in one call: parameters → configurator → payload → engine → results.
///
/// Two entry points, and the difference is only where the tool body comes from:
///   • <see cref="Run(UIApplication, string, string, bool, ref string)"/> — from SOURCE. The engine
///     compiles it and caches the assembly. This is the gallery's path.
///   • <see cref="Run(UIApplication, string, IReadOnlyList{ScriptParameter}, byte[], bool, ref string)"/>
///     — from a PRECOMPILED assembly the pack carries. No source ships, and no compile happens on
///     the customer's machine: every run is already a cache hit.
///
/// Both funnel into the same <see cref="RunCore"/>, so a form, a run and a result cannot behave
/// differently between them. A generated pack's command is one line either way:
///
/// <code>
/// [Transaction(TransactionMode.Manual)]
/// public sealed class TilerCommand : IExternalCommand
/// {
///     public Result Execute(ExternalCommandData cd, ref string message, ElementSet e)
///         => PackHost.Run(cd.Application, Tool.Name, Tool.Schema, Tool.Assembly, dryRun: false, ref message);
/// }
/// </code>
/// </summary>
public static class PackHost
{
    /// <summary>
    /// ⚠ One instance for the process, not one per click: <see cref="CodeRunner"/> keeps a compiled
    /// assembly cache, so a fresh instance would re-compile the script on every button press
    /// (~4 s on a cache miss). Revit runs commands on the UI thread one at a time, so there is no
    /// concurrency to guard against.
    /// </summary>
    private static readonly CodeRunner Runner = new();

    /// <summary>
    /// Open windows, keyed by tool name. A modeless window is not owned by the command that opened
    /// it, so pressing a ribbon button again must activate the existing form rather than open a
    /// second copy — and two different tools must not overwrite each other's window.
    /// </summary>
    private static readonly Dictionary<string, Session> Open = new(StringComparer.Ordinal);

    private static RunHandler? _handler;
    private static ExternalEvent? _externalEvent;

    /// <summary>
    /// Runs a tool from its SOURCE. The engine compiles it once per process and caches the assembly,
    /// so changing parameter values between runs costs nothing — the cache key is the CODE, not the
    /// values.
    /// </summary>
    public static Result Run(
        UIApplication uiApp,
        string toolName,
        string source,
        bool dryRun,
        ref string message)
    {
        UIDocument? uiDoc = uiApp.ActiveUIDocument;

        if (uiDoc?.Document == null)
        {
            TaskDialog.Show("Paracore", "Open a model first — this tool needs a document.");
            return Result.Cancelled;
        }

        // The engine's own extractor — the authority for what a parameter IS. A hand-written mirror
        // of a Params class would test our understanding of the metadata, not the metadata.
        var extractor = new ParameterExtractor(new FileLoggerWrapper());
        List<ScriptParameter> parameters = extractor.ExtractParameters(source);

        if (parameters.Count == 0)
        {
            TaskDialog.Show("Paracore",
                $"{toolName}: ParameterExtractor returned 0 parameters.\n\n"
                + $"Source length: {source.Length} characters.");
            return Result.Failed;
        }

        return RunCore(
            uiApp,
            uiDoc,
            new ToolRun
            {
                Name = toolName,
                Parameters = parameters,
                DryRun = dryRun,
                RichPayload = false,
                Source = source,
                Execute = (json, ctx) => Runner.Execute(source, json, ctx),
            },
            ref message);
    }

    /// <summary>
    /// Runs a tool from a PRECOMPILED assembly — the shipping shape for a sold pack.
    ///
    /// ⚠ The schema is not optional. Without source, the engine derives <c>[Unit]</c> conversion and
    /// the <c>[Confirm]</c> gate from the parameter metadata, and it REFUSES a payload that carries
    /// no schema rather than running a destructive tool with its gate open. That is why this overload
    /// takes <paramref name="schema"/> and sends it as a rich array.
    ///
    /// ⚠ The assembly is IL, not source — the same thing every .NET add-in ships. It is not
    /// "protected" in any absolute sense (nothing .NET is), but no readable script text travels
    /// with it.
    /// </summary>
    public static Result Run(
        UIApplication uiApp,
        string toolName,
        IReadOnlyList<ScriptParameter> schema,
        byte[] toolAssembly,
        bool dryRun,
        ref string message)
    {
        UIDocument? uiDoc = uiApp.ActiveUIDocument;

        if (uiDoc?.Document == null)
        {
            TaskDialog.Show("Paracore", "Open a model first — this tool needs a document.");
            return Result.Cancelled;
        }

        if (schema == null || schema.Count == 0)
        {
            TaskDialog.Show("Paracore",
                $"{toolName}: this pack carries no parameter schema, so its configurator cannot be built.");
            return Result.Failed;
        }

        return RunCore(
            uiApp,
            uiDoc,
            new ToolRun
            {
                Name = toolName,
                Parameters = schema.ToList(),
                DryRun = dryRun,
                RichPayload = true,
                Execute = (json, ctx) => Runner.ExecutePrecompiled(toolAssembly, json, ctx),
            },
            ref message);
    }

    private static Result RunCore(UIApplication uiApp, UIDocument uiDoc, ToolRun tool, ref string message)
    {
        if (Open.TryGetValue(tool.Name, out Session? existing))
        {
            if (existing.Tool.DryRun == tool.DryRun)
            {
                existing.Form.Activate();
                return Result.Succeeded;
            }

            // Same tool, different intent: close the old form and build the other one.
            existing.Form.Close();
            Open.Remove(tool.Name);
        }

        _handler ??= new RunHandler();
        _externalEvent ??= ExternalEvent.Create(_handler);

        var form = new ConfiguratorWindow(
            tool.Name,
            tool.Parameters,
            uiDoc.Document,
            tool.DryRun,
            discover: (parameter, values) =>
                ParameterDiscovery.DiscoverAsync(
                    uiApp, uiDoc, tool.Source, tool.Parameters, parameter, values));

        var session = new Session { Tool = tool, Form = form };
        Open[tool.Name] = session;

        form.RunRequested += () => RequestRun(session, uiApp);
        form.Closed += (_, _) =>
        {
            if (Open.TryGetValue(tool.Name, out Session? current) && ReferenceEquals(current, session))
            {
                Open.Remove(tool.Name);
            }
        };

        // Show(), not ShowDialog(): the user must be able to go back to Revit, pick a room, minimise
        // the form, and come back. A modal form makes the tool the only thing that can be done.
        form.Show();
        form.Activate();

        return Result.Succeeded;
    }

    private static void RequestRun(Session session, UIApplication uiApp)
    {
        ToolRun tool = session.Tool;

        Dictionary<string, object?>? extra = tool.DryRun
            ? new Dictionary<string, object?> { ["__dry_run__"] = true }
            : null;

        // Snapshot the values NOW: the form stays open, so it can be edited while the run is queued.
        string parametersJson = tool.RichPayload
            ? ParameterBridge.ToRichJson(tool.Parameters, session.Form.Values, extra)
            : ParameterBridge.ToJson(tool.Parameters, session.Form.Values, extra);

        session.Form.SetRunning(true);
        _handler!.Pending = () => Execute(session, uiApp, parametersJson);
        _externalEvent!.Raise();
    }

    private static void Execute(Session session, UIApplication uiApp, string parametersJson)
    {
        ToolRun tool = session.Tool;
        ConfiguratorWindow form = session.Form;

        // Re-read the document: the user may have closed or switched it while the form was open.
        UIDocument? uiDoc = uiApp.ActiveUIDocument;

        if (uiDoc?.Document == null)
        {
            form.SetRunning(false);
            TaskDialog.Show("Paracore", "There is no active document to run against.");
            return;
        }

        var context = new PackScriptContext(uiApp, uiDoc);
        var clock = Stopwatch.StartNew();
        ExecutionResult result;

        try
        {
            result = tool.Execute(parametersJson, context);
        }
        catch (Exception ex)
        {
            // CodeRunner catches its own failures, so reaching here means something outside the
            // script pipeline broke. Show it rather than letting it look like a silent no-op.
            result = ExecutionResult.Failure("❌ " + ex.Message);
        }

        clock.Stop();
        form.SetRunning(false);

        FileLogger.Log(
            $"[PackSdk] {tool.Name} dryRun={tool.DryRun} richPayload={tool.RichPayload} "
            + $"success={result.IsSuccess} in {clock.ElapsedMilliseconds} ms · "
            + $"{context.PrintLog.Count} log line(s) · {context.Outputs.Count} output(s)");

        if (session.Results != null)
        {
            try
            {
                session.Results.Close();
            }
            catch
            {
                // Already closed by the user; nothing to do.
            }
        }

        var results = new ResultsWindow(tool.Name, tool.DryRun, clock.Elapsed, result, context.ToReport());
        session.Results = results;

        // Modeless for the same reason the form is: a result you cannot read while looking at the
        // model is a result you have to memorise.
        results.Show();
        results.Activate();
    }

    /// <summary>Everything one tool needs to run, decided once when its button is pressed.</summary>
    private sealed class ToolRun
    {
        public required string Name { get; init; }

        public required List<ScriptParameter> Parameters { get; init; }

        public required bool DryRun { get; init; }

        /// <summary>True when the payload must be the rich array (precompiled path).</summary>
        public required bool RichPayload { get; init; }

        /// <summary>Runs the tool body. Bound to source, or to precompiled bytes, at the call site.</summary>
        public required Func<string, PackScriptContext, ExecutionResult> Execute { get; init; }

        /// <summary>
        /// The source, when there is one. Discovery needs it to compile an author's <c>_Options</c>
        /// provider; a precompiled pack has none, so discovery falls back to automatic discovery.
        /// </summary>
        public string Source { get; init; } = string.Empty;
    }

    private sealed class Session
    {
        public required ToolRun Tool { get; init; }

        public required ConfiguratorWindow Form { get; init; }

        public ResultsWindow? Results { get; set; }
    }
}

/// <summary>
/// Queues the run on Revit's own thread.
///
/// ⚠ This is not ceremony. The configurator is MODELESS, so by the time the user presses Run the
/// command that opened it has already returned and its API context is gone. Touching the document
/// from a WPF click handler outside that context is what Revit rejects; an
/// <see cref="ExternalEvent"/> is the supported way back in.
/// </summary>
internal sealed class RunHandler : IExternalEventHandler
{
    public Action? Pending { get; set; }

    public void Execute(UIApplication app)
    {
        Action? work = Pending;
        Pending = null;

        try
        {
            work?.Invoke();
        }
        catch (Exception ex)
        {
            FileLogger.LogError("[PackSdk] ExternalEvent failed: " + ex);
            TaskDialog.Show("Paracore", ex.Message);
        }
    }

    public string GetName() => "Paracore Pack Run";
}
