using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System.Linq;
using System.Text.RegularExpressions;

namespace CoreScript.Engine.Core.Parsers
{
    public static class XmlDocParser
    {
        public static string ExtractDescription(SyntaxTriviaList trivia)
        {
            var lines = trivia.Select(t => t.ToFullString().Trim()).Where(s => s.StartsWith("///")).ToList();
            if (!lines.Any()) return "";

            var xml = string.Join("\n", lines);
            var match = Regex.Match(xml, @"<summary>(.*?)</summary>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return string.Join(" ", match.Groups[1].Value.Split('\n')
                    .Select(l => l.Trim().TrimStart('/').Trim())
                    .Select(l => Regex.Replace(l, @"</?(?:para|summary|remarks)>", "", RegexOptions.IgnoreCase).Trim())
                    .Where(l => !string.IsNullOrWhiteSpace(l))).Trim();
            }

            // Fallback: one-liner /// comments
            return string.Join(" ", lines.Select(l => l.TrimStart('/').Trim()).Where(l => !string.IsNullOrWhiteSpace(l))).Trim();
        }
    }
}
