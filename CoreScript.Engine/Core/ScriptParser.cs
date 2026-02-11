using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Text;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public class ScriptParser : IScriptParser
    {
        public ScriptFile IdentifyTopLevelScript(List<ScriptFile> scriptFiles)
        {
            if (scriptFiles == null || !scriptFiles.Any())
            {
                return null;
            }

            if (scriptFiles.Count == 1)
            {
                return scriptFiles.First();
            }

            ScriptFile topLevelScriptFile = null;
            foreach (var file in scriptFiles)
            {
                var tree = CSharpSyntaxTree.ParseText(file.Content);
                var root = tree.GetRoot();

                var fileUsingDirectives = root.DescendantNodes().OfType<UsingDirectiveSyntax>().ToList();
                var fileTypeDecls = root.DescendantNodes().OfType<MemberDeclarationSyntax>()
                    .Where(n => n is ClassDeclarationSyntax || n is StructDeclarationSyntax || n is EnumDeclarationSyntax || n is InterfaceDeclarationSyntax)
                    .ToList();

                var strippedBody = root.RemoveNodes(
                    fileUsingDirectives.Cast<SyntaxNode>().Concat(fileTypeDecls.Cast<SyntaxNode>()),
                    SyntaxRemoveOptions.KeepNoTrivia
                ).ToFullString().Trim();

                if (!string.IsNullOrWhiteSpace(strippedBody))
                {
                    if (topLevelScriptFile != null)
                    {
                        throw new System.InvalidOperationException("Only one script file can contain top-level statements.");
                    }
                    topLevelScriptFile = file;
                }
            }
            return topLevelScriptFile;
        }

        public string CombineScriptFiles(List<ScriptFile> scriptFiles)
        {
            if (scriptFiles is not { Count: > 0 })
                throw new InvalidDataException("No valid script files to combine.");

            var topLevelScriptFile = IdentifyTopLevelScript(scriptFiles);
            var resultParts = new List<string>();

            // 1. Move ALL usings to the very top with original file/line mapping
            // This is required because Roslyn Scripting requires usings to be at the start of the submission.
            foreach (var file in scriptFiles)
            {
                var tree = CSharpSyntaxTree.ParseText(file.Content, path: file.FileName);
                var root = tree.GetRoot();
                var usings = root.DescendantNodes().OfType<UsingDirectiveSyntax>();

                foreach (var u in usings)
                {
                    var lineSpan = root.SyntaxTree.GetLineSpan(u.FullSpan);
                    int line = lineSpan.StartLinePosition.Line + 1;
                    resultParts.Add($"#line {line} \"{file.FileName}\"");
                    resultParts.Add(u.ToString());
                }
            }

            // 2. Add each file as a contiguous block with #line 1 mapping
            foreach (var file in scriptFiles)
            {
                var tree = CSharpSyntaxTree.ParseText(file.Content, path: file.FileName);
                var root = tree.GetRoot();
                var sourceText = root.SyntaxTree.GetText();
                var editableText = sourceText.ToString();

                // Determine nodes to "blank out" to avoid compiler conflicts while preserving line counts
                var usings = root.DescendantNodes().OfType<UsingDirectiveSyntax>();
                var globals = root.DescendantNodes().OfType<GlobalStatementSyntax>();

                // We blank out ALL usings (because they were moved to the top)
                var nodesToBlank = usings.Cast<SyntaxNode>().ToList();

                // If this is NOT the top-level script, we also blank out top-level statements
                if (file.FileName != topLevelScriptFile?.FileName)
                {
                    nodesToBlank.AddRange(globals);
                }

                // Apply blanking in reverse order to keep offsets valid
                foreach (var node in nodesToBlank.OrderByDescending(n => n.FullSpan.Start))
                {
                    var span = node.FullSpan;
                    var nodeText = editableText.Substring(span.Start, span.Length);
                    // Replace characters with spaces, preserving newlines
                    var replacement = new string(nodeText.Select(c => c == '\n' || c == '\r' ? c : ' ').ToArray());
                    editableText = editableText.Remove(span.Start, span.Length).Insert(span.Start, replacement);
                }

                resultParts.Add($"#line 1 \"{file.FileName}\"");
                resultParts.Add(editableText);
            }

            return string.Join(Environment.NewLine, resultParts);
        }
    }
}
