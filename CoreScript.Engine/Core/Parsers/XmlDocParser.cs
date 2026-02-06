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
            var xml = string.Join("\n", trivia.Select(t => t.ToFullString().Trim()).Where(s => s.StartsWith("///")));
            var match = Regex.Match(xml, @"<summary>(.*?)</summary>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return string.Join(" ", match.Groups[1].Value.Split('\n').Select(l => l.Trim('/', ' ')).Where(l => !string.IsNullOrWhiteSpace(l)));
            }
            return "";
        }
    }
}
