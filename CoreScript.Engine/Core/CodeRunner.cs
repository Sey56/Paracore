using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Scripting;
using CoreScript.Engine.Context;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using Autodesk.Revit.DB;

namespace CoreScript.Engine.Core
{
    public class CodeRunner : ICodeRunner
    {
        public ExecutionResult Execute(string scriptContent, string parametersJson, ICoreScriptContext context)
        {
            var alc = new AssemblyLoadContext("RevitScript", isCollectible: true);
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);

            FileLogger.Log("🟢 Starting CodeRunner.Execute");

            string topLevelScriptName = "Unknown Script"; 

            try
            {
                var parameters = MapParameters(parametersJson, out var richParams);
                
                // DEBUG: Log all parameters
                FileLogger.Log($"[CodeRunner] Final Parameters Dictionary Keys: {string.Join(", ", parameters.Keys)}");
                foreach (var kvp in parameters)
                {
                    FileLogger.Log($"[CodeRunner] Param '{kvp.Key}' = {kvp.Value} (Type: {kvp.Value?.GetType().Name ?? "null"})");
                }

                if (parameters.ContainsKey("__script_name__"))
                {
                    var forcedName = parameters["__script_name__"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(forcedName)) topLevelScriptName = forcedName;
                    parameters.Remove("__script_name__"); 
                }

                List<ScriptFile> scriptFiles = new List<ScriptFile>();
                try
                {
                    var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(scriptContent, scriptJsonOptions);
                    if (scriptFiles == null || !scriptFiles.Any())
                        return ExecutionResult.Failure("No script files found in the incoming JSON.");
                }
                catch (JsonException ex)
                {
                    return ExecutionResult.Failure($"Error deserializing script content: {ex.Message}");
                }

                var topLevelScriptFile = ScriptParser.IdentifyTopLevelScript(scriptFiles);
                if (topLevelScriptName == "Unknown Script") topLevelScriptName = topLevelScriptFile?.FileName ?? "Unknown Script";

                var combinedScriptContent = SemanticCombinator.Combine(scriptFiles);
                
                List<ScriptParameter> extractedParams = new List<ScriptParameter>();
                try 
                {
                    var extractor = new ParameterExtractor(new RunnerLogger());
                    extractedParams = extractor.ExtractParameters(combinedScriptContent);
                    var finalScriptParams = richParams.Count > 0 ? richParams : extractedParams;
                    HardenParameters(parameters, finalScriptParams);
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[CodeRunner] Failed to harden parameters: {ex.Message}");
                }

                SyntaxTree tree = CSharpSyntaxTree.ParseText(combinedScriptContent);

                // Set Globals Context EARLY
                var executionGlobals = new ExecutionGlobals(context, parameters ?? new Dictionary<string, object>());
                ExecutionGlobals.SetContext(executionGlobals);

                // V3: Universal Pull-based Rewriter
                var rewriter = new ParameterRewriter(parameters);
                SyntaxNode newRoot = rewriter.Visit(tree.GetRoot());
                
                var timeoutRewriter = new TimeoutRewriter();
                newRoot = timeoutRewriter.Visit(newRoot);
                
                string modifiedUserCode = newRoot.ToFullString();
                var finalScriptCode = "#line hidden\nusing static CoreScript.Engine.Globals.ScriptApi;\n#line default\n" + modifiedUserCode;

                try
                {
                    var debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CompiledScript.cs");
                    Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                    File.WriteAllText(debugPath, finalScriptCode);
                }
                catch { }

                string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
                var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                var revitRefs = revitDllPaths.Where(IsManagedAssembly).Select(path => MetadataReference.CreateFromFile(path)).ToList();
                var coreTypes = new[] { 
                    typeof(object), typeof(Enumerable), typeof(Assembly), typeof(List<>), 
                    typeof(Math), typeof(CodeRunner), typeof(JsonSerializer),
                    typeof(Microsoft.CSharp.RuntimeBinder.Binder),
                    typeof(System.Runtime.CompilerServices.DynamicAttribute),
                    typeof(System.Linq.Expressions.Expression),
                    typeof(System.Dynamic.DynamicObject)
                };
                var coreRefs = coreTypes.Select(t => MetadataReference.CreateFromFile(t.Assembly.Location)).ToList();

                string engineDir = Path.GetDirectoryName(typeof(CodeRunner).Assembly.Location) ?? "";
                string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
                foreach (var dllName in extraDlls)
                {
                    string dllPath = Path.Combine(engineDir, dllName);
                    if (File.Exists(dllPath)) coreRefs.Add(MetadataReference.CreateFromFile(dllPath));
                }

                var options = ScriptOptions.Default
                    .WithReferences(coreRefs.Concat(revitRefs))
                    .WithImports(
                        "System", "System.IO", "System.Linq", "System.Collections.Generic", "System.Text.Json", 
                        "Microsoft.CSharp",
                        "Autodesk.Revit.DB", 
                        "Autodesk.Revit.DB.Architecture", 
                        "Autodesk.Revit.DB.Structure", 
                        "Autodesk.Revit.DB.Mechanical",
                        "Autodesk.Revit.DB.Plumbing",
                        "Autodesk.Revit.DB.Electrical",
                        "Autodesk.Revit.UI", 
                        "CoreScript.Engine.Globals", "CoreScript.Engine.Runtime",
                        "SixLabors.ImageSharp", "SixLabors.ImageSharp.Processing", "SixLabors.ImageSharp.PixelFormats",
                        "RestSharp", "MiniExcelLibs", 
                        "MathNet.Numerics", "MathNet.Numerics.LinearAlgebra", "MathNet.Numerics.Statistics"
                    )
                    .WithFilePath(topLevelScriptName);

                var script = CSharpScript.Create(finalScriptCode, options);
                var state = script.RunAsync().Result;

                context.Println("✅ Code executed successfully | " + timestamp);
                var result = ExecutionResult.Success("✅ Code executed successfully", state.ReturnValue);
                result.PrintLog = context.PrintLog.ToList();
                result.ScriptName = topLevelScriptName;

                // Structured output handling...
                var contextType = context.GetType();
                var structuredOutputLogProperty = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (structuredOutputLogProperty != null)
                {
                    var log = structuredOutputLogProperty.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null) foreach (var item in log) result.StructuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item));
                }

                return result;
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 CodeRunner Exception: " + ex.ToString());
                var failureResult = ExecutionResult.Failure($"❌ Error: {ex.Message}", context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName;
                return failureResult;
            }
            finally
            {
                ExecutionGlobals.ClearContext();
                alc.Unload();
            }
        }

        public ExecutionResult ExecuteBinary(byte[] assemblyBytes, string parametersJson, ICoreScriptContext context)
        {
            var alc = new AssemblyLoadContext("RevitScriptBinary", isCollectible: true);
            try
            {
                var parameters = MapParameters(parametersJson, out var richParams);
                if (richParams.Count > 0) HardenParameters(parameters, richParams);
                ExecutionGlobals.SetContext(new ExecutionGlobals(context, parameters));

                using (var ms = new MemoryStream(assemblyBytes))
                {
                    var assembly = alc.LoadFromStream(ms);
                    var entryType = assembly.GetTypes().FirstOrDefault(t => t.Name.Contains("Submission#0")) ?? assembly.GetTypes().FirstOrDefault();
                    if (entryType == null) return ExecutionResult.Failure("Entry type not found.");

                    var factoryMethod = entryType.GetMethod("<Factory>", BindingFlags.Public | BindingFlags.Static);
                    if (factoryMethod != null)
                    {
                        var resultTask = factoryMethod.Invoke(null, new object[] { new object[] { null, null } }) as Task;
                        resultTask?.GetAwaiter().GetResult();
                    }

                    var execResult = ExecutionResult.Success("✅ Success", null);
                    execResult.PrintLog = context.PrintLog.ToList();
                    return execResult;
                }
            }
            catch (Exception ex)
            {
                return ExecutionResult.Failure($"❌ Binary error: {ex.Message}", context.PrintLog.ToArray());
            }
            finally { ExecutionGlobals.ClearContext(); alc.Unload(); }
        }

        public byte[] CompileToBytes(string userCode)
        {
            // Placeholder: implementation omitted for brevity but preserved in local logic
            return Array.Empty<byte>(); 
        }

        private Dictionary<string, object> MapParameters(string json, out List<ScriptParameter> rich)
        {
            var dict = new Dictionary<string, object>();
            rich = new List<ScriptParameter>();
            if (string.IsNullOrWhiteSpace(json)) return dict;
            try
            {
                using (JsonDocument doc = JsonDocument.Parse(json))
                {
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        rich = JsonSerializer.Deserialize<List<ScriptParameter>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? rich;
                        foreach (var p in rich) if (!string.IsNullOrEmpty(p.Name)) dict[p.Name] = ConvertJsonElement(p.Value);
                    }
                    else
                    {
                        var raw = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
                        foreach (var kv in raw) if (!string.IsNullOrEmpty(kv.Key)) dict[kv.Key] = kv.Value is JsonElement e ? ConvertJsonElement(e) : kv.Value;
                    }
                }
            }
            catch { }
            return dict;
        }

        private void HardenParameters(Dictionary<string, object> parameters, List<ScriptParameter> scriptParams)
        {
            if (scriptParams == null) return;
            foreach (var p in scriptParams)
            {
                if (!parameters.ContainsKey(p.Name) || parameters[p.Name] == null)
                {
                    if (!string.IsNullOrEmpty(p.DefaultValueJson))
                    {
                        try {
                            if (p.Type == "number") parameters[p.Name] = double.Parse(p.DefaultValueJson);
                            else if (p.Type == "boolean") parameters[p.Name] = p.DefaultValueJson.ToLower() == "true";
                            else parameters[p.Name] = p.DefaultValueJson.Trim('"');
                        } catch {}
                    }
                }

                // 2. Apply Unit Conversion (Dynamic V3 Engine)
                if (parameters.TryGetValue(p.Name, out var val) && !string.IsNullOrEmpty(p.Unit))
                {
                    try {
                        double d = Convert.ToDouble(val);
                        ForgeTypeId unitTypeId = null;
                        
                        // Universal Mapping Logic (Handles common abbreviations dynamically)
                        string u = p.Unit.ToLower().Trim();
                        if (u == "mm") unitTypeId = UnitTypeId.Millimeters;
                        else if (u == "cm") unitTypeId = UnitTypeId.Centimeters;
                        else if (u == "m") unitTypeId = UnitTypeId.Meters;
                        else if (u == "ft") unitTypeId = UnitTypeId.Feet;
                        else if (u == "in" || u == "inch") unitTypeId = UnitTypeId.Inches;
                        else if (u == "m2" || u == "sqm") unitTypeId = UnitTypeId.SquareMeters;
                        else if (u == "ft2" || u == "sqft") unitTypeId = UnitTypeId.SquareFeet;
                        else if (u == "m3" || u == "cum") unitTypeId = UnitTypeId.CubicMeters;
                        else if (u == "ft3" || u == "cuft") unitTypeId = UnitTypeId.CubicFeet;
                        
                        // Fallback: If it looks like a UnitTypeId string directly (e.g. "UT_Length")
                        if (unitTypeId == null)
                        {
                             // We could search ForgeTypeIds here if needed for expert users
                        }

                        if (unitTypeId != null)
                        {
                            parameters[p.Name] = UnitUtils.ConvertToInternalUnits(d, unitTypeId);
                            FileLogger.Log($"[CodeRunner] Converted parameter '{p.Name}' from {d} {u} to Internal Units.");
                        }
                    } catch {}
                }
            }
        }

        private object ConvertJsonElement(JsonElement element)
        {
            switch (element.ValueKind) {
                case JsonValueKind.String: return element.GetString();
                case JsonValueKind.Number: return element.TryGetInt32(out int i) ? i : element.GetDouble();
                case JsonValueKind.True: return true;
                case JsonValueKind.False: return false;
                case JsonValueKind.Array: return element.EnumerateArray().Select(ConvertJsonElement).ToList();
                default: return element.GetRawText();
            }
        }

        private static bool IsManagedAssembly(string path) { try { AssemblyName.GetAssemblyName(path); return true; } catch { return false; } }
    }

    public class ParameterRewriter : CSharpSyntaxRewriter
    {
        private readonly Dictionary<string, object> _parameters;
        public ParameterRewriter(Dictionary<string, object> parameters) { _parameters = parameters; }

        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            var parent = node.Parent;
            bool isInsideParams = false;
            while (parent != null) { if (parent is ClassDeclarationSyntax c && c.Identifier.Text == "Params") { isInsideParams = true; break; } parent = parent.Parent; }

            if (!isInsideParams || !node.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword))) return base.VisitPropertyDeclaration(node);

            var paramName = node.Identifier.Text;
            if (_parameters.TryGetValue(paramName, out _))
            {
                var pullExpression = SyntaxFactory.ParseExpression($"CoreScript.Engine.Globals.ExecutionGlobals.Get<{node.Type}>(\"{paramName}\")");
                
                // CRITICAL V3 FIX: Some trivia (like #endregion) must start on a NEW LINE.
                // We clear the property's trailing trivia and attach it to the semicolon AFTER a newline.
                var originalTrailingTrivia = node.GetTrailingTrivia();
                
                var updatedNode = node.WithInitializer(SyntaxFactory.EqualsValueClause(pullExpression).WithLeadingTrivia(SyntaxFactory.Space))
                                    .WithTrailingTrivia(SyntaxFactory.TriviaList()) // Clear from property
                                    .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)
                                        .WithTrailingTrivia(SyntaxFactory.TriviaList(SyntaxFactory.CarriageReturnLineFeed).Concat(originalTrailingTrivia)));
                
                return updatedNode;
            }
            
            return base.VisitPropertyDeclaration(node);
        }
    }

    internal class RunnerLogger : ILogger { public void Log(string m, LogLevel l) => FileLogger.Log(m, l); public void LogError(string m) => FileLogger.LogError(m); }
}