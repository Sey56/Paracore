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
            public string SourceFileName { get; set; }
            public int SourceLineNumber { get; set; }
        }

        public class MappedDiagnostic
        {
            public string FileName { get; set; }
            public int Line { get; set; }
            public int Column { get; set; }
            public string ErrorId { get; set; }
            public string Message { get; set; }
            public DiagnosticSeverity Severity { get; set; }

            public override string ToString()
            {
                return $"{FileName}({Line},{Column}): {(Severity == DiagnosticSeverity.Error ? "error" : "warning")} {ErrorId}: {Message}";
            }

            public override int GetHashCode()
            {
                return HashCode.Combine(FileName, Line, ErrorId);
            }

            public override bool Equals(object obj)
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
        /// Extracts #line directive mappings from the combined script.
        /// </summary>
        private static List<LineMapping> ExtractLineMappings(string combinedCode)
        {
            var mappings = new List<LineMapping>();
            var lines = combinedCode.Split('\n');
            
            string currentFile = null;
            int currentSourceLine = 1;
            
            for (int i = 0; i < lines.Length; i++)
            {
                int combinedLineNumber = i + 1;
                var line = lines[i].TrimEnd('\r');
                
                // Match #line directives: #line 1 "Params.cs"
                var match = Regex.Match(line, @"^\s*#line\s+(\d+)\s+""([^""]+)""");
                if (match.Success)
                {
                    currentSourceLine = int.Parse(match.Groups[1].Value);
                    currentFile = match.Groups[2].Value;
                    continue;
                }
                
                // Match #line hidden
                if (Regex.IsMatch(line, @"^\s*#line\s+hidden"))
                {
                    currentFile = null;
                    continue;
                }
                
                // If we have an active file mapping, record it
                if (!string.IsNullOrEmpty(currentFile))
                {
                    mappings.Add(new LineMapping
                    {
                        CombinedLineNumber = combinedLineNumber,
                        SourceFileName = currentFile,
                        SourceLineNumber = currentSourceLine
                    });
                    currentSourceLine++;
                }
            }
            
            return mappings;
        }

        /// <summary>
        /// Maps a diagnostic from the combined script to the original source file.
        /// </summary>
        private static MappedDiagnostic MapDiagnostic(Diagnostic diagnostic, List<LineMapping> mappings)
        {
            var lineSpan = diagnostic.Location.GetLineSpan();
            int combinedLine = lineSpan.StartLinePosition.Line + 1;
            int column = lineSpan.StartLinePosition.Character + 1;
            
            // Find the closest mapping for this line
            var mapping = mappings
                .Where(m => m.CombinedLineNumber <= combinedLine)
                .OrderByDescending(m => m.CombinedLineNumber)
                .FirstOrDefault();
            
            if (mapping != null)
            {
                // Calculate the offset from the mapping point
                int offset = combinedLine - mapping.CombinedLineNumber;
                int sourceLine = mapping.SourceLineNumber + offset;
                
                return new MappedDiagnostic
                {
                    FileName = mapping.SourceFileName,
                    Line = sourceLine,
                    Column = column,
                    ErrorId = diagnostic.Id,
                    Message = diagnostic.GetMessage(),
                    Severity = diagnostic.Severity
                };
            }
            
            // Fallback: use the diagnostic's own file path if available
            string fileName = lineSpan.Path ?? "Unknown";
            return new MappedDiagnostic
            {
                FileName = fileName,
                Line = combinedLine,
                Column = column,
                ErrorId = diagnostic.Id,
                Message = diagnostic.GetMessage(),
                Severity = diagnostic.Severity
            };
        }

        /// <summary>
        /// Maps diagnostics to source files and deduplicates them.
        /// </summary>
        public static List<MappedDiagnostic> MapAndDeduplicate(
            IEnumerable<Diagnostic> diagnostics, 
            string combinedCode)
        {
            var mappings = ExtractLineMappings(combinedCode);
            
            var mapped = diagnostics
                .Where(d => d.Severity == DiagnosticSeverity.Error || d.Severity == DiagnosticSeverity.Warning)
                .Select(d => MapDiagnostic(d, mappings))
                .ToList();
            
            // Deduplicate based on (FileName, ErrorId, Message)
            // This handles cases where the same error appears on consecutive lines
            // (e.g., undefined type in both property declaration and initializer)
            var deduplicated = mapped
                .GroupBy(m => new { m.FileName, m.ErrorId, m.Message })
                .Select(g => g.OrderBy(m => m.Line).First()) // Take the first occurrence
                .OrderBy(m => m.FileName)
                .ThenBy(m => m.Line)
                .ToList();
            
            return deduplicated;
        }
    }
}
