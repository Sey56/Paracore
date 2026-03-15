using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using CoreScript.Engine.Models;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using CoreScript.Engine.Logging;
using System;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class MetadataExtractor : IMetadataExtractor
    {
        private readonly ILogger _logger;

        public MetadataExtractor(ILogger logger)
        {
            _logger = logger;
        }

        public ScriptMetadata ExtractMetadata(string scriptContent)
        {
            var metadata = new ScriptMetadata();
            if (string.IsNullOrWhiteSpace(scriptContent))
            {
                return metadata;
            }

            // --- .ptool Support ---
            // If the content is JSON, it's a proprietary tool package
            if (scriptContent.Trim().StartsWith("{") && scriptContent.Trim().EndsWith("}"))
            {
                try
                {
                    using (JsonDocument doc = JsonDocument.Parse(scriptContent))
                    {
                        var rootElement = doc.RootElement;
                        if (rootElement.TryGetProperty("metadata", out var metaElem))
                        {
                            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                            metadata = JsonSerializer.Deserialize<ScriptMetadata>(metaElem.GetRawText(), options) ?? metadata;

                            // V4: Ensure IsWatchdog is preserved/assigned from JSON
                            if (metaElem.TryGetProperty("is_watchdog", out var isW) || metaElem.TryGetProperty("isWatchdog", out isW))
                            {
                                metadata.IsWatchdog = isW.GetBoolean();
                            }

                            metadata.IsCompiled = true;
                            metadata.IsProtected = true;
                            return metadata;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"[MetadataExtractor] Failed to parse .ptool JSON: {ex.Message}");
                }
            }
            // ---------------------

            metadata.DocumentType = "Any"; // Default value
            metadata.IsWatchdog = Regex.IsMatch(scriptContent, @"Watchdog\s*\(");

            SyntaxTree tree = CSharpSyntaxTree.ParseText(scriptContent);
            var root = tree.GetRoot();

            // V3.1: Also check leading trivia of the root itself, in case comment is at the very top
            var multilineComments = root.GetLeadingTrivia()
                .Concat(root.DescendantTrivia())
                .Where(trivia => trivia.Kind() == SyntaxKind.MultiLineCommentTrivia ||
                                 trivia.Kind() == SyntaxKind.MultiLineDocumentationCommentTrivia)
                .Select(trivia => trivia.ToString())
                .Distinct()
                .ToList();

            foreach (var commentText in multilineComments)
            {
                var content = commentText.Length > 4 ? commentText.Substring(2, commentText.Length - 4) : string.Empty;
                var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None)
                    .Select(line => line.Trim().TrimStart('*').Trim());
                var cleanComment = string.Join("\n", lines);

                ParseCleanComment(cleanComment, metadata);
            }

            // XML parsing for name override
            var classNode = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classNode != null)
            {
                var xmlTrivia = classNode.GetLeadingTrivia()
                    .Select(i => i.GetStructure())
                    .OfType<DocumentationCommentTriviaSyntax>()
                    .FirstOrDefault();

                if (xmlTrivia != null)
                {
                    var nameFromXml = GetTextFromTag(xmlTrivia, "name");
                    if (!string.IsNullOrEmpty(nameFromXml))
                    {
                        metadata.Name = nameFromXml;
                    }
                }
            }

            _logger.Log($"[MetadataExtractor] Extracted Metadata: Name={metadata.Name}, Description={metadata.Description}, Author={metadata.Author}, Website={metadata.Website}, Categories={string.Join(", ", metadata.Categories)}, LastRun={metadata.LastRun}, Dependencies={string.Join(", ", metadata.Dependencies)}, DocumentType={metadata.DocumentType}", LogLevel.Debug);

            return metadata;
        }

        private void ParseCleanComment(string cleanComment, ScriptMetadata metadata)
        {
            var lines = cleanComment.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            string? currentKey = null;
            var currentValue = new List<string>();

            // V3.1: More permissive key regex (allows spaces like 'Usage Examples')
            var keyRegex = new Regex(@"^([a-zA-Z_\s]+):\s*(.*)");

            Action processPreviousKey = () =>
            {
                if (currentKey != null && currentValue.Count > 0)
                {
                    // Clean key by removing spaces for the switch statement
                    string cleanKey = currentKey.Replace(" ", "").ToLower();
                    ProcessMetadataValue(metadata, cleanKey, string.Join("\n", currentValue).Trim());
                }
                currentValue.Clear();
            };

            foreach (var line in lines)
            {
                Match match = keyRegex.Match(line);
                if (match.Success)
                {
                    processPreviousKey();
                    currentKey = match.Groups[1].Value.Trim();
                    string restOfLine = match.Groups[2].Value.Trim();
                    if (!string.IsNullOrEmpty(restOfLine))
                    {
                        currentValue.Add(restOfLine);
                    }
                }
                else if (currentKey != null)
                {
                    currentValue.Add(line.Trim());
                }
            }
            processPreviousKey(); // Process the last key
        }

        private void ProcessMetadataValue(ScriptMetadata metadata, string key, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return;
            }

            switch (key)
            {
                case "author":
                    metadata.Author = value;
                    break;
                case "website":
                    metadata.Website = value;
                    break;
                case "lastrun":
                    metadata.LastRun = value;
                    break;
                case "documenttype":
                case "document_type":
                    if (value.Equals("ConceptualMass", StringComparison.OrdinalIgnoreCase))
                    {
                        metadata.DocumentType = "ConceptualMass";
                    }
                    else if (value.Equals("Project", StringComparison.OrdinalIgnoreCase))
                    {
                        metadata.DocumentType = "Project";
                    }
                    else if (value.Equals("Family", StringComparison.OrdinalIgnoreCase))
                    {
                        metadata.DocumentType = "Family";
                    }
                    else
                    {
                        metadata.DocumentType = "Any";
                    }
                    break;
                case "categories":
                    metadata.Categories.AddRange(value.Split(',').Select(c => c.Trim()).Where(c => !string.IsNullOrEmpty(c)));
                    break;
                case "dependencies":
                    metadata.Dependencies.AddRange(value.Split(',').Select(d => d.Trim()).Where(d => !string.IsNullOrEmpty(d)));
                    break;
                case "description":
                    metadata.Description = value;
                    break;
                case "usageexamples":
                case "usage_examples":
                    var exampleLines = value.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var exampleLine in exampleLines)
                    {
                        var trimmedLine = exampleLine.Trim();
                        if (trimmedLine.StartsWith("-"))
                        {
                            metadata.UsageExamples.Add(trimmedLine.Substring(1).Trim());
                        }
                        else if (!string.IsNullOrWhiteSpace(trimmedLine))
                        {
                            metadata.UsageExamples.Add(trimmedLine);
                        }
                    }
                    break;
            }
        }

        private static string GetTextFromTag(DocumentationCommentTriviaSyntax xmlTrivia, string tagName)
        {
            var element = xmlTrivia.Content.OfType<XmlElementSyntax>().FirstOrDefault(e => e.StartTag.Name.ToString().Equals(tagName, StringComparison.OrdinalIgnoreCase));
            return GetElementContent(element);
        }

        private static string GetElementContent(XmlElementSyntax element)
        {
            return element == null ? "" : string.Concat(element.Content.Select(node => node.ToString())).Trim();
        }
    }
}
