using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using CoreScript.Engine.Models;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using CoreScript.Engine.Logging;

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
            
            // Set default value
            metadata.DocumentType = "Any";

            SyntaxTree tree = CSharpSyntaxTree.ParseText(scriptContent);
            var root = tree.GetRoot();

            var multilineComments = root.DescendantTrivia()
                .Where(trivia => trivia.Kind() == SyntaxKind.MultiLineCommentTrivia ||
                                 trivia.Kind() == SyntaxKind.MultiLineDocumentationCommentTrivia)
                .Select(trivia => trivia.ToString())
                .ToList();

            foreach (var commentText in multilineComments)
            {
                var content = commentText.Length > 4 ? commentText.Substring(2, commentText.Length - 4) : string.Empty;
                var lines = content.Split(new[] { "\r\n", "\r", "\n" }, System.StringSplitOptions.None)
                    .Select(line => line.Trim().TrimStart('*').Trim());
                var cleanComment = string.Join("\n", lines);

                // General pattern for simple key-value pairs
                var simplePattern = new Regex(@"^([a-zA-Z_]+):\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                foreach (Match match in simplePattern.Matches(cleanComment))
                {
                    var key = match.Groups[1].Value.Trim();
                    var value = match.Groups[2].Value.Trim();

                    if (string.IsNullOrEmpty(value)) continue;

                    switch (key.ToLower())
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
                            if (value.Equals("ConceptualMass", System.StringComparison.OrdinalIgnoreCase) ||
                                value.Equals("Project", System.StringComparison.OrdinalIgnoreCase) ||
                                value.Equals("Family", System.StringComparison.OrdinalIgnoreCase))
                            {
                                metadata.DocumentType = value;
                            }
                            break;
                        case "categories":
                            metadata.Categories.AddRange(value.Split(',').Select(c => c.Trim()).Where(c => !string.IsNullOrEmpty(c)));
                            break;
                        case "dependencies":
                            metadata.Dependencies.AddRange(value.Split(',').Select(d => d.Trim()).Where(d => !string.IsNullOrEmpty(d)));
                            break;
                    }
                }

                // Special handling for potentially multi-line fields
                var multiLinePattern = new Regex(@"^(Description|UsageExamples):\s*([\s\S]*?)(?=\n[a-zA-Z_]+:|$)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                foreach (Match match in multiLinePattern.Matches(cleanComment))
                {
                    var key = match.Groups[1].Value.Trim();
                    var value = match.Groups[2].Value.Trim();

                    if (string.IsNullOrEmpty(value)) continue;

                    if (key.Equals("Description", System.StringComparison.OrdinalIgnoreCase))
                    {
                        metadata.Description = value;
                    }
                    else if (key.Equals("UsageExamples", System.StringComparison.OrdinalIgnoreCase))
                    {
                        metadata.UsageExamples = value;
                    }
                }
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

        private static string GetTextFromTag(DocumentationCommentTriviaSyntax xmlTrivia, string tagName)
        {
            var element = xmlTrivia.Content.OfType<XmlElementSyntax>().FirstOrDefault(e => e.StartTag.Name.ToString().Equals(tagName, System.StringComparison.OrdinalIgnoreCase));
            return GetElementContent(element);
        }

        private static string GetElementContent(XmlElementSyntax element)
        {
            if (element == null) return "";
            return string.Concat(element.Content.Select(node => node.ToString())).Trim();
        }
    }
}