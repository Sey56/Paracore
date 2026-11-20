using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Paracore.Server.Services
{
    /// <summary>
    /// Desktop-only vocabulary for REPL string completion.
    ///
    /// ⚠ USER RULING 2026-11-20: IntelliSense belongs to the desktop app. The Revit add-in
    /// used to supply a much smaller live parameter list as soon as its ribbon toggle was ON,
    /// and the vocabulary never returned to the full desktop set when it was toggled OFF.
    /// This class therefore NEVER consults the add-in bridge. Answers come from the offline
    /// metadata catalog derived from RevitAPI.dll, plus any snapshots written by earlier runs.
    /// </summary>
    public sealed class ReplCatalogRouter : IReplCompletionCatalog
    {
        private readonly ReplMetadataCatalog _offline = new();
        private readonly string _cacheRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "paracore-data", "repl-catalog");

        private sealed class CachedItem
        {
            public string Label { get; set; } = "";
            public string InsertText { get; set; } = "";
            public string Kind { get; set; } = "";
            public string? Detail { get; set; }
            public string SortText { get; set; } = "";
        }

        public Task<IReadOnlyList<ReplCompletion>> GetCategoryCompletionsAsync(
            CancellationToken cancellationToken = default)
            => _offline.GetCategoryCompletionsAsync(cancellationToken);

        public async Task<IReadOnlyList<ReplCompletion>> GetParameterCompletionsAsync(
            string categoryHint,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(categoryHint))
                return Array.Empty<ReplCompletion>();

            string key = Normalize(categoryHint);

            IReadOnlyList<ReplCompletion> fromDisk = ReadSnapshot(key);
            if (fromDisk.Count > 0) return fromDisk;

            return await _offline.GetParameterCompletionsAsync(categoryHint, cancellationToken)
                .ConfigureAwait(false);
        }

        // ── on-disk snapshots from earlier sessions ───────────────────────────────

        private IReadOnlyList<ReplCompletion> ReadSnapshot(string category)
        {
            try
            {
                string? file = null;
                if (Directory.Exists(_cacheRoot))
                {
                    // A snapshot may be from any document/version; the newest one is
                    // the best available and is never allowed to change mid-keystroke.
                    file = Directory.GetFiles(_cacheRoot, category + ".json", SearchOption.AllDirectories)
                        .OrderByDescending(f => new FileInfo(f).LastWriteTime)
                        .FirstOrDefault();
                }
                if (file == null) return Array.Empty<ReplCompletion>();

                var items = JsonSerializer.Deserialize<List<CachedItem>>(File.ReadAllText(file));
                if (items == null || items.Count == 0) return Array.Empty<ReplCompletion>();

                FileLogger.Log($"[ReplCatalogRouter] Loaded {items.Count} desktop-cached parameters for {category}.");
                string source = Path.GetFileName(Path.GetDirectoryName(Path.GetDirectoryName(file)!)) ?? "snapshot";
                return items.Select(i => new ReplCompletion(
                        i.Label, i.InsertText, i.Kind,
                        $"cached from {source}" + (string.IsNullOrEmpty(i.Detail) ? "" : $" · {i.Detail}"),
                        i.SortText))
                    .ToList();
            }
            catch (Exception ex)
            {
                FileLogger.LogWarning($"[ReplCatalogRouter] cache read failed: {ex.Message}");
                return Array.Empty<ReplCompletion>();
            }
        }

        /// <summary>"Walls" / "wall" / "OST_Walls" -> "OST_Walls", which the offline catalog parses.</summary>
        private static string Normalize(string hint)
        {
            string h = hint.Trim();
            if (h.StartsWith("OST_", StringComparison.OrdinalIgnoreCase)) return h;
            return "OST_" + h.Replace(" ", string.Empty).Replace("_", string.Empty);
        }
    }
}
