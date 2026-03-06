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
                if (obj is MappedDiagnostic other)
                {
                    return FileName == other.FileName && 
                           Line == other.Line && 
                           ErrorId == other.ErrorId;
                }
                return false;
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
    }
}
