using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Paracore.Addin.Handlers
{
    /// <summary>
    /// Revit-domain half of REPL string completion. Categories come from the
    /// <c>BuiltInCategory</c> enumeration in the host; parameter names are read from
    /// the live document because shared parameters differ per project.
    /// </summary>
    /// <remarks>
    /// Both reads go through <see cref="ContextHandler"/>, which marshals onto Revit's
    /// UI thread. Results are cached for the lifetime of this singleton — completion
    /// fires on every keystroke, and a collector + parameter sweep is far too expensive
    /// to repeat there.
    /// </remarks>
    public sealed class ReplCompletionCatalog : IReplCompletionCatalog
    {
        private readonly ContextHandler _context;
        private IReadOnlyList<ReplCompletion>? _categories;
        private readonly Dictionary<string, IReadOnlyList<ReplCompletion>> _parameters =
            new(StringComparer.OrdinalIgnoreCase);

        public ReplCompletionCatalog(ContextHandler context)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
        }

        public async Task<IReadOnlyList<ReplCompletion>> GetCategoryCompletionsAsync(
            CancellationToken cancellationToken = default)
        {
            if (_categories != null) return _categories;

            cancellationToken.ThrowIfCancellationRequested();
            var response = await _context.GetModelCategories(new GetModelCategoriesRequest()).ConfigureAwait(false);
            if (response == null || !string.IsNullOrEmpty(response.ErrorMessage))
                return Array.Empty<ReplCompletion>();

            // ContextHandler returns Id = "OST_Walls" and Label = the localized name.
            // GetElements accepts both; the enum-derived spelling is canonical because
            // ParameterOptionsComputer strips the OST_ prefix before matching.
            var items = response.Categories
                .Where(c => !string.IsNullOrEmpty(c.Id) && c.Id.StartsWith("OST_", StringComparison.OrdinalIgnoreCase))
                .Select(c =>
                {
                    string magic = c.Id.Substring(4);
                    string detail = !string.IsNullOrEmpty(c.Label) &&
                                    !c.Label.Equals(magic, StringComparison.OrdinalIgnoreCase)
                        ? $"Category · {c.Id} · {c.Label}"
                        : $"Category · {c.Id}";
                    return new ReplCompletion(magic, magic, "EnumMember", detail, "0");
                })
                .DistinctBy(i => i.Label, StringComparer.OrdinalIgnoreCase)
                .OrderBy(i => i.Label, StringComparer.OrdinalIgnoreCase)
                .ToList();

            _categories = items;
            return items;
        }

        public async Task<IReadOnlyList<ReplCompletion>> GetParameterCompletionsAsync(
            string categoryHint,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(categoryHint))
                return Array.Empty<ReplCompletion>();

            string key = NormalizeKey(categoryHint);
            lock (_parameters)
            {
                if (_parameters.TryGetValue(key, out var cached)) return cached;
            }

            cancellationToken.ThrowIfCancellationRequested();
            var response = await _context.GetCategoryParameters(
                new GetCategoryParametersRequest { CategoryName = key }).ConfigureAwait(false);

            if (response == null || !string.IsNullOrEmpty(response.ErrorMessage))
            {
                FileLogger.LogWarning(
                    $"[ReplCompletionCatalog] Parameters for '{key}' unavailable: {response?.ErrorMessage ?? "null response"}");
                return Array.Empty<ReplCompletion>();
            }

            if (response.Parameters.Count == 0)
            {
                FileLogger.LogWarning($"[ReplCompletionCatalog] Host returned 0 parameters for '{key}'.");
            }

            var items = response.Parameters
                .Where(p => !string.IsNullOrEmpty(p.Name))
                .GroupBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .Select(g =>
                {
                    var p = g.First();
                    string detail = string.Join(" · ", new[]
                    {
                        p.StorageType,
                        p.IsType ? "Type" : "Instance",
                        p.BuiltinName,
                    }.Where(s => !string.IsNullOrEmpty(s)));
                    return new ReplCompletion(
                        p.Name,
                        p.Name,
                        p.IsType ? "Property" : "Field",
                        string.IsNullOrEmpty(detail) ? null : detail,
                        "0");
                })
                .OrderBy(i => i.Label, StringComparer.OrdinalIgnoreCase)
                .ToList();

            lock (_parameters)
            {
                _parameters[key] = items;
            }
            return items;
        }

        /// <summary>
        /// "Walls" / "wall" / "OST_Walls" all become "OST_Walls", the spelling
        /// GetCategoryParameters and the engine's category resolver both accept.
        /// </summary>
        private static string NormalizeKey(string hint)
        {
            string h = hint.Trim();
            if (h.StartsWith("OST_", StringComparison.OrdinalIgnoreCase)) return h;
            return "OST_" + h.Replace(" ", string.Empty).Replace("_", string.Empty);
        }
    }
}
