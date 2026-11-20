using CoreScript.Engine.Core.Rewriters;
using CoreScript.Engine.Logging;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Revit vocabulary for REPL string completions when the host catalog cannot answer.
    ///
    /// <para>
    /// Categories come from <c>BuiltInCategory</c> in RevitAPI.dll metadata -- the same
    /// ~590 names the host returns. Class/type/member completions need no catalog at all:
    /// Roslyn resolves those from the same references.
    /// </para>
    ///
    /// <para>
    /// Parameter names come from the <c>BuiltInParameter</c> enum in that same DLL. It is
    /// metadata, so no Revit process, document or licence is involved. Built-in parameter
    /// enum members are systematically named after their owning category
    /// (<c>WALL_UNCONNECTED_HEIGHT</c>, <c>DOOR_WIDTH</c>), which lets us produce the
    /// category-specific list the DSL needs: a wall offers "Unconnected Height", a door
    /// offers "Width". Shared parameters are project data and remain host-only; when
    /// Revit is connected the sidecar's catalog router asks the live document instead.
    /// </para>
    /// </summary>
    public sealed class ReplMetadataCatalog : IReplCompletionCatalog
    {
        private readonly object _gate = new();
        private IReadOnlyList<ReplCompletion>? _categories;
        private string? _categoryError;
        private readonly Dictionary<string, IReadOnlyList<ReplCompletion>> _parameters =
            new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _parameterHints = new(StringComparer.OrdinalIgnoreCase);

        private const string CategoryEnumName = "Autodesk.Revit.DB.BuiltInCategory";
        private const string ParameterEnumName = "Autodesk.Revit.DB.BuiltInParameter";

        /// <summary>
        /// Categories whose enum prefix does not follow mechanically from the singular
        /// category name. Everything else uses SINGULAR + "_".
        /// </summary>
        private static readonly Dictionary<string, string[]> PrefixOverrides =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["Structural Columns"] = new[] { "COLUMN_", "STRUCTURAL_COLUMN_" },
                ["Structural Framing"] = new[] { "BEAM_", "STRUCTURAL_" },
                ["Generic Models"] = new[] { "GENERIC_" },
                ["Mechanical Equipment"] = new[] { "MECHANICAL_" },
                ["Electrical Equipment"] = new[] { "ELECTRICAL_" },
                ["Plumbing Fixtures"] = new[] { "PLUMBING_" },
                ["Fire Alarm Devices"] = new[] { "FIRE_ALARM_" },
                ["Sprinklers"] = new[] { "SPRINKLER_" },
                ["Furniture"] = new[] { "FURNITURE_" },
                ["Casework"] = new[] { "CASEWORK_" },
            };

        /// <summary>Parameters every element has, regardless of category.</summary>
        private static readonly string[] UniversalPrefixes =
        {
            "ALL_MODEL_", "ALL_MODEL", "ELEM_TYPE_",
        };

        public Task<IReadOnlyList<ReplCompletion>> GetCategoryCompletionsAsync(
            CancellationToken cancellationToken = default)
        {
            lock (_gate)
            {
                if (_categories != null) return Task.FromResult(_categories);
                if (_categoryError != null)
                {
                    FileLogger.LogWarning(
                        $"[ReplMetadataCatalog] Category catalog unavailable: {_categoryError}");
                    return Task.FromResult<IReadOnlyList<ReplCompletion>>(
                        Array.Empty<ReplCompletion>());
                }
            }

            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                var compilation = CreateCompilation(cancellationToken);
                INamedTypeSymbol? type = compilation.GetTypeByMetadataName(CategoryEnumName);
                if (type == null)
                    throw new InvalidOperationException($"Metadata type '{CategoryEnumName}' not found.");

                var names = type.GetMembers()
                    .OfType<IFieldSymbol>()
                    .Where(f => f.HasConstantValue && f.Name.StartsWith("OST_", StringComparison.Ordinal))
                    .Select(f => f.Name.Substring(4));   // host strips OST_ too

                var items = names
                    .Where(n => !string.IsNullOrEmpty(n))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Select(n => new ReplCompletion(
                        n, n, "EnumMember", $"Category · OST_{n}", "0"))
                    .ToList();

                lock (_gate)
                {
                    _categories = items;
                    FileLogger.Log(
                        $"[ReplMetadataCatalog] Loaded {items.Count} categories from RevitAPI.dll metadata.");
                }
                return Task.FromResult<IReadOnlyList<ReplCompletion>>(items);
            }
            catch (Exception ex)
            {
                lock (_gate) _categoryError = ex.Message;
                FileLogger.LogWarning($"[ReplMetadataCatalog] {ex.GetType().Name}: {ex.Message}");
                return Task.FromResult<IReadOnlyList<ReplCompletion>>(
                    Array.Empty<ReplCompletion>());
            }
        }

        public Task<IReadOnlyList<ReplCompletion>> GetParameterCompletionsAsync(
            string categoryHint,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(categoryHint))
                return Task.FromResult<IReadOnlyList<ReplCompletion>>(Array.Empty<ReplCompletion>());

            string key = categoryHint.Trim();
            lock (_gate)
            {
                if (_parameters.TryGetValue(key, out var cached)) return Task.FromResult(cached);
                if (!_parameterHints.Add(key))
                    return Task.FromResult<IReadOnlyList<ReplCompletion>>(Array.Empty<ReplCompletion>());
            }

            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                var compilation = CreateCompilation(cancellationToken);
                INamedTypeSymbol? type = compilation.GetTypeByMetadataName(ParameterEnumName);
                if (type == null)
                    throw new InvalidOperationException($"Metadata type '{ParameterEnumName}' not found.");

                string[] enumNames = type.GetMembers()
                    .OfType<IFieldSymbol>()
                    .Where(f => f.HasConstantValue)
                    .Select(f => f.Name)
                    .ToArray();

                string[] prefixes = PrefixesFor(key);
                var items = enumNames
                    .Where(n => prefixes.Any(p => n.StartsWith(p, StringComparison.Ordinal)))
                    .Select(n => DisplayName(n, prefixes))
                    .Where(n => !string.IsNullOrEmpty(n))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Select(n => new ReplCompletion(
                        n, n, "Field", "Built-in parameter · offline metadata", "0"))
                    .ToList();

                lock (_gate)
                {
                    _parameters[key] = items;
                    FileLogger.Log(
                        $"[ReplMetadataCatalog] {items.Count} parameter names for '{key}' from {ParameterEnumName}.");
                }
                return Task.FromResult<IReadOnlyList<ReplCompletion>>(items);
            }
            catch (Exception ex)
            {
                FileLogger.LogWarning($"[ReplMetadataCatalog] parameters for '{key}': {ex.Message}");
                lock (_gate) _parameters[key] = Array.Empty<ReplCompletion>();
                return Task.FromResult<IReadOnlyList<ReplCompletion>>(Array.Empty<ReplCompletion>());
            }
        }

        /// <summary>
        /// "OST_Walls" / "Walls" / "wall" all resolve to the WALL_ family of built-in
        /// parameter names, plus the universal ALL_MODEL_* set.
        /// </summary>
        private static string[] PrefixesFor(string hint)
        {
            string clean = StripOst(hint).Replace(" ", string.Empty).Replace("_", string.Empty);
            string singular = Singular(clean);

            var prefixes = new List<string>(PrefixOverrides.TryGetValue(clean, out var mapped)
                ? mapped
                : new[] { singular.ToUpperInvariant() + "_" });
            prefixes.AddRange(UniversalPrefixes);
            return prefixes.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        private static string StripOst(string hint) =>
            hint.StartsWith("OST_", StringComparison.OrdinalIgnoreCase) ? hint.Substring(4) : hint;

        private static string Singular(string value)
        {
            if (value.Length > 3 && value.EndsWith("ies", StringComparison.OrdinalIgnoreCase))
                return value.Substring(0, value.Length - 3) + "Y";
            if (value.Length > 3 && value.EndsWith("ses", StringComparison.OrdinalIgnoreCase))
                return value.Substring(0, value.Length - 1);
            if (value.Length > 2 && value.EndsWith("s", StringComparison.OrdinalIgnoreCase) &&
                !value.EndsWith("ss", StringComparison.OrdinalIgnoreCase))
                return value.Substring(0, value.Length - 1);
            return value;
        }

        /// <summary>
        /// WALL_UNCONNECTED_HEIGHT -> "Unconnected Height". This is the spelling
        /// GetStr/GetNum/WhereParam accept: Engine resolves names back through
        /// BuiltInParameter with name.Replace(" ", "_").ToUpperInvariant().
        /// </summary>
        private static string DisplayName(string enumName, string[] prefixes)
        {
            string body = enumName;
            foreach (string prefix in prefixes.OrderByDescending(p => p.Length))
            {
                if (body.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    body = body.Substring(prefix.Length);
                    break;
                }
            }
            if (body.Length == 0) return string.Empty;

            return string.Join(" ", body.Split('_', StringSplitOptions.RemoveEmptyEntries)
                .Select(w => w.Length <= 2
                    ? w.ToUpperInvariant()
                    : char.ToUpperInvariant(w[0]) + w.Substring(1).ToLowerInvariant()));
        }

        private static CSharpCompilation CreateCompilation(CancellationToken cancellationToken)
        {
            var references = ScriptReferenceProvider.GetCoreReferences("ReplMetadataCatalog")
                .Concat(ScriptReferenceProvider.GetRevitReferences("ReplMetadataCatalog"))
                .ToList();

            if (references.Count == 0)
                throw new InvalidOperationException(
                    "No Revit metadata references. Set PARACORE_REVIT_DIR to the Revit install folder.");

            cancellationToken.ThrowIfCancellationRequested();
            return CSharpCompilation.Create(
                "paracore-repl-catalog",
                references: references);
        }
    }
}
