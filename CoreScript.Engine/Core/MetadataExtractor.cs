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

            // Find all multiline comments
            var multilineComments = root.DescendantTrivia()
                .Where(trivia => trivia.Kind() == SyntaxKind.MultiLineCommentTrivia ||
                                 trivia.Kind() == SyntaxKind.MultiLineDocumentationCommentTrivia)
                .Select(trivia => trivia.ToString())
                .ToList();

            foreach (var commentText in multilineComments)
            {
                // Remove comment delimiters /* */ and trim whitespace
                var content = commentText.Length > 4 ? commentText.Substring(2, commentText.Length - 4) : string.Empty;
                var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None)
                    .Select(line => line.Trim().TrimStart('*').Trim());
                var cleanComment = string.Join("\n", lines);

                // Regex patterns for metadata fields
                var categoriesMatch = Regex.Match(cleanComment, @"^Categories:\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (categoriesMatch.Success)
                {
                    metadata.Categories.AddRange(categoriesMatch.Groups[1].Value.Split(',').Select(c => c.Trim()).Where(c => !string.IsNullOrEmpty(c)));
                }

                var authorMatch = Regex.Match(cleanComment, @"^Author:\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (authorMatch.Success)
                {
                    metadata.Author = authorMatch.Groups[1].Value.Trim();
                }

                var versionMatch = Regex.Match(cleanComment, @"^Version:\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (versionMatch.Success)
                {
                    metadata.Version = versionMatch.Groups[1].Value.Trim();
                }

                var lastRunMatch = Regex.Match(cleanComment, @"^LastRun:\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (lastRunMatch.Success)
                {
                    // Assuming LastRun can be parsed directly as a string for now
                    metadata.LastRun = lastRunMatch.Groups[1].Value.Trim();
                }

                var isDefaultMatch = Regex.Match(cleanComment, @"^IsDefault:\s*(true|false)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (isDefaultMatch.Success)
                {
                    metadata.IsDefault = bool.Parse(isDefaultMatch.Groups[1].Value);
                }

                var dependenciesMatch = Regex.Match(cleanComment, @"^Dependencies:\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (dependenciesMatch.Success)
                {
                    metadata.Dependencies.AddRange(dependenciesMatch.Groups[1].Value.Split(',').Select(d => d.Trim()).Where(d => !string.IsNullOrEmpty(d)));
                }

                var documentTypeMatch = Regex.Match(cleanComment, @"^DocumentType:\s*(.*)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (documentTypeMatch.Success)
                {
                    var docType = documentTypeMatch.Groups[1].Value.Trim();
                    if (docType.Equals("ConceptualMass", StringComparison.OrdinalIgnoreCase) ||
                        docType.Equals("Project", StringComparison.OrdinalIgnoreCase) ||
                        docType.Equals("Family", StringComparison.OrdinalIgnoreCase))
                    {
                        metadata.DocumentType = docType;
                    }
                }

                // Description and History require special handling for multiline content
                var descriptionMatch = Regex.Match(cleanComment, @"^Description:\s*\n([\s\S]*?)(?=\n\n|^History:|^Categories:|^Author:|^Version:|^LastRun:|^IsDefault:|^Dependencies:|$)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (descriptionMatch.Success)
                {
                    metadata.Description = descriptionMatch.Groups[1].Value.Trim();
                }

                var historyMatch = Regex.Match(cleanComment, @"^History:\s*\n([\s\S]*?)(?=\n\n|^Categories:|^Author:|^Version:|^LastRun:|^IsDefault:|^Dependencies:|^Description:|$)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
                if (historyMatch.Success)
                {
                    // For now, store history as a single string. Further parsing can be added if needed.
                    metadata.History = historyMatch.Groups[1].Value.Trim();
                }

                // The script name is usually the file name, but can be overridden by a 'name' tag
                // We'll keep the existing XML parsing for 'name' as a fallback/override
            }

            _logger.Log($"[MetadataExtractor] Extracted Metadata: Name={metadata.Name}, Description={metadata.Description}, Author={metadata.Author}, Version={metadata.Version}, Categories={string.Join(", ", metadata.Categories)}, LastRun={metadata.LastRun}, IsDefault={metadata.IsDefault}, Dependencies={string.Join(", ", metadata.Dependencies)}, History={metadata.History}, DocumentType={metadata.DocumentType}", LogLevel.Debug);

            // Keep existing XML parsing logic for now, in case some scripts use it.
            // We can remove it later if confirmed not needed.
            var classNode = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classNode != null)
            {
                var xmlTrivia = classNode.GetLeadingTrivia()
                    .Select(i => i.GetStructure())
                    .OfType<DocumentationCommentTriviaSyntax>()
                    .FirstOrDefault();

                if (xmlTrivia != null)
                {
                    // Only override if the XML tag provides a name
                    var nameFromXml = GetTextFromTag(xmlTrivia, "name");
                    if (!string.IsNullOrEmpty(nameFromXml))
                    {
                        metadata.Name = nameFromXml;
                    }
                    // Existing XML parsing for other fields (summary, author, etc.) will be redundant
                    // if the multiline comment parsing is comprehensive. Consider removing these
                    // if multiline comment parsing becomes the primary source.
                    // For now, we'll let the multiline comment parsing take precedence if a field is found there.
                }
            }

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

            // This will concatenate the text from all XmlTextSyntax nodes within the element,
            // handling multiple lines of text content.
            return string.Concat(element.Content.Select(node => node.ToString())).Trim();
        }
    }
}