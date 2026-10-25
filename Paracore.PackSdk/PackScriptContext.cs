using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;

namespace Paracore.PackSdk;

/// <summary>
/// The host side of a script run, as the engine expects it.
///
/// ⚠ This is the ONLY place a pack captures script output. <see cref="CoreScript.Engine.Globals.ExecutionGlobals"/>
/// routes every <c>Println</c> to <see cref="Println"/> and every <c>Table()</c>/<c>BarGraph()</c> to
/// <see cref="AddStructuredOutput"/> — the desktop app renders those into its Output panel, and Revit
/// renders nothing at all. A pack without this class runs its tool SILENTLY.
///
/// ⚠ Read the log from here, not from <c>ExecutionResult.PrintLog</c>: on the failure path
/// <c>CodeRunner</c> never assigns <c>result.PrintLog</c> (it passes the lines as <c>ErrorDetails</c>
/// instead), so a failure would show an empty log exactly when the log matters most.
/// </summary>
public sealed class PackScriptContext : ICoreScriptContext
{
    private readonly List<string> _log = [];

    public PackScriptContext(UIApplication uiApp, UIDocument uiDoc)
    {
        UIApp = uiApp;
        UIDoc = uiDoc;
    }

    public UIApplication UIApp { get; }

    public UIDocument UIDoc { get; }

    public Document Doc => UIDoc.Document
        ?? throw new InvalidOperationException("There is no active document.");

    public Action<string>? PrintCallback { get; set; }

    public IReadOnlyList<string> PrintLog => _log;

    /// <summary>
    /// True while the engine is computing parameter options — the engine then refuses transactions
    /// rather than editing the model behind a dropdown. We only execute, so it stays false.
    /// </summary>
    public bool IsReadOnly { get; set; }

    public List<int> PipelineDiagnostics { get; set; } = [];

    /// <summary>Tables and charts, in the order the script produced them.</summary>
    public List<StructuredItem> Outputs { get; } = [];

    /// <summary>
    /// ⚠ Not used by this window — it exists because <c>CodeRunner</c> copies a context property with
    /// this exact name into <c>ExecutionResult.StructuredOutput</c>. Dropping it would leave the
    /// result's structured output empty for any other consumer.
    /// </summary>
    public List<string> StructuredOutputLog { get; } = [];

    public void Println(string message)
    {
        string line = message ?? "";
        _log.Add(line);
        PrintCallback?.Invoke(line);
    }

    /// <summary>
    /// <c>Print</c> means "no newline" — it extends the current line instead of starting one.
    /// </summary>
    public void Print(string message)
    {
        string text = message ?? "";
        if (_log.Count == 0)
        {
            _log.Add(text);
        }
        else
        {
            _log[^1] += text;
        }

        PrintCallback?.Invoke(text);
    }

    public void LogError(string message) => _log.Add("✗ " + (message ?? ""));

    public void AddStructuredOutput(string type, string jsonData)
    {
        Outputs.Add(new StructuredItem(type ?? "unknown", jsonData ?? "null"));
        StructuredOutputLog.Add(jsonData ?? "null");
    }

    /// <summary>
    /// Freezes the capture into plain data for <see cref="ResultsWindow"/>.
    /// Snapshotted, not handed over live: the window must show what the run produced, and a later
    /// run must not silently rewrite a window that is already open.
    /// </summary>
    public RunReport ToReport() => new()
    {
        Log = _log.ToList(),
        Outputs = Outputs.ToList(),
        PipelineDiagnostics = PipelineDiagnostics.ToList(),
    };
}
