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
                    // 1. Check for [Parameter] attribute
                    var attributes = declaration.AttributeLists.SelectMany(al => al.Attributes);
                    var parameterAttribute = attributes.FirstOrDefault(a => a.Name.ToString().Contains("Parameter"));
                    
                    bool hasAttribute = parameterAttribute != null;
                    
                    // 2. Check for comment-based [Parameter] (Backward Compatibility)
                    var triviaList = declaration.GetLeadingTrivia();
                    var parameterComment = triviaList
                        .FirstOrDefault(trivia => trivia.IsKind(SyntaxKind.SingleLineCommentTrivia) &&
                                       trivia.ToString().Contains("[Parameter"));
                    bool hasComment = parameterComment.ToString() != null && !string.IsNullOrEmpty(parameterComment.ToString());

                    if (!hasAttribute && !hasComment) continue;

                    var options = new List<string>();
                    bool multiSelect = false;
                    string description = "";
                    string visibleWhen = "";

                    if (hasAttribute)
                    {
                        if (parameterAttribute.ArgumentList != null)
                        {
                            foreach (var arg in parameterAttribute.ArgumentList.Arguments)
                            {
                                string argName = arg.NameEquals?.Name.Identifier.Text ?? "";
                                if (argName == "Options" && arg.Expression is ImplicitArrayCreationExpressionSyntax arrayCreation)
                                {
                                    options = arrayCreation.Initializer.Expressions
                                        .OfType<LiteralExpressionSyntax>()
                                        .Select(l => l.Token.ValueText)
                                        .ToList();
                                }
                                else if (argName == "Options" && arg.Expression is ArrayCreationExpressionSyntax explicitArrayCreation)
                                {
                                    options = explicitArrayCreation.Initializer.Expressions
                                        .OfType<LiteralExpressionSyntax>()
                                        .Select(l => l.Token.ValueText)
                                        .ToList();
                                }
                                else if (argName == "MultiSelect" && arg.Expression is LiteralExpressionSyntax boolLiteral)
                                {
                                    multiSelect = (bool)boolLiteral.Token.Value;
                                }
                                else if (argName == "Description" && arg.Expression is LiteralExpressionSyntax descLiteral)
                                {
                                    description = descLiteral.Token.ValueText;
                                }
                                else if (argName == "VisibleWhen" && arg.Expression is LiteralExpressionSyntax visibleWhenLiteral)
                                {
                                    visibleWhen = visibleWhenLiteral.Token.ValueText;
                                }
                            }
                        }
                    }
                    else if (hasComment)
                    {
                        string commentText = parameterComment.ToString();
                        
                        // Parse new format: // [Parameter(Options: "A, B, C", MultiSelect: true, VisibleWhen: "creationMode == 'Grid'")]
                        // Also support old format: // [Parameter] Options: A, B, C MultiSelect
                        
                        // Check for MultiSelect
                        if (commentText.Contains("MultiSelect") && 
                            (commentText.Contains("MultiSelect: true") || commentText.Contains("MultiSelect:true") || 
                             !commentText.Contains("MultiSelect: false")))
                        {
                            multiSelect = true;
                        }
                        
                        // Parse VisibleWhen
                        int visibleWhenIndex = commentText.IndexOf("VisibleWhen:");
                        if (visibleWhenIndex >= 0)
                        {
                            string temp = commentText.Substring(visibleWhenIndex + "VisibleWhen:".Length);
                            int startQuote = temp.IndexOf('"');
                            if (startQuote >= 0)
                            {
                                int endQuote = temp.IndexOf('"', startQuote + 1);
                                if (endQuote > startQuote)
                                {
                                    visibleWhen = temp.Substring(startQuote + 1, endQuote - startQuote - 1);
                                }
                            }
                        }

                        // Parse Options - support both formats
                        // New: Options: "A, B, C"
                        // Old: Options: A, B, C
                        int optionsIndex = commentText.IndexOf("Options:");
                        if (optionsIndex >= 0)
                        {
                            string optionsString = commentText.Substring(optionsIndex + "Options:".Length).Trim();
                            
                            // Check if options are in quotes
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
                                // Old format - read until end of line or comma before MultiSelect or VisibleWhen
                                int endIndex = optionsString.IndexOfAny(new[] { '\r', '\n', ',' });
                                
                                // Check if comma is followed by known keys
                                if (endIndex > 0)
                                {
                                     string remainder = optionsString.Substring(endIndex);
                                     if (remainder.Contains("MultiSelect") || remainder.Contains("VisibleWhen"))
                                     {
                                         optionsString = optionsString.Substring(0, endIndex);
                                     }
                                }
                            }
                            
                            options = optionsString.Split(',')
                                .Select(o => o.Trim())
                                .Where(o => !string.IsNullOrEmpty(o))
                                .ToList();
                        }
                    }

                    foreach (var declarator in declaration.Declaration.Variables)
                    {
                        if (declarator.Initializer == null) continue;

                        string name = declarator.Identifier.Text;
                        string defaultValueJson = "";
                        string type = "string";

                        var initializerExpression = declarator.Initializer.Value;

                        // Handle List<string>
                        if (initializerExpression is ImplicitObjectCreationExpressionSyntax implicitObjCreation && 
                            implicitObjCreation.Initializer != null)
                        {
                             // Assuming List<string> for now if it has collection initializer
                             type = "string"; // We treat List<string> as string type in proto for now, but with MultiSelect=true? 
                             // Wait, proto has 'repeated string options'. But the VALUE type?
                             // If MultiSelect is true, the frontend sends a JSON array string.
                             // So type should be "string" (containing JSON) or we add a new type "list".
                             // Existing logic uses "string" and parses JSON in CodeRunner.
                             
                             var values = implicitObjCreation.Initializer.Expressions
                                .OfType<LiteralExpressionSyntax>()
                                .Select(l => l.Token.ValueText)
                                .ToList();
                             defaultValueJson = JsonSerializer.Serialize(values);
                             if (!hasAttribute) multiSelect = true; // Auto-detect multiselect for lists? Maybe not.
                        }
                        else if (initializerExpression is ObjectCreationExpressionSyntax objCreation && 
                                 objCreation.Type.ToString().Contains("List") && 
                                 objCreation.Initializer != null)
                        {
                             var values = objCreation.Initializer.Expressions
                                .OfType<LiteralExpressionSyntax>()
                                .Select(l => l.Token.ValueText)
                                .ToList();
                             defaultValueJson = JsonSerializer.Serialize(values);
                        }
                        else if (initializerExpression is LiteralExpressionSyntax literal)
                        {
                            switch (literal.Token.Value)
                            {
                                case string s: type = "string"; defaultValueJson = JsonSerializer.Serialize(s); break;
                                case bool b: type = "boolean"; defaultValueJson = JsonSerializer.Serialize(b); break;
                                case int i: type = "number"; defaultValueJson = JsonSerializer.Serialize(i); break;
                                case double d: type = "number"; defaultValueJson = JsonSerializer.Serialize(d); break;
                            }
                        }

                        parameters.Add(new ScriptParameter
                        {
                            Name = name,
                            Type = type,
                            DefaultValueJson = defaultValueJson,
                            Description = description,
                            Options = options,
                            MultiSelect = multiSelect,
                            VisibleWhen = visibleWhen
                        });
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
