using System.Collections.Generic;

namespace Paracore.PackSdk;

/// <summary>One visualisation the script produced: <c>table</c>, <c>chart-bar</c>, … plus its JSON.</summary>
public sealed record StructuredItem(string Type, string Json);

/// <summary>
/// What a run produced, as plain data — no Revit types, no engine types.
///
/// ⚠ This split is deliberate. <see cref="ResultsWindow"/> renders a <see cref="RunReport"/>; it does
/// not know what an <c>ICoreScriptContext</c> is. That keeps the window testable without a Revit
/// install (the PNG harness builds one of these by hand), and it means the next host — a Forge
/// preview, a CI check — can reuse the surface with its own capture.
/// </summary>
public sealed class RunReport
{
    public required IReadOnlyList<string> Log { get; init; }

    public required IReadOnlyList<StructuredItem> Outputs { get; init; }

    public required IReadOnlyList<int> PipelineDiagnostics { get; init; }
}
