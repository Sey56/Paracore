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
                            return JsonSerializer.Deserialize<List<ScriptParameter>>(paramsElem.GetRawText(), options) ?? parameters;
                        }
                    }
                }
                catch { }
            }

            try
            {
                SyntaxTree tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot() as CompilationUnitSyntax;
                if (root == null) return parameters;
                
                ExtractFromClasses(root, parameters);
            }
            catch (Exception ex) { _logger.LogError($"[ParameterExtractor] Error: {ex.Message}"); }
            return parameters;
        }

        private void ExtractFromClasses(CompilationUnitSyntax root, List<ScriptParameter> parameters)
        {
            var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");
            if (paramsClass == null) return;

            var regionMap = BuildRegionMap(paramsClass);
            var properties = paramsClass.Members.OfType<PropertyDeclarationSyntax>().Where(p => p.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)));

            foreach (var prop in properties)
            {
                string propName = prop.Identifier.Text;
                if (propName.EndsWith("_Options") || propName.EndsWith("_Range") || propName.EndsWith("_Visible") || propName.EndsWith("_Enabled") || propName.EndsWith("_Filter") || propName.EndsWith("_Unit")) continue;

                bool hasSetter = prop.AccessorList?.Accessors.Any(a => a.IsKind(SyntaxKind.SetAccessorDeclaration) || a.IsKind(SyntaxKind.InitAccessorDeclaration)) ?? false;
                if (!hasSetter && prop.Initializer == null) continue;

                var param = ParsePropertyV3(prop, paramsClass, root, regionMap);
                if (param != null) parameters.Add(param);
            }
        }

        private ScriptParameter ParsePropertyV3(PropertyDeclarationSyntax prop, ClassDeclarationSyntax paramsClass, CompilationUnitSyntax root, Dictionary<int, string> regionMap)
        {
            string name = prop.Identifier.Text;
            string csharpType = prop.Type.ToString();
            var attributes = prop.AttributeLists.SelectMany(al => al.Attributes).ToList();
            var triviaList = prop.GetLeadingTrivia();

            var p = new ScriptParameter { 
                Name = name, 
                Description = ExtractXmlDescription(triviaList), 
                Type = "string", 
                DefaultValueJson = JsonSerializer.Serialize("") 
            };

            foreach (var attr in attributes)
            {
                string aN = attr.Name.ToString();
                if (aN.Contains("Segmented")) p.InputType = "Segmented";
                else if (aN.Contains("Color")) p.InputType = "Color";
                else if (aN.Contains("Stepper")) p.InputType = "Stepper";
                if (aN.Contains("Required") || aN.Contains("Mandatory")) p.Required = true;
                if (aN.Contains("Unit") && attr.ArgumentList?.Arguments.Count > 0) p.Unit = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                if (aN.Contains("Suffix") && attr.ArgumentList?.Arguments.Count > 0) p.Suffix = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                if (aN.Contains("EnabledWhen")) { p.EnabledWhenParam = ExtractString(attr.ArgumentList.Arguments[0].Expression); p.EnabledWhenValue = attr.ArgumentList.Arguments[1].Expression.ToString().Trim('"', '\''); }
                if (aN == "Select") p.SelectionType = (attr.ArgumentList.Arguments[0].Expression as MemberAccessExpressionSyntax)?.Name.Identifier.Text ?? "Element";
                
                if (aN.Contains("RevitElements"))
                {
                    if (attr.ArgumentList != null)
                    {
                        foreach (var arg in attr.ArgumentList.Arguments)
                        {
                            string argN = arg.NameEquals?.Name.Identifier.Text ?? arg.NameColon?.Name.Identifier.Text ?? "";
                            if (argN == "Category") p.RevitElementCategory = ExtractString(arg.Expression);
                        }
                    }
                }
            }

            string baseT = csharpType.TrimEnd('?');
            if (new[] { "int", "long", "double", "float", "decimal" }.Contains(baseT)) { p.Type = "number"; p.NumericType = baseT.Contains("int") ? "int" : "double"; p.DefaultValueJson = "0"; }
            else if (baseT == "bool") { p.Type = "boolean"; p.DefaultValueJson = "false"; }
            else if (baseT.Contains("XYZ")) { p.Type = "xyz"; p.DefaultValueJson = JsonSerializer.Serialize("0,0,0"); p.SelectionType = "Point"; }
            else if (baseT.Contains("Reference")) { p.Type = "reference"; p.DefaultValueJson = JsonSerializer.Serialize(""); p.SelectionType = "Element"; }
            else if (baseT.StartsWith("List<") || baseT.Contains("[]"))
            {
                p.Type = "string"; p.MultiSelect = true; p.DefaultValueJson = "[]";
                string inner = baseT.Contains("<") ? baseT.Split('<', '>')[1] : baseT.Replace("[]", "");
                if (IsRevitType(inner, out _)) { p.IsRevitElement = true; p.RevitElementType = inner; }
            }
            else if (char.IsUpper(baseT[0]))
            {
                if (IsRevitType(baseT, out bool isEnum))
                {
                    if (isEnum) p.Type = "enum";
                    else { p.IsRevitElement = true; p.RevitElementType = baseT; p.Type = "reference"; }
                }
                else p.Type = "enum";
                p.DefaultValueJson = JsonSerializer.Serialize("");
            }

            var members = paramsClass.Members;
            var optProv = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Options" || GetMemberName(m) == $"{name}_Filter");
            if (optProv != null)
            {
                var expr = GetInitialExpression(optProv);
                if (expr != null) p.Options = ExtractStringsFromInitializer(expr);
                if (IsLogicBased(optProv) && (p.Options == null || p.Options.Count == 0)) p.RequiresCompute = true;
            }

            var visProv = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Visible");
            if (visProv != null) p.VisibleWhen = ParseVisibilityExpression(GetInitialExpression(visProv));

            p.Group = GetRegionForLine(prop.GetLocation().GetLineSpan().StartLinePosition.Line, regionMap);

            if (p.IsRevitElement && (p.Options == null || p.Options.Count == 0)) p.RequiresCompute = true;

            return p;
        }

        private bool IsRevitType(string typeName, out bool isEnum)
        {
            isEnum = false;
            try {
                var revitAssembly = typeof(Autodesk.Revit.DB.Element).Assembly;
                string[] namespaces = { "Autodesk.Revit.DB", "Autodesk.Revit.DB.Architecture", "Autodesk.Revit.DB.Structure", "Autodesk.Revit.DB.Mechanical", "Autodesk.Revit.DB.Plumbing", "Autodesk.Revit.DB.Electrical" };
                foreach (var ns in namespaces) {
                    var type = revitAssembly.GetType($"{ns}.{typeName}");
                    if (type != null) { isEnum = type.IsEnum; return typeof(Autodesk.Revit.DB.Element).IsAssignableFrom(type) || isEnum; }
                }
            } catch { }
            return false;
        }

        private string ExtractXmlDescription(SyntaxTriviaList trivia) {
            var lines = trivia.Select(t => t.ToFullString().Trim()).Where(s => s.StartsWith("///"));
            var match = Regex.Match(string.Join("\n", lines), @"<summary>(.*?)</summary>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.Trim('/', ' ', '\n', '\r') : "";
        }

        private string GetMemberName(MemberDeclarationSyntax m) => m is PropertyDeclarationSyntax p ? p.Identifier.Text : (m is MethodDeclarationSyntax met ? met.Identifier.Text : "");
        private ExpressionSyntax GetInitialExpression(MemberDeclarationSyntax m) => m is PropertyDeclarationSyntax p ? (p.Initializer?.Value ?? p.ExpressionBody?.Expression ?? p.AccessorList?.Accessors.FirstOrDefault(a => a.IsKind(SyntaxKind.GetAccessorDeclaration))?.ExpressionBody?.Expression) : null;
        private bool IsLogicBased(MemberDeclarationSyntax m) => m is MethodDeclarationSyntax || (m is PropertyDeclarationSyntax p && (p.ExpressionBody != null || (p.AccessorList?.Accessors.Any(a => a.Body != null) ?? false)) && !IsSimpleStatic(GetInitialExpression(p)));
        private bool IsSimpleStatic(ExpressionSyntax e) => e == null || e is LiteralExpressionSyntax || e is CollectionExpressionSyntax;
        
        private string ExtractString(ExpressionSyntax e) 
        {
            if (e == null) return "";
            if (e is LiteralExpressionSyntax l) return l.Token.ValueText;
            if (e is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
                return inv.ArgumentList.Arguments[0].Expression.ToString();
            
            // V3 FIX: Remove raw e.ToString() fallback to prevent code leaking into UI.
            return ""; 
        }

        private List<string> ExtractStringsFromInitializer(ExpressionSyntax e) {
            if (e is CollectionExpressionSyntax col) return col.Elements.Select(el => ExtractString(((ExpressionElementSyntax)el).Expression)).Where(s => !string.IsNullOrEmpty(s)).ToList();
            if (e is ImplicitArrayCreationExpressionSyntax imp) return imp.Initializer.Expressions.Select(ExtractString).Where(s => !string.IsNullOrEmpty(s)).ToList();
            string s = ExtractString(e); return string.IsNullOrEmpty(s) ? new List<string>() : (s.Contains(",") ? s.Split(',').Select(x => x.Trim()).ToList() : new List<string> { s });
        }
        private double? ExtractDouble(ExpressionSyntax e) => e is LiteralExpressionSyntax lit ? Convert.ToDouble(lit.Token.Value) : (double?)null;
        private bool ExtractBool(ExpressionSyntax e) => e is LiteralExpressionSyntax lit && lit.Token.Value is bool b && b;
        private string ParseVisibilityExpression(ExpressionSyntax e) => e?.ToString() ?? "";
        private Dictionary<int, string> BuildRegionMap(ClassDeclarationSyntax c) {
            var map = new Dictionary<int, string>();
            foreach (var t in c.DescendantTrivia()) {
                if (t.IsKind(SyntaxKind.RegionDirectiveTrivia)) map[t.GetLocation().GetLineSpan().StartLinePosition.Line] = t.ToString().Replace("#region", "").Trim();
                if (t.IsKind(SyntaxKind.EndRegionDirectiveTrivia)) map[t.GetLocation().GetLineSpan().StartLinePosition.Line] = "";
            }
            return map;
        }
        private string GetRegionForLine(int line, Dictionary<int, string> map) => map.Where(kv => kv.Key <= line).OrderByDescending(kv => kv.Key).FirstOrDefault().Value ?? "";
    }
}
