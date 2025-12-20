using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public static class SemanticCombinator
    {
        public static string Combine(List<ScriptFile> scriptFiles)
        {
            if (scriptFiles == null || !scriptFiles.Any())
            {
                throw new InvalidDataException("No script files provided to combine.");
            }

            if (scriptFiles.Count == 1)
            {
                return ScriptParser.CombineScriptFiles(scriptFiles);
            }

            var topLevelScript = ScriptParser.IdentifyTopLevelScript(scriptFiles);
            if (topLevelScript == null)
            {
                return ScriptParser.CombineScriptFiles(scriptFiles);
            }

            var syntaxTrees = scriptFiles.ToDictionary(
                sf => sf.FileName, 
                sf => CSharpSyntaxTree.ParseText(sf.Content, path: sf.FileName),
                StringComparer.OrdinalIgnoreCase);

            var references = RevitApiResolver.GetRevitApiReferences()
                .Concat(new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });

            var compilation = CSharpCompilation.Create("ScriptCompilation")
                .AddReferences(references)
                .AddSyntaxTrees(syntaxTrees.Values);

            var referencedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var filesToProcess = new Queue<string>();

            filesToProcess.Enqueue(topLevelScript.FileName);
            referencedFiles.Add(topLevelScript.FileName);

            while (filesToProcess.Any())
            {
                var currentFileName = filesToProcess.Dequeue();
                var semanticModel = compilation.GetSemanticModel(syntaxTrees[currentFileName]);

                var referencedSymbols = syntaxTrees[currentFileName].GetRoot().DescendantNodes()
                    .Select(node => semanticModel.GetSymbolInfo(node).Symbol)
                    .Where(symbol => symbol != null && symbol.Locations.Any() && !symbol.Locations.First().IsInMetadata);

                foreach (var symbol in referencedSymbols)
                {
                    var sourceTree = symbol.Locations.First().SourceTree;
                    if (sourceTree != null && !string.IsNullOrEmpty(sourceTree.FilePath))
                    {
                        var referencedFileName = Path.GetFileName(sourceTree.FilePath);
                        if (!referencedFiles.Contains(referencedFileName))
                        {
                            if (syntaxTrees.ContainsKey(referencedFileName))
                            {
                                filesToProcess.Enqueue(referencedFileName);
                                referencedFiles.Add(referencedFileName);
                            }
                        }
                    }
                }
            }

            var scriptsToCombine = scriptFiles
                .Where(sf => referencedFiles.Contains(sf.FileName))
                .ToList();

            return ScriptParser.CombineScriptFiles(scriptsToCombine);
        }
    }
}
