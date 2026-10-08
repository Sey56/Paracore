using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Text;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Maps compilation diagnostics from the combined script back to original source files
    /// using #line directives, and deduplicates errors.
    /// </summary>
    public class DiagnosticMapper
    {
        private class LineMapping
        {
            public int CombinedLineNumber { get; set; }
            public string SourceFileName { get; set; } = string.Empty;
            public int SourceLineNumber { get; set; }
        }

        public class MappedDiagnostic
        {
            public string FileName { get; set; } = string.Empty;
            public int Line { get; set; }
            public int Column { get; set; }
            public string ErrorId { get; set; } = string.Empty;
            public string Message { get; set; } = string.Empty;
            public DiagnosticSeverity Severity { get; set; }

            public override string ToString()
            {
                return $"{FileName}({Line},{Column}): {(Severity == DiagnosticSeverity.Error ? "error" : "warning")} {ErrorId}: {Message}";
            }

            public override int GetHashCode()
            {
                return HashCode.Combine(FileName, Line, ErrorId);
            }

            public override bool Equals(object? obj)
            {
                return obj is MappedDiagnostic other
                    ? FileName == other.FileName &&
                           Line == other.Line &&
                           ErrorId == other.ErrorId
                    : false;
            }
        }

        /// <summary>
        /// Maps diagnostics to source files using Roslyn's native mapping and deduplicates them.
        /// </summary>
        public static List<MappedDiagnostic> MapAndDeduplicate(
            IEnumerable<Diagnostic> diagnostics,
            string combinedCode)
        {
            var mapped = diagnostics
                .Where(d => d.Severity == DiagnosticSeverity.Error || d.Severity == DiagnosticSeverity.Warning)
                .Select(MapNative)
                .ToList();

            // Deduplicate based on (FileName, Line, ErrorId, Message)
            return mapped
                .GroupBy(m => new { m.FileName, m.Line, m.ErrorId, m.Message })
                .Select(g => g.First())
                .OrderBy(m => m.FileName)
                .ThenBy(m => m.Line)
                .ToList();
        }

        private static MappedDiagnostic MapNative(Diagnostic diagnostic)
        {
            var mappedSpan = diagnostic.Location.GetMappedLineSpan();
            var lineSpan = diagnostic.Location.GetLineSpan();

            // If Roslyn found a #line mapping, use it. Otherwise fall back to unmapped.
            bool isMapped = mappedSpan.HasMappedPath;
            var pos = isMapped ? mappedSpan.StartLinePosition : lineSpan.StartLinePosition;
            string path = isMapped ? mappedSpan.Path : (lineSpan.Path ?? "Unknown");

            // We use 1-indexed lines/columns for user display
            return new MappedDiagnostic
            {
                FileName = System.IO.Path.GetFileName(path),
                Line = pos.Line + 1,
                Column = pos.Character + 1,
                ErrorId = diagnostic.Id,
                Message = diagnostic.GetMessage(),
                Severity = diagnostic.Severity
            };
        }

        /// <summary>
        /// The engine's own wrapper prefixes, injected by
        /// <c>PipelineTrackingRewriter</c> in front of every tracked call.
        /// </summary>
        private static readonly string[] InjectedWrapperPrefixes =
        {
            "CoreScript.Engine.Globals.ExecutionGlobals.TrackEnumerable(",
            "CoreScript.Engine.Globals.ExecutionGlobals.TrackSingle(",
            "CoreScript.Engine.Globals.ExecutionGlobals.TrackSource(",
        };

        /// <summary>
        /// Total length of injected wrapper text sitting BEFORE
        /// <paramref name="oneBasedColumn"/> on <paramref name="line"/> — i.e. how far
        /// the column has to be pulled back to land in the user's own coordinates.
        ///
        /// ⚠ EVERY wrapper before the column counts, not only the one the column
        /// happens to land inside. A diagnostic that is inside a wrapped call but
        /// PAST the prefix used to get no correction at all — measured 2026-10-08:
        /// a typo at user column 28 was reported at column 87, off by exactly the
        /// 59 characters of `CoreScript.Engine.Globals.ExecutionGlobals.TrackEnumerable(`.
        /// Nested wrappers on one line must SUM, not replace: two of them shifted a
        /// column by 118.
        ///
        /// A column landing INSIDE a prefix is pulled back to that wrapper's start,
        /// since that is the boundary of the user's own expression.
        /// </summary>
        private static int InjectedWrapperShiftAt(string line, int oneBasedColumn)
        {
            if (string.IsNullOrEmpty(line)) return 0;
            int col = oneBasedColumn - 1;   // 0-based
            int shift = 0;

            foreach (var prefix in InjectedWrapperPrefixes)
            {
                int from = 0;
                while (true)
                {
                    int at = line.IndexOf(prefix, from, StringComparison.Ordinal);
                    if (at < 0 || at >= col) break;

                    if (at + prefix.Length <= col)
                    {
                        shift += prefix.Length;          // wholly before the column
                        from = at + prefix.Length;
                    }
                    else
                    {
                        shift += col - at;               // column is inside this wrapper
                        break;                           // at most one occurrence can contain it
                    }
                }
            }
            return shift;
        }

        /// <summary>
        /// Renders REPL compilation diagnostics in the coordinate space of the
        /// user's own submission.
        ///
        /// The text the REPL compiles is not the text the user typed.
        /// <c>ReplSessionManager</c> prepends two <c>using</c> lines, and
        /// <c>PipelineTrackingRewriter</c> injects
        /// <c>CoreScript.Engine.Globals.ExecutionGlobals.Track…(</c> in front of
        /// every tracked call. Roslyn reports against THAT text, so one diagnostic
        /// can be wrong three ways at once:
        /// <list type="bullet">
        /// <item>the line is high by <paramref name="injectedLines"/> — measured on
        /// five independent failures, every one exactly +2;</item>
        /// <item>a diagnostic on a wrapped call lands on the engine's wrapper, so
        /// the column points into
        /// <c>CoreScript.Engine.Globals.ExecutionGlobals.TrackEnumerable(</c>
        /// (column 44) instead of at the user's expression (column 1);</item>
        /// <item>diagnostics inside the injected prelude are not the user's code at
        /// all and must not be shown as if they were.</item>
        /// </list>
        /// This maps all three away, then deduplicates.
        /// </summary>
        /// <param name="diagnostics">Diagnostics from the REPL compilation.</param>
        /// <param name="rewrittenCode">
        /// The submission AFTER PipelineTrackingRewriter — needed to locate the
        /// injected wrapper prefixes so their length can be subtracted.
        /// </param>
        /// <param name="injectedLines">Lines <c>ReplSessionManager</c> prepends.</param>
        public static List<MappedDiagnostic> MapReplDiagnostics(
            IEnumerable<Diagnostic> diagnostics,
            string rewrittenCode,
            int injectedLines)
        {
            var lines = (rewrittenCode ?? string.Empty).Replace("\r\n", "\n").Split('\n');

            return diagnostics
                .Where(d => d.Severity == DiagnosticSeverity.Error
                            || d.Severity == DiagnosticSeverity.Warning)
                .Select(d =>
                {
                    var mappedSpan = d.Location.GetMappedLineSpan();
                    var rawSpan = d.Location.GetLineSpan();

                    // A `#line` directive remaps the LINE but never the COLUMN, so
                    // the two are deliberately taken from different spans: the line
                    // honours #line when present and otherwise undoes the prepended
                    // usings, while the column always comes from the raw text so the
                    // injected-wrapper prefix can be located and subtracted.
                    bool lineMapped = mappedSpan.HasMappedPath;
                    int line = lineMapped
                        ? mappedSpan.StartLinePosition.Line + 1
                        : rawSpan.StartLinePosition.Line + 1 - injectedLines;

                    int column = rawSpan.StartLinePosition.Character + 1;
                    if (line >= 1 && line <= lines.Length)
                        column -= InjectedWrapperShiftAt(lines[line - 1], column);

                    return new MappedDiagnostic
                    {
                        FileName = "script",
                        Line = line,
                        Column = Math.Max(1, column),
                        ErrorId = d.Id,
                        Message = d.GetMessage(),
                        Severity = d.Severity
                    };
                })
                .Where(m => m.Line >= 1)   // anything inside the injected prelude
                .GroupBy(m => new { m.FileName, m.Line, m.Column, m.ErrorId, m.Message })
                .Select(g => g.First())
                .OrderBy(m => m.Line)
                .ThenBy(m => m.Column)
                .ToList();
        }
    }
}
