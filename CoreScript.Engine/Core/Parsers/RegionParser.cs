using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace CoreScript.Engine.Core.Parsers
{
    public static class RegionParser
    {
        public static Dictionary<int, string> BuildRegionMap(ClassDeclarationSyntax paramsClass)
        {
            var map = new Dictionary<int, string>();
            string current = "";
            foreach (var trivia in paramsClass.DescendantTrivia())
            {
                if (trivia.IsKind(SyntaxKind.RegionDirectiveTrivia))
                {
                    var match = Regex.Match(trivia.ToFullString(), @"#region\s+(.+)");
                    if (match.Success) { current = match.Groups[1].Value.Trim(); map[trivia.GetLocation().GetLineSpan().StartLinePosition.Line] = current; }
                }
                else if (trivia.IsKind(SyntaxKind.EndRegionDirectiveTrivia))
                {
                    current = ""; map[trivia.GetLocation().GetLineSpan().StartLinePosition.Line] = "";
                }
            }
            return map;
        }

        public static string GetRegionForLine(int line, Dictionary<int, string> map)
        {
            return map.Where(kv => kv.Key <= line).OrderByDescending(kv => kv.Key).FirstOrDefault().Value ?? "";
        }
    }
}
