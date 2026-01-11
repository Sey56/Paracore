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
                
                ProcessVariableDeclaration(declaration.Declaration, attributes, triviaList, parameters, root);
            }
        }

        private void ExtractFromClasses(CompilationUnitSyntax root, List<ScriptParameter> parameters)
        {
            var paramsClass = root.DescendantNodes()
                .OfType<ClassDeclarationSyntax>()
                .FirstOrDefault(c => c.Identifier.Text == "Params");
            
            if (paramsClass == null) return;

            // Build region map for automatic grouping
            var regionMap = BuildRegionMap(paramsClass);

            // V3 Change: Implicitly discover ALL public properties in the Params class
            var properties = paramsClass.Members.OfType<PropertyDeclarationSyntax>()
                .Where(p => p.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)));

            foreach (var prop in properties)
            {
                string propName = prop.Identifier.Text;
                
                // Skip if it's a known provider suffix
                if (propName.EndsWith("_Options") || propName.EndsWith("_Range") || 
                    propName.EndsWith("_Visible") || propName.EndsWith("_Enabled") ||
                    propName.EndsWith("_Filter")) 
                    continue;

                ProcessPropertyDeclarationV3(prop, paramsClass, parameters, root, regionMap);
            }
        }

        private void ProcessVariableDeclaration(VariableDeclarationSyntax declaration, IEnumerable<AttributeSyntax> attributes, SyntaxTriviaList triviaList, List<ScriptParameter> parameters, CompilationUnitSyntax root)
        {
            if (!HasAnyParameterMarker(attributes, triviaList)) return;

            var declarator = declaration.Variables.FirstOrDefault();
            if (declarator == null || declarator.Initializer == null) return;

            var param = ParseParameter(declarator.Identifier.Text, declaration.Type.ToString(), declarator.Initializer.Value, 
                                     attributes, triviaList, root);
            
            if (param != null) parameters.Add(param);
        }

        private void ProcessPropertyDeclarationV3(PropertyDeclarationSyntax prop, ClassDeclarationSyntax paramsClass, List<ScriptParameter> parameters, CompilationUnitSyntax root, Dictionary<int, string> regionMap)
        {
            string name = prop.Identifier.Text;

            // V4 FIX: Read-only properties (getter-only or expression-bodied) are usually providers or computed values, not parameters.
            // We skip them to prevent CS0131 (assignment to read-only) errors in CodeRunner.
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

            // Apply region-based grouping if no explicit Group was set
            if (string.IsNullOrEmpty(param.Group))
            {
                int propLine = prop.GetLocation().GetLineSpan().StartLinePosition.Line;
                param.Group = GetRegionForLine(propLine, regionMap);
            }

            // Resolve Convention-Based Providers (V3)
            var members = paramsClass.Members;
            
            // 1. Options / Filter Provider (_Options or _Filter)
            var optionsProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Options" || GetMemberName(m) == $"{name}_Filter");
            if (optionsProvider != null)
            {
                var expr = GetInitialExpression(optionsProvider);
                if (expr != null) param.Options = ExtractOptions(expr, root);

                // Inference: If we have a logic-based provider, it requires compute in Revit
                if (IsLogicBasedProvider(optionsProvider))
                {
                    param.RequiresCompute = true;
                }
            }

            // 2. Range Provider (_Range)
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

            // 3. Visibility Provider (_Visible)
            var visibleProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Visible");
            if (visibleProvider != null)
            {
                var expr = GetInitialExpression(visibleProvider);
                if (expr != null) param.VisibleWhen = ParseVisibilityExpression(expr);
            }

            // 4. Enabled Provider (_Enabled)
            var enabledProvider = members.FirstOrDefault(m => GetMemberName(m) == $"{name}_Enabled");
            if (enabledProvider != null)
            {
                var expr = GetInitialExpression(enabledProvider);
                if (expr != null) param.EnabledWhenParam = ParseVisibilityExpression(expr);
            }

            // 5. Unit Extraction
            // Priority: [Unit] Attribute > _Unit Provider > Name Suffix
            string unit = null;

            // Check for [Unit] Attribute
            var unitAttr = attributes.FirstOrDefault(a => a.Name.ToString().Contains("Unit"));
            if (unitAttr != null && unitAttr.ArgumentList != null && unitAttr.ArgumentList.Arguments.Count > 0)
            {
                 var arg = unitAttr.ArgumentList.Arguments[0];
                 if (arg.Expression is LiteralExpressionSyntax lit && lit.IsKind(SyntaxKind.StringLiteralExpression))
                 {
                     unit = lit.Token.ValueText;
                 }
            }

            // Check for explicit provider: PropertyName_Unit
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

            // If no attribute or provider, check name suffix convention (Fallback)
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
                param.Suffix = unit; // Hint for UI
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
                // Has a complex getter block
                if (p.AccessorList != null && p.AccessorList.Accessors.Any(a => a.Body != null)) return true;
                
                // Has an expression body
                var expr = p.ExpressionBody?.Expression ?? p.AccessorList?.Accessors.FirstOrDefault(a => a.IsKind(SyntaxKind.GetAccessorDeclaration))?.ExpressionBody?.Expression;
                if (expr != null)
                {
                    return !IsSimpleStaticExpression(expr);
                }
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

        private bool HasAnyParameterMarker(IEnumerable<AttributeSyntax> attributes, SyntaxTriviaList triviaList)
        {
             // V3: Marker optional for class properties, but still used for top-level or descriptions
             var hasAttr = attributes.Any(a => 
                a.Name.ToString().Contains("ScriptParameter") || 
                a.Name.ToString().Contains("RevitElements") ||
                a.Name.ToString().Contains("Required") ||
                a.Name.ToString().Contains("Description"));
             
             if (hasAttr) return true;

             var hasComment = triviaList.Any(t => 
                t.IsKind(SyntaxKind.SingleLineCommentTrivia) && 
                Regex.IsMatch(t.ToString(), @"^\s*//\s*\[ScriptParameter"));

             return hasComment;
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
            double? min = null;
            double? max = null;
            double? step = null;
            bool required = false;
            string suffix = "";
            string pattern = "";
            string enabledWhenParam = "";
            string enabledWhenValue = "";
            bool isRevitElement = false;
            string revitElementType = "";
            string revitElementCategory = "";

            string group = "";
            string inputType = "";
            bool requiresCompute = false;

            // 1. Extract Description from XML Documentation Comments (V3 Priority)
            // 1. Extract Description from XML Documentation Comments (V3 Priority)
            if (triviaList.Any())
            {
                var xmlTrivia = triviaList
                    .Select(t => t.ToFullString().Trim())
                    .Where(s => s.StartsWith("///"));

                if (xmlTrivia.Any())
                {
                    string joinedXml = string.Join("\n", xmlTrivia);
                    
                    // Try to match <summary> tag first
                    var match = Regex.Match(joinedXml, @"<summary>\s*/*\s*(.*?)\s*/*\s*</summary>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
                    
                    if (match.Success)
                    {
                        var rawDesc = match.Groups[1].Value;
                        // Clean up lines
                        var lines = rawDesc.Split('\n')
                            .Select(l => l.Trim('/', ' ')) 
                            .Where(l => !string.IsNullOrWhiteSpace(l));
                        description = string.Join(" ", lines);
                    }
                    else
                    {
                        // Fallback: Use the raw comment text if no <summary> tags found (Tagless V3)
                        var lines = xmlTrivia
                            .Select(l => l.Trim('/', ' ')) // Robustly remove all leading/trailing slashes and spaces
                            .Where(l => !string.IsNullOrWhiteSpace(l) && !l.StartsWith("<")); // Exclude other XML tags
                        
                        description = string.Join(" ", lines);
                    }
                }
            }

            // 1. Parse Arguments from Attributes
            foreach (var attr in attributes)
            {
                string attrName = attr.Name.ToString();

                // Validation Attributes (New in V2.0.0)
                if (attrName.Contains("Required")) required = true;
                if (attrName.Contains("Min") && attr.ArgumentList?.Arguments.Count > 0) 
                    min = ExtractDouble(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Max") && attr.ArgumentList?.Arguments.Count > 0)
                    max = ExtractDouble(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Range") && attr.ArgumentList?.Arguments.Count >= 2)
                {
                    min = ExtractDouble(attr.ArgumentList.Arguments[0].Expression);
                    max = ExtractDouble(attr.ArgumentList.Arguments[1].Expression);
                    if (attr.ArgumentList.Arguments.Count >= 3)
                    {
                        step = ExtractDouble(attr.ArgumentList.Arguments[2].Expression);
                    }
                }


                if (attrName.Contains("Suffix") && attr.ArgumentList?.Arguments.Count > 0)
                    suffix = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                if (attrName.Contains("Pattern") && attr.ArgumentList?.Arguments.Count > 0)
                    pattern = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                if (attrName == "Description" && attr.ArgumentList?.Arguments.Count > 0)
                    description = ExtractString(attr.ArgumentList.Arguments[0].Expression); // Attribute overrides XML if present

                if (attrName.Contains("EnabledWhen") && attr.ArgumentList?.Arguments.Count >= 2)
                {
                    enabledWhenParam = ExtractString(attr.ArgumentList.Arguments[0].Expression);
                    var valExpr = attr.ArgumentList.Arguments[1].Expression;
                    if (valExpr is LiteralExpressionSyntax valLit)
                        enabledWhenValue = valLit.Token.Value?.ToString();
                    else
                        enabledWhenValue = valExpr.ToString().Trim('"', '\'');
                }

                // Main Attributes (ScriptParameter / RevitElements)
                if (attrName.Contains("ScriptParameter") || attrName.Contains("RevitElements"))
                {
                    if (attrName.Contains("RevitElements")) isRevitElement = true;

                    if (attr.ArgumentList != null)
                    {
                        foreach (var arg in attr.ArgumentList.Arguments)
                        {
                            string argName = arg.NameEquals?.Name.Identifier.Text ?? arg.NameColon?.Name.Identifier.Text ?? "";
                            var expr = arg.Expression;

                            if (argName == "Options") {
                                options = ExtractOptions(expr, root);
                            }
                            else if (argName == "MultiSelect") multiSelect = ExtractBool(expr);
                            else if (argName == "Description") description = ExtractString(expr); // ScriptParameter Description overrides others
                            else if (argName == "VisibleWhen") visibleWhen = ExtractString(expr);
                            else if (argName == "Min") min = ExtractDouble(expr);
                            else if (argName == "Max") max = ExtractDouble(expr);
                            else if (argName == "Step") step = ExtractDouble(expr);
                            else if (argName == "Suffix") suffix = ExtractString(expr);
                            else if (argName == "Group") group = ExtractString(expr);
                            else if (argName == "Computable" || argName == "Fetch" || argName == "Compute") requiresCompute = ExtractBool(expr);
                            else if (argName == "InputType") inputType = ExtractString(expr);
                            else if (argName == "Type" || argName == "TargetType") revitElementType = ExtractString(expr);
                            else if (argName == "Category") revitElementCategory = ExtractString(expr);
                        }
                    }
                }
            }

            // 2. Parse Comments (Backup for Simple Pattern)
            var commentTrivia = triviaList.FirstOrDefault(t => 
                t.IsKind(SyntaxKind.SingleLineCommentTrivia) && 
                Regex.IsMatch(t.ToString(), @"^\s*//\s*\[ScriptParameter"));

            if (!string.IsNullOrEmpty(commentTrivia.ToString()))
            {
                string comment = commentTrivia.ToString();

                var meta = ParseCommentMetadata(comment);
                if (meta.TryGetValue("MultiSelect", out string ms)) multiSelect = ms.ToLower() == "true";
                if (meta.TryGetValue("Description", out string ds)) description = ds;
                if (meta.TryGetValue("VisibleWhen", out string vw)) visibleWhen = vw;
                if (meta.TryGetValue("Min", out string mi) && double.TryParse(mi, out double mid)) min = mid;
                if (meta.TryGetValue("Max", out string ma) && double.TryParse(ma, out double mad)) max = mad;
                if (meta.TryGetValue("Step", out string st) && double.TryParse(st, out double std)) step = std;
                if (meta.TryGetValue("Options", out string op)) options = op.Split(',').Select(o => o.Trim()).Where(o => !string.IsNullOrEmpty(o)).ToList();
                if (meta.TryGetValue("Group", out string gr)) group = gr;
                if (meta.TryGetValue("Computable", out string cp)) requiresCompute = cp.ToLower() == "true";
                if (meta.TryGetValue("Fetch", out string ft)) requiresCompute = ft.ToLower() == "true";
                if (meta.TryGetValue("Type", out string ty)) revitElementType = ty;
                if (meta.TryGetValue("Category", out string ca)) revitElementCategory = ca;
                if (meta.TryGetValue("Suffix", out string sx)) suffix = sx;
                if (meta.TryGetValue("Required", out string rq)) required = rq.ToLower() == "true";
                
                // Attributes support robust validation, but comments are backup.
            }


            // 3. Infer Type from Initializer
            string defaultValueJson = "";
            string type = "string";
            string numericType = null;

            if (initializer == null)
            {
                // V3: Support implicit defaults if no initializer is present
                if (csharpType == "int" || csharpType == "double" || csharpType == "float" || csharpType == "number")
                {
                    type = "number";
                    numericType = (csharpType == "int") ? "int" : "double";
                    defaultValueJson = "0";
                }
                else if (csharpType == "bool" || csharpType == "boolean")
                {
                    type = "boolean";
                    defaultValueJson = "false";
                }
                else if (csharpType.StartsWith("List<") || csharpType.Contains("[]") || csharpType.StartsWith("IList<") || csharpType.Contains("IEnumerable<"))
                {
                    // V3 Inference: If it's a List/Array, it's a MultiSelect parameter
                    type = "string"; // Usually string array for options
                    multiSelect = true;
                    defaultValueJson = "[]";
                }
                else
                {
                    type = "string";
                    defaultValueJson = "\"\"";
                }
            }
            else if (initializer is LiteralExpressionSyntax literal)
            {
                var val = literal.Token.Value;
                if (val is string s)
                {
                    type = "string";
                    defaultValueJson = JsonSerializer.Serialize(s);
                }
                else if (val is bool b)
                {
                    type = "boolean";
                    defaultValueJson = JsonSerializer.Serialize(b);
                }
                else if (val is int i)
                {
                    type = "number";
                    numericType = "int";
                    defaultValueJson = JsonSerializer.Serialize(i);
                }
                else if (val is double d)
                {
                    type = "number";
                    numericType = "double";
                    defaultValueJson = JsonSerializer.Serialize(d);
                }
                else if (literal.Token.IsKind(SyntaxKind.StringLiteralToken))
                {
                    type = "string";
                    defaultValueJson = JsonSerializer.Serialize(literal.Token.ValueText);
                }
                else if (literal.Token.IsKind(SyntaxKind.NumericLiteralToken))
                {
                    type = "number";
                    if (double.TryParse(literal.Token.ValueText, out double num))
                    {
                        defaultValueJson = JsonSerializer.Serialize(num);
                        if (csharpType == "int") numericType = "int"; 
                        else numericType = "double";
                    }
                }
            }
            else if (initializer is CollectionExpressionSyntax || 
                     initializer is ImplicitArrayCreationExpressionSyntax || 
                     initializer is ArrayCreationExpressionSyntax || 
                     initializer is BaseObjectCreationExpressionSyntax)
            {
                var values = ExtractStringsFromInitializer(initializer);
                defaultValueJson = JsonSerializer.Serialize(values);
                multiSelect = true;
            }
            else if (initializer != null)
            {
                // Fallback: If we can't parse the exact object, at least try to get the raw text 
                // for simple identifiers or constant expressions.
                string rawValue = initializer.ToString().Trim(' ', '"', '\'');
                if (!string.IsNullOrEmpty(rawValue))
                {
                    defaultValueJson = JsonSerializer.Serialize(rawValue);
                }
            }

            if (numericType == null && type == "number")
            {
                if (csharpType == "int") numericType = "int";
                else if (csharpType == "double") numericType = "double";
            }

            // Fallback for options inference
            if (options.Count == 0 && isRevitElement) requiresCompute = true;

            // V3 FINAL INFERENCE: Enforce MultiSelect if the C# type is clearly a collection
            // This overrides any miss from the initializer parsing
            if (csharpType.StartsWith("List<") || csharpType.Contains("[]") || csharpType.StartsWith("IList<") || csharpType.StartsWith("IEnumerable<"))
            {
                multiSelect = true;
                // Ensure default value is compatible if we haven't parsed a specific json default yet
                if (defaultValueJson == "\"\"" || string.IsNullOrEmpty(defaultValueJson)) 
                {
                    defaultValueJson = "[]";
                }
            }

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
                Required = required, // New
                Suffix = suffix,     // New
                Pattern = pattern,           // New (Phase 2)
                EnabledWhenParam = enabledWhenParam, // New (Phase 2)
                EnabledWhenValue = enabledWhenValue, // New (Phase 2)
                IsRevitElement = isRevitElement,
                RevitElementType = revitElementType,
                RevitElementCategory = revitElementCategory,
                RequiresCompute = requiresCompute,
                Group = group,
                InputType = inputType
            };
        }

        // --- Helpers ---

        private List<string> ExtractOptions(ExpressionSyntax expr, CompilationUnitSyntax root)
        {
            if (expr == null) return new List<string>();

            // 1. Support nameof(Types) where Types is a variable to be resolved
            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
            {
                var identifier = inv.ArgumentList.Arguments[0].Expression.ToString();
                var resolved = ResolveOptionsFromIdentifier(identifier, root);
                if (resolved.Count > 0) return resolved;
                return new List<string> { identifier }; // Fallback to the literal name
            }

            // 2. Resolve via Identifier: Options = MyList
            if (expr is IdentifierNameSyntax id)
            {
                return ResolveOptionsFromIdentifier(id.Identifier.Text, root);
            }

            // 3. Resolve via Member Access: Options = Params.MyList
            if (expr is MemberAccessExpressionSyntax mem)
            {
                 return ResolveOptionsFromIdentifier(mem.Name.Identifier.Text, root);
            }

            // 4. Literal fallback with variable resolution: Options = "MyList"
            if (expr is LiteralExpressionSyntax lit && lit.Token.Value is string s && !s.Contains(","))
            {
                var resolved = ResolveOptionsFromIdentifier(s, root);
                if (resolved.Count > 0) return resolved;
            }

            // 5. Direct Initialization: Options = ["A", "B"] or Options = new() { "A", "B" }
            return ExtractStringsFromInitializer(expr);
        }

        private List<string> ResolveOptionsFromIdentifier(string identifier, CompilationUnitSyntax root)
        {
            // 1. Check Global Statements (Top-Level)
            var globalVar = root.Members.OfType<GlobalStatementSyntax>()
                .Select(gs => gs.Statement).OfType<LocalDeclarationStatementSyntax>()
                .FirstOrDefault(d => d.Declaration.Variables.Any(v => v.Identifier.Text == identifier));

            if (globalVar != null)
            {
                var init = globalVar.Declaration.Variables.First(v => v.Identifier.Text == identifier).Initializer?.Value;
                if (init != null) return ExtractStringList(init);
            }

            // 2. Check Class Fields (Params pattern)
            var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");
            if (paramsClass != null)
            {
                var field = paramsClass.Members.OfType<FieldDeclarationSyntax>()
                    .FirstOrDefault(f => f.Declaration.Variables.Any(v => v.Identifier.Text == identifier));
                
                if (field != null)
                {
                    var init = field.Declaration.Variables.First(v => v.Identifier.Text == identifier).Initializer?.Value;
                     if (init != null) return ExtractStringList(init);
                }
            }
            
            return new List<string>();
        }

        private (double? Min, double? Max, double? Step) ExtractRange(ExpressionSyntax expr)
        {
            double? min = null, max = null, step = null;

            // Handle Tuple: (0, 100) or (0, 100, 10)
            if (expr is TupleExpressionSyntax tuple)
            {
                if (tuple.Arguments.Count >= 1) min = ExtractDouble(tuple.Arguments[0].Expression);
                if (tuple.Arguments.Count >= 2) max = ExtractDouble(tuple.Arguments[1].Expression);
                if (tuple.Arguments.Count >= 3) step = ExtractDouble(tuple.Arguments[2].Expression);
            }
            // Handle Implicit Array: new[] { 0, 100 }
            else if (expr is ImplicitArrayCreationExpressionSyntax impArr)
            {
                var values = impArr.Initializer.Expressions.Select(ExtractDouble).ToList();
                if (values.Count >= 1) min = values[0];
                if (values.Count >= 2) max = values[1];
                if (values.Count >= 3) step = values[2];
            }
            // Handle Array: new double[] { 0, 100 }
            else if (expr is ArrayCreationExpressionSyntax arr && arr.Initializer != null)
            {
                var values = arr.Initializer.Expressions.Select(ExtractDouble).ToList();
                if (values.Count >= 1) min = values[0];
                if (values.Count >= 2) max = values[1];
                if (values.Count >= 3) step = values[2];
            }
            // Handle Collection: [ 0, 100 ]
            else if (expr is CollectionExpressionSyntax col)
            {
                var values = col.Elements.OfType<ExpressionElementSyntax>().Select(e => ExtractDouble(e.Expression)).ToList();
                if (values.Count >= 1) min = values[0];
                if (values.Count >= 2) max = values[1];
                if (values.Count >= 3) step = values[2];
            }

            return (min, max, step);
        }

        private string ParseVisibilityExpression(ExpressionSyntax expr)
        {
            // Simplified "Transpilation" for V3
            // Currently handles: => PropName == "Value" or => PropName
            
            if (expr is BinaryExpressionSyntax binary)
            {
                string left = binary.Left.ToString();
                string right = binary.Right.ToString().Trim('"', '\'');
                string op = binary.OperatorToken.ValueText;
                
                if (op == "==" || op == "!=")
                {
                    return $"{left} {op} '{right}'";
                }
            }
            else if (expr is IdentifierNameSyntax id)
            {
                 // boolean property: => MyBool 
                 return $"{id.Identifier.Text} == 'true'";
            }
            else if (expr is PrefixUnaryExpressionSyntax pre && pre.OperatorToken.IsKind(SyntaxKind.ExclamationToken))
            {
                // => !MyBool
                return $"{pre.Operand.ToString()} != 'true'";
            }

            return "";
        }

        private List<string> ExtractStringList(ExpressionSyntax expr)
        {
            return ExtractStringsFromInitializer(expr);
        }

        private List<string> ExtractStringsFromInitializer(ExpressionSyntax expr)
        {
            if (expr == null) return new List<string>();

            // 1. Literal Expression: "A, B, C"
            if (expr is LiteralExpressionSyntax lit && lit.Token.Value is string val)
            {
                if (val.Contains(","))
                {
                    return val.Split(',').Select(o => o.Trim()).Where(o => !string.IsNullOrEmpty(o)).ToList();
                }
                return new List<string> { val };
            }

            // 2. Collection Expression: ["A", "B"]
            if (expr is CollectionExpressionSyntax col)
            {
                return col.Elements
                    .OfType<ExpressionElementSyntax>()
                    .Select(e => ExtractStringValue(e.Expression))
                    .Where(v => v != null)
                    .ToList();
            }

            // 3. Array Initializers: new[] { "A", "B" } or new string[] { "A", "B" }
            if (expr is ImplicitArrayCreationExpressionSyntax imp && imp.Initializer != null)
            {
                return imp.Initializer.Expressions
                    .Select(ExtractStringValue)
                    .Where(v => v != null)
                    .ToList();
            }
            if (expr is ArrayCreationExpressionSyntax arr && arr.Initializer != null)
            {
                return arr.Initializer.Expressions
                    .Select(ExtractStringValue)
                    .Where(v => v != null)
                    .ToList();
            }

            // 4. Object Initializers: new() { "A", "B" } or new List<string> { "A", "B" }
            if (expr is BaseObjectCreationExpressionSyntax objInit && objInit.Initializer != null)
            {
                return objInit.Initializer.Expressions
                    .Select(ExtractStringValue)
                    .Where(v => v != null)
                    .ToList();
            }
            
            // 5. Single Member/Invocation: nameof(X) or myVar
            var singleVal = ExtractStringValue(expr);
            if (singleVal != null) return new List<string> { singleVal };

            return new List<string>();
        }

        private string ExtractStringValue(ExpressionSyntax expr)
        {
            if (expr == null) return null;
            if (expr is LiteralExpressionSyntax l) return l.Token.ValueText;
            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
            {
                 return inv.ArgumentList.Arguments[0].Expression.ToString();
            }
            if (expr is IdentifierNameSyntax id) return id.Identifier.Text;
            if (expr is MemberAccessExpressionSyntax mem) return mem.Name.Identifier.Text;
            return null;
        }

        private double? ExtractDouble(ExpressionSyntax expr)
        {
            if (expr is LiteralExpressionSyntax l && l.Token.Value is double d) return d;
            if (expr is LiteralExpressionSyntax i && i.Token.Value is int n) return (double)n;
            // Handle PrefixUnaryExpression (negative numbers) e.g. -5
            if (expr is PrefixUnaryExpressionSyntax pre && pre.OperatorToken.IsKind(SyntaxKind.MinusToken) && pre.Operand is LiteralExpressionSyntax op)
            {
                 if (op.Token.Value is double d2) return -d2;
                 if (op.Token.Value is int n2) return -(double)n2;
            }
            return null;
        }

        private bool ExtractBool(ExpressionSyntax expr)
        {
            if (expr is LiteralExpressionSyntax l && l.Token.Value is bool b) return b;
            return false;
        }

        private string ExtractString(ExpressionSyntax expr)
        {
            if (expr is LiteralExpressionSyntax l) return l.Token.ValueText;
            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
            {
                 return inv.ArgumentList.Arguments[0].Expression.ToString();
            }
            if (expr is IdentifierNameSyntax id) return id.Identifier.Text;
            return "";
        }

        private Dictionary<string, string> ParseCommentMetadata(string comment)
        {
            var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            
            var bracketMatch = Regex.Match(comment, @"\[\w+\((.*)\)\]");
            string content = bracketMatch.Success ? bracketMatch.Groups[1].Value : comment;
            
            var kvRegex = new Regex(@"(\w+)(?:\s*[:=]\s*(?:""([^""]*)""|([^,)\s]+)))?", RegexOptions.IgnoreCase);
            var matches = kvRegex.Matches(content);
            
            foreach (Match match in matches)
            {
                string key = match.Groups[1].Value;
                string value = match.Groups[2].Success ? match.Groups[2].Value : 
                               match.Groups[3].Success ? match.Groups[3].Value : "true"; 
                metadata[key] = value;
            }
            
            return metadata;
        }

        /// <summary>
        /// Builds a map of line numbers to region names for automatic parameter grouping.
        /// </summary>
        private Dictionary<int, string> BuildRegionMap(ClassDeclarationSyntax paramsClass)
        {
            var regionMap = new Dictionary<int, string>();
            string currentRegion = "";
            
            foreach (var trivia in paramsClass.DescendantTrivia())
            {
                if (trivia.IsKind(SyntaxKind.RegionDirectiveTrivia))
                {
                    var regionText = trivia.ToFullString();
                    // Extract region name: "#region Room Selection" -> "Room Selection"
                    var match = Regex.Match(regionText, @"#region\s+(.+)");
                    if (match.Success)
                    {
                        currentRegion = match.Groups[1].Value.Trim();
                        int line = trivia.GetLocation().GetLineSpan().StartLinePosition.Line;
                        regionMap[line] = currentRegion;
                    }
                }
                else if (trivia.IsKind(SyntaxKind.EndRegionDirectiveTrivia))
                {
                    currentRegion = "";
                    int line = trivia.GetLocation().GetLineSpan().StartLinePosition.Line;
                    regionMap[line] = "";
                }
            }
            
            return regionMap;
        }

        /// <summary>
        /// Gets the active region name for a given line number.
        /// </summary>
        private string GetRegionForLine(int lineNumber, Dictionary<int, string> regionMap)
        {
            string currentRegion = "";
            foreach (var entry in regionMap.OrderBy(e => e.Key))
            {
                if (entry.Key <= lineNumber)
                    currentRegion = entry.Value;
                else
                    break;
            }
            return currentRegion;
        }
    }
}
