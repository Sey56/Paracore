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
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class CodeRunner : ICodeRunner
    {
        public ExecutionResult Execute(string scriptContent, string parametersJson, IRScriptContext context)
            => Execute(scriptContent, parametersJson, context, null);

        public ExecutionResult Execute(string userCode, string parametersJson, IRScriptContext context, object? customHost)
        {
            var alc = new AssemblyLoadContext("RevitScript", isCollectible: true);
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);

            FileLogger.Log("🟢 Starting CodeRunner.Execute");

            try
            {
                var parameters = new Dictionary<string, object>();
                if (!string.IsNullOrWhiteSpace(parametersJson))
                {
                    try
                    {
                        string unescapedParametersJson = parametersJson;
                        if (parametersJson.StartsWith("\"") && parametersJson.EndsWith("\""))
                        {
                            unescapedParametersJson = JsonDocument.Parse(parametersJson).RootElement.GetString();
                        }

                        var paramJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                        var paramList = JsonSerializer.Deserialize<List<ScriptParameter>>(unescapedParametersJson, paramJsonOptions);
                        if (paramList != null)
                        {
                            foreach (var param in paramList)
                            {
                                string name = param.Name;
                                object value = null;
                                switch (param.Type)
                                {
                                    case "string": value = param.Value.GetString(); break;
                                    case "number":
                                        if (param.Value.ValueKind == JsonValueKind.Number)
                                        {
                                            if (param.Value.TryGetInt32(out int intVal)) value = intVal;
                                            else if (param.Value.TryGetDouble(out double dblVal)) value = dblVal;
                                        }
                                        else if (param.Value.ValueKind == JsonValueKind.String && double.TryParse(param.Value.GetString(), out double parsedDbl)) value = parsedDbl;
                                        break;
                                    case "boolean":
                                        if (param.Value.ValueKind == JsonValueKind.True || param.Value.ValueKind == JsonValueKind.False) value = param.Value.GetBoolean();
                                        else if (param.Value.ValueKind == JsonValueKind.String && bool.TryParse(param.Value.GetString(), out bool parsedBool)) value = parsedBool;
                                        break;
                                    default: value = param.Value.ToString(); break;
                                }
                                if (name != null && value != null) parameters[name] = value;
                            }
                        }
                    }
                    catch (JsonException ex)
                    {
                        FileLogger.LogError($"[CodeRunner] JSON deserialization error for parameters: {ex.Message}");
                    }
                }

                List<ScriptFile> scriptFiles = new List<ScriptFile>();
                try
                {
                    var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(userCode, scriptJsonOptions);
                    if (scriptFiles == null || !scriptFiles.Any())
                        return ExecutionResult.Failure("No script files found in the incoming JSON.");
                }
                catch (JsonException ex)
                {
                    return ExecutionResult.Failure($"Error deserializing script content: {ex.Message}");
                }

                var topLevelScriptFile = ScriptParser.IdentifyTopLevelScript(scriptFiles);
                var topLevelScriptName = topLevelScriptFile?.FileName ?? "Unknown Script";
                var combinedScriptContent = SemanticCombinator.Combine(scriptFiles);
                SyntaxTree tree = CSharpSyntaxTree.ParseText(combinedScriptContent);
                var rewriter = new ParameterRewriter(parameters);
                SyntaxNode newRoot = rewriter.Visit(tree.GetRoot());
                string modifiedUserCode = newRoot.ToFullString();
                var finalScriptCode = "using static CoreScript.Engine.Globals.ScriptApi;\n" + modifiedUserCode;

                var executionGlobals = new ExecutionGlobals(context, parameters ?? new Dictionary<string, object>());
                ExecutionGlobals.SetContext(executionGlobals);

                string revitInstallPath = @"C:\Program Files\Autodesk\Revit 2025";
                if (!Directory.Exists(revitInstallPath))
                    return ExecutionResult.Failure($"Revit installation directory not found at {revitInstallPath}");

                var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                var revitRefs = revitDllPaths.Where(IsManagedAssembly).Select(path => MetadataReference.CreateFromFile(path)).ToList();
                var coreTypes = new[] { typeof(object), typeof(Enumerable), typeof(Assembly), typeof(List<>), typeof(Math), typeof(CodeRunner), typeof(JsonSerializer) };
                var coreRefs = coreTypes.Select(t => MetadataReference.CreateFromFile(t.Assembly.Location));

                var options = ScriptOptions.Default
                    .WithReferences(coreRefs.Concat(revitRefs))
                    .WithImports("System", "System.IO", "System.Linq", "System.Collections.Generic", "System.Text.Json", "System.Text.Json.Serialization", "Autodesk.Revit.DB", "Autodesk.Revit.UI", "CoreScript.Engine.Globals", "CoreScript.Engine.Runtime");

                var script = CSharpScript.Create(finalScriptCode, options);
                var state = script.RunAsync().Result;

                string successMessage = $"✅ Code executed successfully | {timestamp}";
                context.Println(successMessage);
                FileLogger.Log(successMessage);

                var result = ExecutionResult.Success(successMessage, state.ReturnValue);
                result.ScriptName = topLevelScriptName;
                return result;
            }
            catch (CompilationErrorException ex)
            {
                var errs = ex.Diagnostics.Select(d => d.ToString()).ToArray();
                string failureMessage = $"❌ Script failed to compile | {timestamp}";
                context.Println(failureMessage);
                foreach (var err in errs) context.Println($"[ERROR] {err}");
                
                var failureResult = ExecutionResult.Failure(failureMessage, errs);
                failureResult.ScriptName = "Unknown Script";
                return failureResult;
            }
            catch (AggregateException ex)
            {
                var errs = ex.InnerExceptions.Select(e => e.ToString()).ToArray();
                string failureMessage = $"❌ Script execution failed | {timestamp}";
                context.Println(failureMessage);
                foreach (var err in errs) context.Println($"[ERROR] {err}");

                var failureResult = ExecutionResult.Failure(failureMessage, errs);
                failureResult.ScriptName = "Unknown Script";
                return failureResult;
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 Internal engine exception: " + ex.ToString());

                bool isEngineError = ex is NullReferenceException || ex is ReflectionTypeLoadException || ex is InvalidOperationException || ex.Message.Contains("Roslyn") || ex.Message.Contains("SyntaxTree") || ex.Message.Contains("CSharpScript");

                string failureMessage = isEngineError 
                    ? $"⚠️ Internal engine error occurred | {timestamp}" 
                    : $"❌ Runtime error: {ex.Message} | {timestamp}";
                
                context.Println(failureMessage);
                return ExecutionResult.Failure(failureMessage, new[] { ex.Message });
            }
            finally
            {
                ExecutionGlobals.ClearContext();
                alc.Unload();
                FileLogger.Log("🟣 Unloaded script AssemblyLoadContext and cleared context.");
            }
        }

        private static bool IsManagedAssembly(string path)
        {
            try { AssemblyName.GetAssemblyName(path); return true; }
            catch { return false; }
        }
    }

    public class ParameterRewriter : CSharpSyntaxRewriter
    {
        private readonly Dictionary<string, object> _parameters;
        public ParameterRewriter(Dictionary<string, object> parameters) { _parameters = parameters; }

        public override SyntaxNode VisitVariableDeclarator(VariableDeclaratorSyntax node)
        {
            if (node.Initializer != null && _parameters.TryGetValue(node.Identifier.Text, out object newValue))
            {
                ExpressionSyntax newLiteral = CreateLiteralExpression(newValue);
                return node.WithInitializer(SyntaxFactory.EqualsValueClause(newLiteral).WithLeadingTrivia(node.Initializer.EqualsToken.LeadingTrivia).WithTrailingTrivia(node.Initializer.Value.GetTrailingTrivia()));
            }
            return base.VisitVariableDeclarator(node);
        }

        private ExpressionSyntax CreateLiteralExpression(object value)
        {
            return value switch
            {
                string s => SyntaxFactory.LiteralExpression(SyntaxKind.StringLiteralExpression, SyntaxFactory.Literal(s)),
                bool b => SyntaxFactory.LiteralExpression(b ? SyntaxKind.TrueLiteralExpression : SyntaxKind.FalseLiteralExpression),
                int i => SyntaxFactory.LiteralExpression(SyntaxKind.NumericLiteralExpression, SyntaxFactory.Literal(i)),
                double d => SyntaxFactory.LiteralExpression(SyntaxKind.NumericLiteralExpression, SyntaxFactory.Literal(d)),
                _ => SyntaxFactory.LiteralExpression(SyntaxKind.NullLiteralExpression),
            };
        }
    }
}