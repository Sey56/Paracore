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

                var fileTypeDecls = root.DescendantNodes().OfType<MemberDeclarationSyntax>()
                    .Where(n => n is ClassDeclarationSyntax || n is StructDeclarationSyntax || n is EnumDeclarationSyntax || n is InterfaceDeclarationSyntax)
                    .ToList();

                var strippedBody = root.RemoveNodes(
                    root.DescendantNodes().OfType<UsingDirectiveSyntax>().Cast<SyntaxNode>()
                    .Concat(fileTypeDecls.Cast<SyntaxNode>()),
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

            // 1. Move ALL using directives to the top.
            foreach (var file in scriptFiles)
            {
                var tree = CSharpSyntaxTree.ParseText(file.Content, path: file.FileName);
                var root = tree.GetRoot();
                var usings = root.DescendantNodes().OfType<UsingDirectiveSyntax>().ToList();

                if (usings.Any())
                {
                    var lineSpan = root.SyntaxTree.GetLineSpan(usings.First().FullSpan);
                    int line = lineSpan.StartLinePosition.Line + 1;
                    
                    resultParts.Add($"#line {line} \"{file.FileName}\"");
                    foreach (var u in usings)
                    {
                        resultParts.Add(u.ToString().Trim());
                    }
                }
            }

            resultParts.Add(""); 
            resultParts.Add("// --- Project Script Bodies ---");
            resultParts.Add("");

            // 2. Add each file as a contiguous block. 
            foreach (var file in scriptFiles)
            {
                var tree = CSharpSyntaxTree.ParseText(file.Content, path: file.FileName);
                var root = tree.GetRoot();
                var sourceText = root.SyntaxTree.GetText();
                var editableText = sourceText.ToString();

                var usings = root.DescendantNodes().OfType<UsingDirectiveSyntax>();
                var nodesToBlank = usings.Cast<SyntaxNode>().ToList();

                if (file.FileName != topLevelScriptFile?.FileName)
                {
                    var globals = root.DescendantNodes().OfType<GlobalStatementSyntax>();
                    nodesToBlank.AddRange(globals);
                }

                foreach (var node in nodesToBlank.OrderByDescending(n => n.FullSpan.Start))
                {
                    var span = node.FullSpan;
                    var nodeText = editableText.Substring(span.Start, span.Length);
                    var replacement = new string(nodeText.Select(c => c == '\n' || c == '\r' ? c : ' ').ToArray());
                    editableText = editableText.Remove(span.Start, span.Length).Insert(span.Start, replacement);
                }

                // V3 Guard: Ensure #line is absolutely on a fresh line
                resultParts.Add($"#line 1 \"{file.FileName}\"");
                resultParts.Add(editableText.TrimEnd());
                resultParts.Add(""); 
            }

            // Using explicit Environment.NewLine for the join
            return string.Join(Environment.NewLine, resultParts);
        }
    }
}
