using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public static class ScriptParser
    {
        public static ScriptFile IdentifyTopLevelScript(List<ScriptFile> scriptFiles)
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

        public static string CombineScriptFiles(List<ScriptFile> scriptFiles)
        {
            if (scriptFiles is not { Count: > 0 })
                throw new InvalidDataException("No valid script files to combine.");

            var allUsingDirectives = new HashSet<string>();
            
            // Store content with source mapping: (Content, File, Line)
            var otherUserDefinedTypes = new List<(string Content, string File, int Line)>();
            (string Content, string File, int Line)? paramsClassData = null;
            
            string mainScriptBody = null;
            int mainBodyStartLine = 1;
            
            var topLevelScriptFile = IdentifyTopLevelScript(scriptFiles);
            if(topLevelScriptFile == null)
            {
                // This can happen if a folder contains only class libraries and no executable code.
                mainScriptBody = ""; 
            }

            foreach (var file in scriptFiles)
            {
                // Ensure parsing with path so Location works
                var tree = CSharpSyntaxTree.ParseText(file.Content, path: file.FileName);
                var root = tree.GetRoot();

                // Collect all using directives
                var fileUsingDirectives = root.DescendantNodes().OfType<UsingDirectiveSyntax>().ToList();
                foreach (var u in fileUsingDirectives)
                    allUsingDirectives.Add(u.ToString());

                // Collect all user-defined types
                var fileTypeDecls = root.DescendantNodes().OfType<MemberDeclarationSyntax>()
                    .Where(n => n is ClassDeclarationSyntax || n is StructDeclarationSyntax || n is EnumDeclarationSyntax || n is InterfaceDeclarationSyntax)
                    .ToList();
                
                foreach (var decl in fileTypeDecls)
                {
                    string content = decl.ToFullString().Trim();
                    int line = decl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                    
                    // Check if this is the Params class
                    if (decl is ClassDeclarationSyntax classDecl && classDecl.Identifier.Text == "Params")
                    {
                        paramsClassData = (content, file.FileName, line);
                    }
                    else
                    {
                        // Avoid duplicates
                        if (!otherUserDefinedTypes.Any(t => t.Content == content))
                            otherUserDefinedTypes.Add((content, file.FileName, line));
                    }
                }

                if (file.FileName == topLevelScriptFile?.FileName)
                {
                    // Calculate start line for the main body using FullSpan to include leading trivia (comments)
                    var firstGlobal = root.DescendantNodes().OfType<GlobalStatementSyntax>().FirstOrDefault();
                    if (firstGlobal != null)
                    {
                        var span = firstGlobal.FullSpan;
                        var lineSpan = root.SyntaxTree.GetLineSpan(span);
                        mainBodyStartLine = lineSpan.StartLinePosition.Line + 1;
                    }

                    // Extract stripped body (potential top-level statements)
                    // Do NOT Trim(), preserve leading trivia (newlines/comments) to match the line calculation
                    mainScriptBody = root.RemoveNodes(
                        fileUsingDirectives.Cast<SyntaxNode>().Concat(fileTypeDecls.Cast<SyntaxNode>()),
                        SyntaxRemoveOptions.KeepNoTrivia
                    ).ToFullString();
                }
            }

            if (string.IsNullOrWhiteSpace(mainScriptBody) && topLevelScriptFile != null)
            {
                // It's possible the body is empty or just whitespace/comments. 
                // If it's effectively empty but we have a file, that's fine, but check for logic.
                // We'll proceed, as empty scripts are valid (do nothing).
            }

            var globalImportsList = allUsingDirectives.Where(u => u.Trim().StartsWith("global using")).ToList();
            var normalImportsList = allUsingDirectives.Where(u => u.Trim().StartsWith("using") && !u.Trim().StartsWith("global using")).ToList();

            // Build a list of non-empty script parts to combine
            var parts = new List<string>();

            if (globalImportsList.Any())
            {
                parts.Add(string.Join("\n", globalImportsList));
            }

            if (normalImportsList.Any())
            {
                parts.Add(string.Join("\n", normalImportsList));
            }

            if (!string.IsNullOrWhiteSpace(mainScriptBody))
            {
                // Inject line mapping for main body
                if (topLevelScriptFile != null)
                    parts.Add($"#line {mainBodyStartLine} \"{topLevelScriptFile.FileName}\"\n{mainScriptBody}");
                else
                    parts.Add(mainScriptBody);
            }
            
            // Add Params class immediately after logic (Top Priority)
            if (paramsClassData.HasValue)
            {
                // Combine directive and content to avoid extra newlines from Join
                parts.Add($"#line {paramsClassData.Value.Line} \"{paramsClassData.Value.File}\"\n{paramsClassData.Value.Content}");
            }

            if (otherUserDefinedTypes.Any())
            {
                foreach (var typeData in otherUserDefinedTypes)
                {
                    parts.Add($"#line {typeData.Line} \"{typeData.File}\"\n{typeData.Content}");
                }
            }

            // Join all major parts with double newlines
            return string.Join("\n\n", parts);
        }
    }
}
