using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

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
                
                // 1. Scan Top-Level Statements (Default/Backward Compatibility)
                ExtractFromTopLevelStatements(root, parameters);
                
                // 2. Scan Classes (The "Pro" Pattern)
                ExtractFromClasses(root, parameters);

                _logger.Log($"[ParameterExtractor] Extracted {parameters.Count} parameters.", LogLevel.Debug);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ParameterExtractor] Error extracting parameters: {ex.Message}");
            }
            return parameters;
        }

        private void ExtractFromTopLevelStatements(CompilationUnitSyntax root, List<ScriptParameter> parameters)
        {
            var potentialParameters = root.Members
                .OfType<GlobalStatementSyntax>()
                .Select(gs => gs.Statement)
                .OfType<LocalDeclarationStatementSyntax>();

            foreach (var declaration in potentialParameters)
            {
                var attributes = declaration.AttributeLists.SelectMany(al => al.Attributes);
                var triviaList = declaration.GetLeadingTrivia();
                
                ProcessVariableDeclaration(declaration.Declaration, attributes, triviaList, parameters);
            }
        }

        private void ExtractFromClasses(CompilationUnitSyntax root, List<ScriptParameter> parameters)
        {
            var classes = root.Members.OfType<ClassDeclarationSyntax>();
            foreach (var @class in classes)
            {
                // Scan Fields
                var fields = @class.Members.OfType<FieldDeclarationSyntax>();
                foreach (var field in fields)
                {
                    var attributes = field.AttributeLists.SelectMany(al => al.Attributes);
                    var triviaList = field.GetLeadingTrivia();
                    ProcessVariableDeclaration(field.Declaration, attributes, triviaList, parameters);
                }

                // Scan Properties
                var properties = @class.Members.OfType<PropertyDeclarationSyntax>();
                foreach (var prop in properties)
                {
                    var attributes = prop.AttributeLists.SelectMany(al => al.Attributes);
                    var triviaList = prop.GetLeadingTrivia();
                    ProcessPropertyDeclaration(prop, attributes, triviaList, parameters);
                }
            }
        }

        private void ProcessVariableDeclaration(VariableDeclarationSyntax declaration, IEnumerable<AttributeSyntax> attributes, SyntaxTriviaList triviaList, List<ScriptParameter> parameters)
        {
            var parameterAttribute = attributes.FirstOrDefault(a => a.Name.ToString().Contains("ScriptParameter") || a.Name.ToString().Contains("Parameter"));
            var revitElementsAttribute = attributes.FirstOrDefault(a => a.Name.ToString().Contains("RevitElements"));
            
            var parameterComment = triviaList.FirstOrDefault(t => t.IsKind(SyntaxKind.SingleLineCommentTrivia) && Regex.IsMatch(t.ToString(), @"^\s*//\s*\[(Parameter|ScriptParameter)"));
            var revitElementsComment = triviaList.FirstOrDefault(t => t.IsKind(SyntaxKind.SingleLineCommentTrivia) && Regex.IsMatch(t.ToString(), @"^\s*//\s*\[RevitElements"));

            if (parameterAttribute == null && revitElementsAttribute == null && 
                string.IsNullOrEmpty(parameterComment.ToString()) && string.IsNullOrEmpty(revitElementsComment.ToString())) return;

            var declarator = declaration.Variables.FirstOrDefault();
            if (declarator == null || declarator.Initializer == null) return;

            var param = ParseParameter(declarator.Identifier.Text, declaration.Type.ToString(), declarator.Initializer.Value, 
                                     parameterAttribute, revitElementsAttribute, parameterComment, revitElementsComment);
            
            if (param != null) parameters.Add(param);
        }

        private void ProcessPropertyDeclaration(PropertyDeclarationSyntax prop, IEnumerable<AttributeSyntax> attributes, SyntaxTriviaList triviaList, List<ScriptParameter> parameters)
        {
            var parameterAttribute = attributes.FirstOrDefault(a => a.Name.ToString().Contains("ScriptParameter") || a.Name.ToString().Contains("Parameter"));
            var revitElementsAttribute = attributes.FirstOrDefault(a => a.Name.ToString().Contains("RevitElements"));
            
            var parameterComment = triviaList.FirstOrDefault(t => t.IsKind(SyntaxKind.SingleLineCommentTrivia) && Regex.IsMatch(t.ToString(), @"^\s*//\s*\[(Parameter|ScriptParameter)"));
            var revitElementsComment = triviaList.FirstOrDefault(t => t.IsKind(SyntaxKind.SingleLineCommentTrivia) && Regex.IsMatch(t.ToString(), @"^\s*//\s*\[RevitElements"));

            if (parameterAttribute == null && revitElementsAttribute == null && 
                string.IsNullOrEmpty(parameterComment.ToString()) && string.IsNullOrEmpty(revitElementsComment.ToString())) return;

            if (prop.Initializer == null) return;

            var param = ParseParameter(prop.Identifier.Text, prop.Type.ToString(), prop.Initializer.Value, 
                                     parameterAttribute, revitElementsAttribute, parameterComment, revitElementsComment);
            
            if (param != null) parameters.Add(param);
        }

        private ScriptParameter ParseParameter(string name, string csharpType, ExpressionSyntax initializer, 
                                              AttributeSyntax parameterAttr, AttributeSyntax revitAttr,
                                              SyntaxTrivia parameterComment, SyntaxTrivia revitComment)
        {
            var options = new List<string>();
            bool multiSelect = false;
            string description = "";
            string visibleWhen = "";
            double? min = null;
            double? max = null;
            double? step = null;
            bool isRevitElement = false;
            string revitElementType = "";
            string revitElementCategory = "";
            string group = "";

            if (parameterAttr != null && parameterAttr.ArgumentList != null)
            {
                foreach (var arg in parameterAttr.ArgumentList.Arguments)
                {
                    string argName = arg.NameEquals?.Name.Identifier.Text ?? arg.NameColon?.Name.Identifier.Text ?? "";
                    if (argName == "Options") {
                        if (arg.Expression is ImplicitArrayCreationExpressionSyntax imp) options = imp.Initializer.Expressions.OfType<LiteralExpressionSyntax>().Select(l => l.Token.ValueText).ToList();
                        else if (arg.Expression is ArrayCreationExpressionSyntax exp) options = exp.Initializer.Expressions.OfType<LiteralExpressionSyntax>().Select(l => l.Token.ValueText).ToList();
                        else if (arg.Expression is LiteralExpressionSyntax lit) options = lit.Token.ValueText.Split(',').Select(o => o.Trim()).Where(o => !string.IsNullOrEmpty(o)).ToList();
                    }
                    else if (argName == "MultiSelect" && arg.Expression is LiteralExpressionSyntax b) multiSelect = (bool)b.Token.Value;
                    else if (argName == "Description" && arg.Expression is LiteralExpressionSyntax desc) description = desc.Token.ValueText;
                    else if (argName == "VisibleWhen" && arg.Expression is LiteralExpressionSyntax v) visibleWhen = v.Token.ValueText;
                    else if (argName == "Min") { if (arg.Expression is LiteralExpressionSyntax l && l.Token.Value is double dMin) min = dMin; else if (arg.Expression is LiteralExpressionSyntax i && i.Token.Value is int m) min = (double)m; }
                    else if (argName == "Max") { if (arg.Expression is LiteralExpressionSyntax l && l.Token.Value is double dMax) max = dMax; else if (arg.Expression is LiteralExpressionSyntax i && i.Token.Value is int m) max = (double)m; }
                    else if (argName == "Step") { if (arg.Expression is LiteralExpressionSyntax l && l.Token.Value is double dStep) step = dStep; else if (arg.Expression is LiteralExpressionSyntax i && i.Token.Value is int m) step = (double)m; }
                    else if (argName == "Group" && arg.Expression is LiteralExpressionSyntax g) group = g.Token.ValueText;
                }
            }

            if (revitAttr != null)
            {
                isRevitElement = true;
                if (revitAttr.ArgumentList != null)
                {
                    foreach (var arg in revitAttr.ArgumentList.Arguments)
                    {
                        string argName = arg.NameEquals?.Name.Identifier.Text ?? arg.NameColon?.Name.Identifier.Text ?? "";
                        if (argName == "Type" && arg.Expression is LiteralExpressionSyntax l) revitElementType = l.Token.ValueText;
                        else if (argName == "Category" && arg.Expression is LiteralExpressionSyntax c) revitElementCategory = c.Token.ValueText;
                        else if (argName == "Group" && arg.Expression is LiteralExpressionSyntax g) group = g.Token.ValueText;
                    }
                }
            }

            if (!string.IsNullOrEmpty(parameterComment.ToString()))
            {
                var meta = ParseCommentMetadata(parameterComment.ToString());
                if (meta.TryGetValue("MultiSelect", out string ms)) multiSelect = ms.ToLower() == "true";
                if (meta.TryGetValue("Description", out string ds)) description = ds;
                if (meta.TryGetValue("VisibleWhen", out string vw)) visibleWhen = vw;
                if (meta.TryGetValue("Min", out string mi) && double.TryParse(mi, out double mid)) min = mid;
                if (meta.TryGetValue("Max", out string ma) && double.TryParse(ma, out double mad)) max = mad;
                if (meta.TryGetValue("Step", out string st) && double.TryParse(st, out double std)) step = std;
                if (meta.TryGetValue("Options", out string op)) options = op.Split(',').Select(o => o.Trim()).Where(o => !string.IsNullOrEmpty(o)).ToList();
                if (meta.TryGetValue("Group", out string gr)) group = gr;
            }

            if (!string.IsNullOrEmpty(revitComment.ToString()))
            {
                isRevitElement = true;
                var meta = ParseCommentMetadata(revitComment.ToString());
                if (meta.TryGetValue("Type", out string ty)) revitElementType = ty;
                if (meta.TryGetValue("Category", out string ca)) revitElementCategory = ca;
                if (meta.TryGetValue("Group", out string gr)) group = gr;
            }

            string defaultValueJson = "";
            string type = "string";
            string numericType = null;

            if (initializer is LiteralExpressionSyntax literal)
            {
                switch (literal.Token.Value)
                {
                    case string s: type = "string"; defaultValueJson = JsonSerializer.Serialize(s); break;
                    case bool b: type = "boolean"; defaultValueJson = JsonSerializer.Serialize(b); break;
                    case int i: type = "number"; numericType = "int"; defaultValueJson = JsonSerializer.Serialize(i); break;
                    case double d: type = "number"; numericType = "double"; defaultValueJson = JsonSerializer.Serialize(d); break;
                }
            }
            else if (initializer is CollectionExpressionSyntax col)
            {
                var values = col.Elements.OfType<ExpressionElementSyntax>().Select(e => e.Expression).OfType<LiteralExpressionSyntax>().Select(l => l.Token.ValueText).ToList();
                defaultValueJson = JsonSerializer.Serialize(values);
                multiSelect = true;
            }
            else if (initializer is ImplicitObjectCreationExpressionSyntax imp && imp.Initializer != null)
            {
                var values = imp.Initializer.Expressions.OfType<LiteralExpressionSyntax>().Select(l => l.Token.ValueText).ToList();
                defaultValueJson = JsonSerializer.Serialize(values);
                multiSelect = true;
            }
            else if (initializer is ObjectCreationExpressionSyntax obj && obj.Initializer != null)
            {
                var values = obj.Initializer.Expressions.OfType<LiteralExpressionSyntax>().Select(l => l.Token.ValueText).ToList();
                defaultValueJson = JsonSerializer.Serialize(values);
                multiSelect = true;
            }

            if (numericType == null && type == "number")
            {
                if (csharpType == "int") numericType = "int";
                else if (csharpType == "double") numericType = "double";
            }

            bool requiresCompute = isRevitElement && options.Count == 0;

            return new ScriptParameter
            {
                Name = name,
                Type = type,
                DefaultValueJson = defaultValueJson,
                Description = description,
                Options = options,
                MultiSelect = multiSelect,
                VisibleWhen = visibleWhen,
                NumericType = numericType,
                Min = min,
                Max = max,
                Step = step,
                IsRevitElement = isRevitElement,
                RevitElementType = revitElementType,
                RevitElementCategory = revitElementCategory,
                RequiresCompute = requiresCompute,
                Group = group
            };
        }

        private Dictionary<string, string> ParseCommentMetadata(string comment)
        {
            var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            
            // Regex to find content inside [Attribute(...)]
            var bracketMatch = Regex.Match(comment, @"\[\w+\((.*)\)\]");
            string content = bracketMatch.Success ? bracketMatch.Groups[1].Value : comment;
            
            // Regex for Key: Value or Key = Value pairs
            // Support optional quotes around the value
            // Also supports standalone flags like "MultiSelect"
            var kvRegex = new Regex(@"(\w+)(?:\s*[:=]\s*(?:""([^""]*)""|([^,)\s]+)))?", RegexOptions.IgnoreCase);
            var matches = kvRegex.Matches(content);
            
            foreach (Match match in matches)
            {
                string key = match.Groups[1].Value;
                string value = match.Groups[2].Success ? match.Groups[2].Value : 
                               match.Groups[3].Success ? match.Groups[3].Value : "true"; // Default to "true" for standalone flags
                metadata[key] = value;
            }
            
            return metadata;
        }
    }
}
