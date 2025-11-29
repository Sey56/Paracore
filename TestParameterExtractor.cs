using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

public class Program
{
    public static void Main()
    {
        string code = @"
using System;
using System.Collections.Generic;

// [Parameter(Options: ""RoomBoundaries, Grid, Coordinates, Perimeter"")]
string creationMode = ""RoomBoundaries"";

// [Parameter(Options: ""Option A, Option B, Option C"", MultiSelect: true)]
List<string> testMultiSelect = new() { ""Option A"" };

// [Parameter(VisibleWhen: ""creationMode == 'Grid'"")]
double gridSpacing = 3.0;

// [Parameter]
string simpleParam = ""Simple"";
";

        ExtractParameters(code);
    }

    public static void ExtractParameters(string scriptContent)
    {
        SyntaxTree tree = CSharpSyntaxTree.ParseText(scriptContent);
        var root = tree.GetRoot() as CompilationUnitSyntax;

        var potentialParameters = root.Members
            .OfType<GlobalStatementSyntax>()
            .Select(gs => gs.Statement)
            .OfType<LocalDeclarationStatementSyntax>();

        foreach (var declaration in potentialParameters)
        {
            var triviaList = declaration.GetLeadingTrivia();
            var parameterComment = triviaList
                .FirstOrDefault(trivia => 
                {
                    string text = trivia.ToString();
                    bool isComment = trivia.IsKind(SyntaxKind.SingleLineCommentTrivia);
                    bool hasTag = text.Contains("[Parameter");
                    return isComment && hasTag;
                });
            
            bool hasComment = parameterComment.ToString() != null && !string.IsNullOrEmpty(parameterComment.ToString());

            if (!hasComment) 
            {
                continue;
            }

            Console.WriteLine($"Found parameter comment: {parameterComment}");
            string commentText = parameterComment.ToString();
            
            List<string> options = new List<string>();
            bool multiSelect = false;

            // Check for MultiSelect
            if (commentText.Contains("MultiSelect") && 
                (commentText.Contains("MultiSelect: true") || commentText.Contains("MultiSelect:true") || 
                 !commentText.Contains("MultiSelect: false")))
            {
                multiSelect = true;
            }

            int optionsIndex = commentText.IndexOf("Options:");
            if (optionsIndex >= 0)
            {
                string optionsString = commentText.Substring(optionsIndex + "Options:".Length).Trim();
                
                if (optionsString.StartsWith("\""))
                {
                    int endQuote = optionsString.IndexOf("\"", 1);
                    if (endQuote > 0)
                    {
                        optionsString = optionsString.Substring(1, endQuote - 1);
                    }
                }
                else
                {
                    int endIndex = optionsString.IndexOfAny(new[] { '\r', '\n', ',' });
                    if (endIndex > 0)
                    {
                         string remainder = optionsString.Substring(endIndex);
                         if (remainder.Contains("MultiSelect") || remainder.Contains("VisibleWhen"))
                         {
                             optionsString = optionsString.Substring(0, endIndex);
                         }
                    }
                }
                
                options = optionsString.Split(',').Select(o => o.Trim()).Where(o => !string.IsNullOrEmpty(o)).ToList();
            }

            string visibleWhen = "";
            int visibleWhenIndex = commentText.IndexOf("VisibleWhen:");
            if (visibleWhenIndex >= 0)
            {
                string visibleWhenString = commentText.Substring(visibleWhenIndex + "VisibleWhen:".Length).Trim();
                if (visibleWhenString.StartsWith("\""))
                {
                    int endQuote = visibleWhenString.IndexOf("\"", 1);
                    if (endQuote > 0)
                    {
                        visibleWhen = visibleWhenString.Substring(1, endQuote - 1);
                    }
                }
            }

            Console.WriteLine($"  Extracted Options: {string.Join(", ", options)}");
            Console.WriteLine($"  MultiSelect: {multiSelect}");
            Console.WriteLine($"  VisibleWhen: {visibleWhen}");
            
            foreach (var declarator in declaration.Declaration.Variables)
            {
                 Console.WriteLine($"  Variable: {declarator.Identifier.Text}");
            }
            Console.WriteLine("---");
        }
    }
}
