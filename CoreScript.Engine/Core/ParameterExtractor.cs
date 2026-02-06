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
using System.Reflection;

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
            if (string.IsNullOrWhiteSpace(scriptContent)) return parameters;

            // --- .ptool Support ---
            if (scriptContent.Trim().StartsWith("{") && scriptContent.Trim().EndsWith("}"))
            {
                try
                {
                    using (JsonDocument doc = JsonDocument.Parse(scriptContent))
                    {
                        var rootElement = doc.RootElement;
                        if (rootElement.TryGetProperty("parameters", out var paramsElem))
                        {
                            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                            parameters = JsonSerializer.Deserialize<List<ScriptParameter>>(paramsElem.GetRawText(), options) ?? parameters;
                            return parameters;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"[ParameterExtractor] Failed to parse .ptool JSON: {ex.Message}");
                }
            }

            try
            {
                SyntaxTree tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot() as CompilationUnitSyntax;
                if (root == null) return parameters;
                
                ExtractFromClasses(root, parameters);
                _logger.Log($"[ParameterExtractor] Extracted {parameters.Count} parameters.", LogLevel.Debug);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ParameterExtractor] Error extracting parameters: {ex.Message}");
            }
            return parameters;
        }

        private void ExtractFromClasses(CompilationUnitSyntax root, List<ScriptParameter> parameters)
        {
            var paramsClass = root.DescendantNodes()
                .OfType<ClassDeclarationSyntax>()
                .FirstOrDefault(c => c.Identifier.Text == "Params");
            
            if (paramsClass == null) return;

            // V3: Roslyn-based Region Parsing (No Regex)
            var regionMap = BuildRegionMap(paramsClass);

            var properties = paramsClass.Members.OfType<PropertyDeclarationSyntax>()
                .Where(p => p.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)));

            foreach (var prop in properties)
            {
                string propName = prop.Identifier.Text;
                if (propName.EndsWith("_Options") || propName.EndsWith("_Range") || 
                    propName.EndsWith("_Visible") || propName.EndsWith("_Enabled") ||
                    propName.EndsWith("_Filter") || propName.EndsWith("_Unit")) 
                    continue;

                ProcessPropertyDeclarationV2(prop, paramsClass, parameters, root, regionMap);
            }
        }


        private void ProcessPropertyDeclarationV2(PropertyDeclarationSyntax prop, ClassDeclarationSyntax paramsClass, List<ScriptParameter> parameters, CompilationUnitSyntax root, Dictionary<int, string> regionMap)
        {
            string name = prop.Identifier.Text;

            bool isReadOnly = false;
            if (prop.ExpressionBody != null) isReadOnly = true;
            else if (prop.AccessorList != null)
            {
               bool hasSetter = prop.AccessorList.Accessors.Any(a => 
                   a.IsKind(SyntaxKind.SetAccessorDeclaration) || 
                   a.IsKind(SyntaxKind.InitAccessorDeclaration));
               if (!hasSetter) isReadOnly = true;
            }
            if (isReadOnly) return;

            var attributes = prop.AttributeLists.SelectMany(al => al.Attributes);
            var triviaList = prop.GetLeadingTrivia();

            var param = ParseParameter(name, prop.Type.ToString(), prop.Initializer?.Value, 
                                     attributes, triviaList, root);

            if (param == null) return;

            if (string.IsNullOrEmpty(param.Group))
            {
                int propLine = prop.GetLocation().GetLineSpan().StartLinePosition.Line;
                param.Group = GetRegionForLine(propLine, regionMap);
            }

            var members = paramsClass.Members;
            
            var optionsProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Options" || GetMemberName(m) == $"{name}_Filter");
            if (optionsProvider != null)
            {
                var expr = GetInitialExpression(optionsProvider);
                if (expr != null) param.Options = ExtractOptions(expr, root);
                if (IsLogicBasedProvider(optionsProvider) && (param.Options == null || param.Options.Count == 0))
                {
                    param.RequiresCompute = true;
                }
            }

            var rangeProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Range");
            if (rangeProvider != null)
            {
                var expr = GetInitialExpression(rangeProvider);
                if (expr != null)
                {
                    var range = ExtractRange(expr);
                    if (range.Min.HasValue) param.Min = range.Min;
                    if (range.Max.HasValue) param.Max = range.Max;
                    if (range.Step.HasValue) param.Step = range.Step;
                }
                if (IsLogicBasedProvider(rangeProvider))
                {
                    param.RequiresCompute = true;
                }
            }

            var visibleProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Visible");
            if (visibleProvider != null)
            {
                var expr = GetInitialExpression(visibleProvider);
                if (expr != null) param.VisibleWhen = ParseVisibilityExpression(expr);
            }

            var enabledProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Enabled");
            if (enabledProvider != null)
            {
                var expr = GetInitialExpression(enabledProvider);
                if (expr != null) param.EnabledWhenParam = ParseVisibilityExpression(expr);
            }

            string unit = null;
            var unitAttr = attributes.FirstOrDefault(a => a.Name.ToString().Contains("Unit"));
            if (unitAttr != null && unitAttr.ArgumentList != null && unitAttr.ArgumentList.Arguments.Count > 0)
            {
                 var arg = unitAttr.ArgumentList.Arguments[0];
                 if (arg.Expression is LiteralExpressionSyntax lit && lit.IsKind(SyntaxKind.StringLiteralExpression))
                 {
                     unit = lit.Token.ValueText;
                 }
            }

            if (string.IsNullOrEmpty(unit))
            {
                var unitProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Unit");
                if (unitProvider != null)
                {
                   var expr = GetInitialExpression(unitProvider);
                   if (expr != null && expr is LiteralExpressionSyntax lit && lit.IsKind(SyntaxKind.StringLiteralExpression))
                   {
                       unit = lit.Token.ValueText;
                   }
                }
            }

            if (string.IsNullOrEmpty(unit))
            {
                if (name.EndsWith("_mm")) unit = "mm";
                else if (name.EndsWith("_cm")) unit = "cm";
                else if (name.EndsWith("_m")) unit = "m";
                else if (name.EndsWith("_ft")) unit = "ft";
                else if (name.EndsWith("_in") || name.EndsWith("_inch")) unit = "in";
            }

            if (!string.IsNullOrEmpty(unit))
            {
                param.Unit = unit;
                param.Suffix = unit;
            }

            parameters.Add(param);
        }

        private string GetMemberName(MemberDeclarationSyntax member)
        {
            if (member is PropertyDeclarationSyntax p) return p.Identifier.Text;
            if (member is FieldDeclarationSyntax f) return f.Declaration.Variables.FirstOrDefault()?.Identifier.Text;
            if (member is MethodDeclarationSyntax m) return m.Identifier.Text;
            return null;
        }

        private ExpressionSyntax GetInitialExpression(MemberDeclarationSyntax member)
        {
            if (member is PropertyDeclarationSyntax p) 
            {
                if (p.Initializer != null) return p.Initializer.Value;
                if (p.ExpressionBody != null) return p.ExpressionBody.Expression;
                var getter = p.AccessorList?.Accessors.FirstOrDefault(a => a.IsKind(SyntaxKind.GetAccessorDeclaration));
                if (getter?.ExpressionBody != null) return getter.ExpressionBody.Expression;
                if (getter?.Body != null)
                {
                    var returnStmt = getter.Body.Statements.OfType<ReturnStatementSyntax>().FirstOrDefault();
                    return returnStmt?.Expression;
                }
            }
            if (member is FieldDeclarationSyntax f) return f.Declaration.Variables.FirstOrDefault()?.Initializer?.Value;
            return null;
        }

        private bool IsLogicBasedProvider(MemberDeclarationSyntax member)
        {
            if (member is MethodDeclarationSyntax) return true;
            if (member is PropertyDeclarationSyntax p)
            {
                if (p.AccessorList != null && p.AccessorList.Accessors.Any(a => a.Body != null)) return true;
                var expr = p.ExpressionBody?.Expression ?? p.AccessorList?.Accessors.FirstOrDefault(a => a.IsKind(SyntaxKind.GetAccessorDeclaration))?.ExpressionBody?.Expression;
                if (expr != null) return !IsSimpleStaticExpression(expr);
            }
            return false;
        }

        private bool IsSimpleStaticExpression(ExpressionSyntax expr)
        {
            if (expr == null) return true;
            if (expr is LiteralExpressionSyntax) return true;
            if (expr is TupleExpressionSyntax tuple) return tuple.Arguments.All(a => IsSimpleStaticExpression(a.Expression));
            if (expr is CollectionExpressionSyntax col) return col.Elements.OfType<ExpressionElementSyntax>().All(e => IsSimpleStaticExpression(e.Expression));
            if (expr is ImplicitArrayCreationExpressionSyntax imp) return imp.Initializer.Expressions.All(IsSimpleStaticExpression);
            if (expr is ArrayCreationExpressionSyntax arr) return arr.Initializer == null || arr.Initializer.Expressions.All(IsSimpleStaticExpression);
            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof") return true;
            return false;
        }

        private ScriptParameter ParseParameter(string name, string csharpType, ExpressionSyntax initializer, 
                                              IEnumerable<AttributeSyntax> attributes,
                                              SyntaxTriviaList triviaList,
                                              CompilationUnitSyntax root)
        {
            var options = new List<string>();
            bool multiSelect = false;
            string description = "";
            string visibleWhen = "";
            double? min = null, max = null, step = null;
            bool required = false;
            string suffix = "", pattern = "", enabledWhenParam = "", enabledWhenValue = "";
            bool isRevitElement = false;
            string revitElementType = "", revitElementCategory = "", group = "", inputType = "", selectionType = "";
            bool requiresCompute = false;

            if (triviaList.Any())
            {
                var xmlTrivia = triviaList.Select(t => t.ToFullString().Trim()).Where(s => s.StartsWith("///"));
                if (xmlTrivia.Any())
                {
                    string joinedXml = string.Join("\n", xmlTrivia);
                    var match = Regex.Match(joinedXml, @"<summary>\s*/*\s*(.*?)\s*/*\s*</summary>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
                    if (match.Success)
                    {
                        var lines = match.Groups[1].Value.Split('\n').Select(l => l.Trim('/', ' ')).Where(l => !string.IsNullOrWhiteSpace(l));
                        description = string.Join(" ", lines);
                    }
                    else
                    {
                        var lines = xmlTrivia.Select(l => l.Trim('/', ' ')).Where(l => !string.IsNullOrWhiteSpace(l) && !l.StartsWith("<"));
                        description = string.Join(" ", lines);
                    }
                }
            }

            foreach (var attr in attributes)
            {
                string attrName = attr.Name.ToString();
                if (attrName.Contains("Required") || attrName.Contains("Mandatory")) required = true;
                if (attrName.Contains("Min") && attr.ArgumentList?.Arguments.Count > 0) min = ExtractDouble(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Max") && attr.ArgumentList?.Arguments.Count > 0) max = ExtractDouble(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Range") && attr.ArgumentList?.Arguments.Count >= 2)
                {
                    min = ExtractDouble(attr.ArgumentList.Arguments[0].Expression);
                    max = ExtractDouble(attr.ArgumentList.Arguments[1].Expression);
                    if (attr.ArgumentList.Arguments.Count >= 3) step = ExtractDouble(attr.ArgumentList.Arguments[2].Expression);
                }
                if (attrName.Contains("Suffix") && attr.ArgumentList?.Arguments.Count > 0) suffix = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Pattern") && attr.ArgumentList?.Arguments.Count > 0) pattern = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Confirm") && attr.ArgumentList?.Arguments.Count > 0) pattern = $"^{ExtractString(attr.ArgumentList.Arguments[0].Expression)}$";
                if (attrName == "Description" && attr.ArgumentList?.Arguments.Count > 0) description = ExtractString(attr.ArgumentList.Arguments[0].Expression);

                if (attrName.Contains("EnabledWhen") && attr.ArgumentList?.Arguments.Count >= 2)
                {
                    enabledWhenParam = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                    var valExpr = attr.ArgumentList.Arguments[1].Expression;
                    enabledWhenValue = valExpr is LiteralExpressionSyntax valLit ? valLit.Token.Value?.ToString() : valExpr.ToString().Trim('"', '\'');
                }

                if (attrName.Contains("Select") && attr.Name.ToString() == "Select" && attr.ArgumentList?.Arguments.Count > 0)
                {
                    if (attr.ArgumentList.Arguments[0].Expression is MemberAccessExpressionSyntax mem) selectionType = mem.Name.Identifier.Text;
                }

                if (attrName.Contains("InputFile")) { inputType = "File"; if (attr.ArgumentList?.Arguments.Count > 0) pattern = ExtractString(attr.ArgumentList.Arguments[0].Expression); }
                if (attrName.Contains("FolderPath")) inputType = "Folder";
                if (attrName.Contains("OutputFile")) { inputType = "SaveFile"; if (attr.ArgumentList?.Arguments.Count > 0) pattern = ExtractString(attr.ArgumentList.Arguments[0].Expression); }
                if (attrName.Contains("Color")) inputType = "Color";
                if (attrName.Contains("Stepper")) inputType = "Stepper";
                if (attrName.Contains("Segmented")) inputType = "Segmented";

                if (attrName.Contains("ScriptParameter") || attrName.Contains("RevitElements"))
                {
                    if (attrName.Contains("RevitElements")) isRevitElement = true;
                    if (attr.ArgumentList != null)
                    {
                        foreach (var arg in attr.ArgumentList.Arguments)
                        {
                            string argName = arg.NameEquals?.Name.Identifier.Text ?? arg.NameColon?.Name.Identifier.Text ?? "";
                            var expr = arg.Expression;
                            if (argName == "Options") options = ExtractOptions(expr, root);
                            else if (argName == "MultiSelect") multiSelect = ExtractBool(expr);
                            else if (argName == "Description") description = ExtractString(expr);
                            else if (argName == "VisibleWhen") visibleWhen = ParseVisibilityExpression(expr);
                            else if (argName == "Min") min = ExtractDouble(expr);
                            else if (argName == "Max") max = ExtractDouble(expr);
                            else if (argName == "Step") step = ExtractDouble(expr);
                            else if (argName == "Suffix") suffix = ExtractString(expr);
                            else if (argName == "Group") group = ExtractString(expr);
                            else if (argName == "Computable" || argName == "Fetch" || argName == "Compute") requiresCompute = ExtractBool(expr);
                            else if (argName == "InputType") inputType = ExtractString(expr);
                            else if (argName == "Type" || argName == "TargetType") revitElementType = ExtractString(expr);
                            else if (argName == "Category") revitElementCategory = ExtractString(expr);
                            else if (argName == "Select" && expr is MemberAccessExpressionSyntax mem) selectionType = mem.Name.Identifier.Text;
                        }
                    }
                }
            }

            string defaultValueJson = "";
            string type = "string";
            string numericType = null;
            string baseType = csharpType.TrimEnd('?');

            bool isXyz = baseType == "XYZ" || baseType == "Autodesk.Revit.DB.XYZ";
            bool isReference = baseType == "Reference" || baseType == "Autodesk.Revit.DB.Reference";

            if (new[] { "int", "long", "double", "float", "decimal" }.Contains(baseType))
            {
                type = "number";
                numericType = (baseType == "int" || baseType == "long") ? "int" : "double";
                defaultValueJson = "0";
            }
            else if (baseType == "bool" || baseType == "boolean") { type = "boolean"; defaultValueJson = "false"; }
            else if (baseType == "string") { type = "string"; defaultValueJson = "\"\""; }
            else if (isXyz) { type = "xyz"; defaultValueJson = JsonSerializer.Serialize("0,0,0"); if (string.IsNullOrEmpty(selectionType)) selectionType = "Point"; }
            else if (isReference) { type = "reference"; defaultValueJson = JsonSerializer.Serialize(""); if (string.IsNullOrEmpty(selectionType)) selectionType = "Element"; }
            else if (baseType.StartsWith("List<") || baseType.Contains("[]"))
            {
                type = "string"; multiSelect = true; defaultValueJson = "[]";
                string innerType = baseType.Contains("<") ? baseType.Split('<', '>')[1] : baseType.Replace("[]", "");
                if (char.IsUpper(innerType[0]) && IsRevitType(innerType, out _)) { isRevitElement = true; if (string.IsNullOrEmpty(revitElementType)) revitElementType = innerType; }
            }
            else if (!string.IsNullOrEmpty(baseType) && char.IsUpper(baseType[0]))
            {
                if (IsRevitType(baseType, out bool isEnum))
                {
                    if (isEnum) type = "enum";
                    else { isRevitElement = true; revitElementType = baseType; type = "reference"; }
                }
                else type = "enum";
                defaultValueJson = JsonSerializer.Serialize("");
            }

            if (initializer is LiteralExpressionSyntax lit) defaultValueJson = JsonSerializer.Serialize(lit.Token.Value);
            else if (initializer != null && IsSimpleStaticExpression(initializer)) defaultValueJson = JsonSerializer.Serialize(ExtractStringsFromInitializer(initializer));

            if (isRevitElement && (options == null || options.Count == 0)) requiresCompute = true;

            return new ScriptParameter { Name = name, Type = type, DefaultValueJson = defaultValueJson, Description = description, Options = options, MultiSelect = multiSelect, VisibleWhen = visibleWhen, NumericType = numericType, Min = min, Max = max, Step = step, Required = required, Suffix = suffix, Pattern = pattern, EnabledWhenParam = enabledWhenParam, EnabledWhenValue = enabledWhenValue, IsRevitElement = isRevitElement, RevitElementType = revitElementType, RevitElementCategory = revitElementCategory, RequiresCompute = requiresCompute, Group = group, InputType = inputType, SelectionType = selectionType };
        }

        private bool IsRevitType(string typeName, out bool isEnum)
        {
            isEnum = false;
            if (string.IsNullOrEmpty(typeName)) return false;
            try
            {
                var revitAssembly = typeof(Autodesk.Revit.DB.Element).Assembly;
                // V3: Added MEP Namespaces (Mechanical, Plumbing, Electrical)
                string[] namespaces = { 
                    "Autodesk.Revit.DB", 
                    "Autodesk.Revit.DB.Architecture", 
                    "Autodesk.Revit.DB.Structure", 
                    "Autodesk.Revit.DB.Mechanical", 
                    "Autodesk.Revit.DB.Plumbing", 
                    "Autodesk.Revit.DB.Electrical" 
                };
                foreach (var ns in namespaces)
                {
                    var type = revitAssembly.GetType($"{ns}.{typeName}");
                    if (type != null) { isEnum = type.IsEnum; return typeof(Autodesk.Revit.DB.Element).IsAssignableFrom(type) || isEnum; }
                }
            }
            catch { }
            return false;
        }

        private List<string> ExtractOptions(ExpressionSyntax expr, CompilationUnitSyntax root)
        {
            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
            {
                var identifier = inv.ArgumentList.Arguments[0].Expression.ToString();
                var resolved = ResolveOptionsFromIdentifier(identifier, root);
                return resolved.Count > 0 ? resolved : new List<string> { identifier };
            }
            if (expr is IdentifierNameSyntax id) return ResolveOptionsFromIdentifier(id.Identifier.Text, root);
            if (expr is MemberAccessExpressionSyntax mem) return ResolveOptionsFromIdentifier(mem.Name.Identifier.Text, root);
            return ExtractStringsFromInitializer(expr);
        }

        private List<string> ResolveOptionsFromIdentifier(string identifier, CompilationUnitSyntax root)
        {
            var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");
            if (paramsClass != null)
            {
                var field = paramsClass.Members.OfType<FieldDeclarationSyntax>().FirstOrDefault(f => f.Declaration.Variables.Any(v => v.Identifier.Text == identifier));
                if (field?.Declaration.Variables.First().Initializer?.Value != null) return ExtractStringsFromInitializer(field.Declaration.Variables.First().Initializer.Value);
            }
            return new List<string>();
        }

        private List<string> ExtractStringsFromInitializer(ExpressionSyntax expr)
        {
            if (expr is LiteralExpressionSyntax lit && lit.Token.Value is string s) return s.Contains(",") ? s.Split(',').Select(o => o.Trim()).ToList() : new List<string> { s };
            if (expr is CollectionExpressionSyntax col) return col.Elements.OfType<ExpressionElementSyntax>().Select(e => ExtractString(e.Expression)).ToList();
            if (expr is ImplicitArrayCreationExpressionSyntax imp) return imp.Initializer.Expressions.Select(ExtractString).ToList();
            return new List<string>();
        }

        private string ExtractString(ExpressionSyntax expr)
        {
            if (expr == null) return "";
            if (expr is LiteralExpressionSyntax lit) return lit.Token.ValueText;
            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
            {
                return inv.ArgumentList.Arguments[0].Expression.ToString();
            }
            if (expr is IdentifierNameSyntax id) return id.Identifier.Text;
            if (expr is MemberAccessExpressionSyntax mem) return mem.Name.Identifier.Text;
            return expr.ToString().Trim('"', '\'');
        }

        private double? ExtractDouble(ExpressionSyntax expr) => expr is LiteralExpressionSyntax lit ? Convert.ToDouble(lit.Token.Value) : (double?)null;
        private bool ExtractBool(ExpressionSyntax expr) => expr is LiteralExpressionSyntax lit && lit.Token.Value is bool b && b;

        private (double? Min, double? Max, double? Step) ExtractRange(ExpressionSyntax expr)
        {
            if (expr is TupleExpressionSyntax t) return (ExtractDouble(t.Arguments[0].Expression), ExtractDouble(t.Arguments[1].Expression), t.Arguments.Count > 2 ? ExtractDouble(t.Arguments[2].Expression) : null);
            return (null, null, null);
        }

        private string ParseVisibilityExpression(ExpressionSyntax expr)
        {
            if (expr is BinaryExpressionSyntax binary)
            {
                string left = binary.Left.ToString();
                string right = binary.Right.ToString().Trim('"', '\'');
                string op = binary.OperatorToken.ValueText;
                if (op == "==" || op == "!=") return $"{left} {op} '{right}'";
            }
            else if (expr is IdentifierNameSyntax id) return $"{id.Identifier.Text} == 'true'";
            else if (expr is PrefixUnaryExpressionSyntax pre && pre.OperatorToken.IsKind(SyntaxKind.ExclamationToken)) return $"{pre.Operand.ToString()} != 'true'";
            else if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0) return $"{inv.ArgumentList.Arguments[0].Expression} == 'true'";
            return "";
        }

        private Dictionary<int, string> BuildRegionMap(ClassDeclarationSyntax paramsClass)
        {
            var regionMap = new Dictionary<int, string>();
            string currentRegion = "";
            
            // V3: Correctly extract #region using Roslyn SyntaxTrivia
            var regionDirectives = paramsClass.DescendantTrivia()
                .Where(t => t.IsKind(SyntaxKind.RegionDirectiveTrivia) || t.IsKind(SyntaxKind.EndRegionDirectiveTrivia));

            foreach (var trivia in regionDirectives)
            {
                int line = trivia.GetLocation().GetLineSpan().StartLinePosition.Line;
                if (trivia.IsKind(SyntaxKind.RegionDirectiveTrivia))
                {
                    var regionSyntax = (RegionDirectiveTriviaSyntax)trivia.GetStructure();
                    // Extract name from directive: #region Name
                    string name = regionSyntax.ToString().Replace("#region", "").Trim();
                    currentRegion = name;
                    regionMap[line] = currentRegion;
                }
                else
                {
                    currentRegion = "";
                    regionMap[line] = "";
                }
            }
            return regionMap;
        }

        private string GetRegionForLine(int line, Dictionary<int, string> map) => map.Where(kv => kv.Key <= line).OrderByDescending(kv => kv.Key).FirstOrDefault().Value ?? "";
    }
}
