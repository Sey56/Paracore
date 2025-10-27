using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class ParameterExtractor : IParameterExtractor
    {
        private readonly ILogger _logger;

        public ParameterExtractor(ILogger logger)
        {
            _logger = logger;
        }

        public List<ScriptParameter> ExtractParameters(string scriptContent)
        {
            var parameters = new List<ScriptParameter>();
            try
            {
                SyntaxTree tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot() as CompilationUnitSyntax;
                if (root == null) return parameters;

                var potentialParameters = root.Members
                    .OfType<GlobalStatementSyntax>()
                    .Select(gs => gs.Statement)
                    .OfType<LocalDeclarationStatementSyntax>();

                foreach (var declaration in potentialParameters)
                {
                    // Check for a comment containing [Parameter] immediately above the declaration
                    var triviaList = declaration.GetLeadingTrivia();
                    bool isParameter = triviaList
                        .Any(trivia => trivia.IsKind(SyntaxKind.SingleLineCommentTrivia) &&
                                       trivia.ToString().Contains("[Parameter]"));

                    if (!isParameter)
                    {
                        continue; // Skip if it doesn't have the correct comment
                    }

                    foreach (var declarator in declaration.Declaration.Variables)
                    {
                        if (declarator.Initializer == null) continue;

                        string name = declarator.Identifier.Text;
                        string defaultValueJson = "";
                        string type = "string"; // Default type

                        var initializerExpression = declarator.Initializer.Value;

                        if (initializerExpression is LiteralExpressionSyntax literal)
                        {
                            switch (literal.Token.Value)
                            {
                                case string s: type = "string"; defaultValueJson = JsonSerializer.Serialize(s); break;
                                case bool b: type = "boolean"; defaultValueJson = JsonSerializer.Serialize(b); break;
                                case int i: type = "number"; defaultValueJson = JsonSerializer.Serialize(i); break;
                                case double d: type = "number"; defaultValueJson = JsonSerializer.Serialize(d); break;
                            }

                            parameters.Add(new ScriptParameter
                            {
                                Name = name,
                                Type = type,
                                DefaultValueJson = defaultValueJson,
                                Description = "", // You can extract description from the comment if needed
                                Options = new List<string>()
                            });
                        }
                    }
                }

                _logger.Log($"[ParameterExtractor] Extracted {parameters.Count} parameters.", LogLevel.Debug);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ParameterExtractor] Error extracting parameters: {ex.Message}");
            }
            return parameters;
        }
    }
}
