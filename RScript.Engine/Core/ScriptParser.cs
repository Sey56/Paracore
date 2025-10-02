using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using RScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace RScript.Engine.Core
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
            var allUserDefinedTypes = new HashSet<string>();
            string mainScriptBody = null;
            
            var topLevelScriptFile = IdentifyTopLevelScript(scriptFiles);
            if(topLevelScriptFile == null)
            {
                // This can happen if a folder contains only class libraries and no executable code.
                // In this case, we can treat all files as type declarations.
                mainScriptBody = ""; 
            }

            foreach (var file in scriptFiles)
            {
                var tree = CSharpSyntaxTree.ParseText(file.Content);
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
                    allUserDefinedTypes.Add(decl.ToFullString().Trim());

                if (file == topLevelScriptFile)
                {
                    // Extract stripped body (potential top-level statements)
                    mainScriptBody = root.RemoveNodes(
                        fileUsingDirectives.Cast<SyntaxNode>().Concat(fileTypeDecls.Cast<SyntaxNode>()),
                        SyntaxRemoveOptions.KeepNoTrivia
                    ).ToFullString().Trim();
                }
            }

            if (mainScriptBody == null && topLevelScriptFile != null)
            {
                // Error: The identified top-level file has no executable code after stripping.
                throw new InvalidOperationException("The identified top-level script file contains no executable statements.");
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
                parts.Add(mainScriptBody);
            }

            if (allUserDefinedTypes.Any())
            {
                // Join user types with double newlines internally first
                parts.Add(string.Join("\n\n", allUserDefinedTypes));
            }

            // Join all major parts with double newlines
            return string.Join("\n\n", parts);
        }
    }
}