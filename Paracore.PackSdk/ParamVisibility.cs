using CoreScript.Engine.Models;

namespace Paracore.PackSdk;

/// <summary>
/// A faithful port of <c>rap-web/src/utils/parameterVisibility.ts</c>.
///
/// ⚠ This is deliberately NOT an improvement on the TypeScript. The two front-ends must agree:
/// a form that hides a field the desktop app shows is a bug report waiting to happen, and the
/// desktop is what the customer has been using. Every quirk below is copied on purpose.
///
/// The quirks, all verified against the TS source:
///   • Three grammars only — <c>P</c>, <c>P == 'v'</c>, <c>P != 'v'</c>.
///   • A COMPOUND expression such as <c>A == 'x' &amp;&amp; B</c> splits into three parts, the TS
///     checks <c>parts.length !== 2</c> and returns <b>true</b> — i.e. ALWAYS VISIBLE, silently.
///     ParacoreFinishing's Params.cs documents this trap and composes two members instead.
///   • Comparison is <c>String(actual) == String(expected)</c>, so a bool compares as
///     "true"/"false" lowercase — hence <see cref="ToJsString"/> lowercases booleans. C#'s
///     ToString() would give "True" and silently break every <c>Flag == 'true'</c> condition.
///   • A referenced parameter that does not exist means VISIBLE, not hidden.
/// </summary>
public static class ParamVisibility
{
    /// <summary>Mirrors JS <c>String(value)</c> for the types the extractor produces.</summary>
    internal static string ToJsString(object? value) => value switch
    {
        null => "null",
        bool b => b ? "true" : "false",
        double d => d.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        float f => f.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        IFormattable f2 => f2.ToString(null, System.Globalization.CultureInfo.InvariantCulture),
        _ => value.ToString() ?? "null",
    };

    /// <summary>Mirrors the TS truthiness block: true, "true", non-empty, non-zero.</summary>
    private static bool Truthy(object? value) => value switch
    {
        null => false,
        bool b => b,
        string s => s.Equals("true", StringComparison.OrdinalIgnoreCase),
        double d => d != 0,
        int i => i != 0,
        _ => false,
    };

    public static bool IsVisible(ScriptParameter p, IReadOnlyDictionary<string, object?> values)
    {
        string? condition = p.VisibleWhen;
        if (string.IsNullOrWhiteSpace(condition))
        {
            return true;
        }

        string? op = condition.Contains("==", StringComparison.Ordinal) ? "=="
                   : condition.Contains("!=", StringComparison.Ordinal) ? "!="
                   : null;

        if (op == null)
        {
            // Bare parameter name: visible when that parameter is truthy.
            return values.TryGetValue(condition.Trim(), out object? flag) ? Truthy(flag) : true;
        }

        string[] parts = condition.Split([op], StringSplitOptions.None);

        // ⚠ Compound condition → ALWAYS VISIBLE. This is the TS behaviour, not a fallback.
        if (parts.Length != 2)
        {
            return true;
        }

        string name = parts[0].Trim();
        string expected = parts[1].Trim().Trim('\'', '"');

        if (!values.TryGetValue(name, out object? actual))
        {
            return true;
        }

        bool equal = string.Equals(ToJsString(actual), expected, StringComparison.Ordinal);
        return op == "==" ? equal : !equal;
    }

    /// <summary>Mirrors <c>isParameterEnabled</c> in the same file.</summary>
    public static bool IsEnabled(ScriptParameter p, IReadOnlyDictionary<string, object?> values)
    {
        if (string.IsNullOrEmpty(p.EnabledWhenParam) || string.IsNullOrEmpty(p.EnabledWhenValue))
        {
            return true;
        }

        return values.TryGetValue(p.EnabledWhenParam, out object? target)
            && string.Equals(ToJsString(target), p.EnabledWhenValue, StringComparison.Ordinal);
    }
}
