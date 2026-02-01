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

            string topLevelScriptName = "Unknown Script"; // Initialize here so it's accessible in catch blocks

            try
            {
                var parameters = MapParameters(parametersJson, context, out var richParams);
                
                // DEBUG: Log all parameters that CodeRunner thinks it has
                FileLogger.Log($"[CodeRunner] Final Parameters Dictionary Keys: {string.Join(", ", parameters.Keys)}");
                if (parameters.ContainsKey("__script_name__"))
                {
                    FileLogger.Log($"[CodeRunner] Found magic parameter __script_name__: {parameters["__script_name__"]}");
                }
                foreach (var kvp in parameters)
                {
                    FileLogger.Log($"[CodeRunner] Param '{kvp.Key}' = {kvp.Value} (Type: {kvp.Value?.GetType().Name ?? "null"})");
                }

                // V2.2.0: Prioritize passed "__script_name__" parameter for dashboard reporting (e.g. Folder Name)
                if (parameters.ContainsKey("__script_name__"))
                {
                    var forcedName = parameters["__script_name__"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(forcedName))
                    {
                        topLevelScriptName = forcedName;
                        FileLogger.Log($"[CodeRunner] Set topLevelScriptName to: {topLevelScriptName}");
                    }
                    parameters.Remove("__script_name__"); // Don't pollute script scope
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
                
                // If we haven't forced a name yet, try to get it from the file
                if (topLevelScriptName == "Unknown Script")
                {
                    topLevelScriptName = topLevelScriptFile?.FileName ?? "Unknown Script";
                }

                var combinedScriptContent = SemanticCombinator.Combine(scriptFiles);
                
                // V2 FIX: Ensure defaults (with unit conversions) are applied
                List<ScriptParameter> extractedParams = new List<ScriptParameter>();
                try 
                {
                    var extractor = new ParameterExtractor(new RunnerLogger());
                    extractedParams = extractor.ExtractParameters(combinedScriptContent);
                    
                    // Combine richParams (from UI) with extractedParams (from source)
                    // If we have richParams, we favor them (as they are the definitive source of truth for units/defaults)
                    var finalScriptParams = richParams.Count > 0 ? richParams : extractedParams;
                    HardenParameters(parameters, finalScriptParams, context);
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[CodeRunner] Failed to harden parameters: {ex.Message}");
                }

                SyntaxTree tree = CSharpSyntaxTree.ParseText(combinedScriptContent);

                // Set Globals Context EARLY so Rewriters can access Doc/Context
                var executionGlobals = new ExecutionGlobals(context, parameters ?? new Dictionary<string, object>());
                ExecutionGlobals.SetContext(executionGlobals);

                var rewriter = new ParameterRewriter(parameters);
                SyntaxNode newRoot = rewriter.Visit(tree.GetRoot());
                
                // Apply timeout rewriter to inject timeout checks into all loops
                var timeoutRewriter = new TimeoutRewriter();
                newRoot = timeoutRewriter.Visit(newRoot);
                
                string modifiedUserCode = newRoot.ToFullString();
                
                var finalScriptCode = "#line hidden\nusing static CoreScript.Engine.Globals.ScriptApi;\n#line default\n" + modifiedUserCode;

                // DEBUG: Dump the compiled script to verify #line directives and rewriter output
                try
                {
                    var debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CompiledScript.cs");
                    Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                    File.WriteAllText(debugPath, finalScriptCode);
                    FileLogger.Log($"💾 Dumped compiled script to {debugPath}");
                }
                catch (Exception dumpEx) { FileLogger.LogError($"Failed to dump script: {dumpEx.Message}"); }

                // Context is already set above

                string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
                if (!Directory.Exists(revitInstallPath))
                    return ExecutionResult.Failure($"Revit installation directory not found at {revitInstallPath}");

                var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                var revitRefs = revitDllPaths.Where(IsManagedAssembly).Select(path => MetadataReference.CreateFromFile(path)).ToList();
                var coreTypes = new[] { 
                    typeof(object), 
                    typeof(Enumerable), 
                    typeof(Assembly), 
                    typeof(List<>), 
                    typeof(Math), 
                    typeof(CodeRunner), 
                    typeof(JsonSerializer),
                    typeof(Microsoft.CSharp.RuntimeBinder.Binder), // Microsoft.CSharp
                    typeof(System.Runtime.CompilerServices.DynamicAttribute), // System.Runtime
                    typeof(System.Linq.Expressions.Expression), // System.Linq.Expressions
                    typeof(System.Dynamic.DynamicObject) // System.Dynamic.Runtime
                };
                var coreRefs = coreTypes.Select(t => MetadataReference.CreateFromFile(t.Assembly.Location)).ToList();

                // Dynamic Addition of External Libraries (Safe Reference Strategy)
                // We add these by Path to avoid forcing an immediate, potentially conflicting assembly load 
                // in the engine's default context before the script starts.
                string engineDir = Path.GetDirectoryName(typeof(CodeRunner).Assembly.Location) ?? "";
                string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
                
                foreach (var dllName in extraDlls)
                {
                    string dllPath = Path.Combine(engineDir, dllName);
                    if (File.Exists(dllPath))
                    {
                        try { coreRefs.Add(MetadataReference.CreateFromFile(dllPath)); }
                        catch (Exception ex) { FileLogger.LogError($"[CodeRunner] Failed to add metadata ref for {dllName}: {ex.Message}"); }
                    }
                }

                var options = ScriptOptions.Default
                    .WithReferences(coreRefs.Concat(revitRefs))
                    .WithImports(
                        "System", 
                        "System.IO", 
                        "System.Linq", 
                        "System.Collections.Generic", 
                        "System.Text.Json", 
                        "System.Text.Json.Serialization", 
                        "Autodesk.Revit.DB", 
                        "Autodesk.Revit.DB.Architecture",
                        "Autodesk.Revit.DB.Structure",
                        "Autodesk.Revit.UI", 
                        "CoreScript.Engine.Globals", 
                        "CoreScript.Engine.Runtime",
                        "SixLabors.ImageSharp",
                        "SixLabors.ImageSharp.Processing",
                        "SixLabors.ImageSharp.PixelFormats",
                        "RestSharp",
                        "MiniExcelLibs",
                        "MathNet.Numerics",
                        "MathNet.Numerics.LinearAlgebra",
                        "MathNet.Numerics.Statistics"
                    )
                    .WithFilePath(topLevelScriptName);

                var script = CSharpScript.Create(finalScriptCode, options);
                var state = script.RunAsync().Result;

                // Check PrintLog for error indicators
                bool scriptReportedError = context.PrintLog.Any(logEntry => logEntry.Contains("❌"));

                if (scriptReportedError)
                {
                    string failureMessage = "❌ Script execution failed due to runtime errors | " + timestamp;
                    FileLogger.Log(failureMessage);
                    // Populate ErrorDetails with the entire PrintLog for frontend display
                    var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                    failureResult.ScriptName = topLevelScriptName;
                    return failureResult;
                }

                string successMessage = "✅ Code executed successfully | " + timestamp;
                context.Println(successMessage);
                FileLogger.Log(successMessage);

                var result = ExecutionResult.Success(successMessage, state.ReturnValue);
                result.PrintLog = context.PrintLog.ToList();
                result.ScriptName = topLevelScriptName;

                // RETRIEVE STRUCTURED OUTPUT (Robust Reflection)
                // We check for "StructuredOutputLog" (Standard) and "ShowOutputLog" (Legacy/TestContext)
                var contextType = context.GetType();
                var structuredOutputLogProperty = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");

                if (structuredOutputLogProperty != null)
                {
                    var structuredOutputLog = structuredOutputLogProperty.GetValue(context);
                    if (structuredOutputLog is System.Collections.IEnumerable enumerable)
                    {
                        foreach (var item in enumerable)
                        {
                            // Avoid double-encoding if the item is already a JSON string
                            string jsonString;
                            if (item is string s) 
                            {
                                jsonString = s;
                            }
                            else 
                            {
                                jsonString = JsonSerializer.Serialize(item);
                            }
                            result.StructuredOutput.Add(jsonString);
                        }
                    }
                }

                var internalDataLogProperty = context.GetType().GetProperty("InternalDataLog");
                if (internalDataLogProperty != null)
                {
                    result.InternalData = internalDataLogProperty.GetValue(context) as string;
                }

                return result;
            }
            catch (CompilationErrorException ex)
            {
                var errs = ex.Diagnostics.Select(d =>
                {
                    var lineSpan = d.Location.GetMappedLineSpan();
                    if (lineSpan.IsValid)
                    {
                        string fileName = Path.GetFileName(lineSpan.Path);
                        int line = lineSpan.StartLinePosition.Line + 1;
                        int character = lineSpan.StartLinePosition.Character + 1;
                        return $"{fileName}({line},{character}): {d.Severity.ToString().ToLower()} {d.Id}: {d.GetMessage()}";
                    }
                    return d.ToString(); 
                }).ToArray();

                string failureMessage = "❌ Script failed to compile | " + timestamp;
                
                // Log to UI
                foreach (var err in errs) context.Println($"[ERROR] {err}");
                
                // Log to File (New)
                FileLogger.LogError(failureMessage);
                foreach (var err in errs) FileLogger.LogError($"[COMPILATION] {err}");
                
                var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName ?? "Unknown Script";
                return failureResult;
            }
            catch (AggregateException ex) when (ex.InnerException is TimeoutException)
            {
                // Handle timeout wrapped in AggregateException
                string failureMessage = ex.InnerException.Message + " | " + timestamp;
                FileLogger.Log(failureMessage);

                var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName ?? "Unknown Script";
                return failureResult;
            }
            catch (TimeoutException ex)
            {
                // Handle timeout directly
                string failureMessage = ex.Message + " | " + timestamp;
                FileLogger.Log(failureMessage);

                var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName ?? "Unknown Script";
                return failureResult;
            }
            catch (AggregateException ex)
            {
                // Extract the root cause message for clear error reporting
                string rootMessage = GetRootExceptionMessage(ex);
                string failureMessage = $"❌ Script execution failed: {rootMessage} | {timestamp}";
                
                // Print standardized runtime errors
                foreach (var innerEx in ex.InnerExceptions)
                {
                    context.Println(FormatRuntimeError(innerEx));
                }

                var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName ?? "Unknown Script";
                return failureResult;
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 Internal engine exception: " + ex.ToString());
                string failureMessage = $"❌ Internal engine error: {ex.Message} | {timestamp}";
                var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName ?? "Unknown Script";
                return failureResult;
            }
            finally
            {
                ExecutionGlobals.ClearContext();
                alc.Unload();
                FileLogger.Log("🟣 Unloaded script AssemblyLoadContext and cleared context.");
            }
        }

        public ExecutionResult ExecuteBinary(byte[] assemblyBytes, string parametersJson, ICoreScriptContext context)
        {
            var alc = new AssemblyLoadContext("RevitScriptBinary", isCollectible: true);
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);

            try
            {
                var parameters = MapParameters(parametersJson, context, out var richParams);
                
                // V2 FIX: Apply hardening (Units/Defaults) to binary execution too
                if (richParams.Count > 0)
                {
                    HardenParameters(parameters, richParams, context);
                }
                
                // Set Globals Context
                var executionGlobals = new ExecutionGlobals(context, parameters);
                ExecutionGlobals.SetContext(executionGlobals);

                using (var ms = new MemoryStream(assemblyBytes))
                {
                    var assembly = alc.LoadFromStream(ms);
                    
                    // CSharpScript.Create compiles into a Submission class with a special factory method
                    // The entry type is typically named "Submission#0"
                    var entryType = assembly.GetTypes().FirstOrDefault(t => t.Name.Contains("Submission#0")) 
                                    ?? assembly.GetTypes().FirstOrDefault();

                    if (entryType == null) return ExecutionResult.Failure("Could not find entry type in compiled assembly.");

                    // For Roslyn scripts, use the <Factory> method which takes globals as the first parameter
                    // The Factory returns a Task<object> that represents the script execution
                    try
                    {
                        var factoryMethod = entryType.GetMethod("<Factory>", BindingFlags.Public | BindingFlags.Static);
                        if (factoryMethod != null)
                        {
                            FileLogger.Log("[CodeRunner] Found <Factory> method. Invoking script...");
                            var factoryParams = factoryMethod.GetParameters();
                            object[] invokeArgs = factoryParams.Length > 0 ? new object[] { new object[] { null, null } } : null;
                            var resultTask = factoryMethod.Invoke(null, invokeArgs) as Task;
                            if (resultTask != null)
                            {
                                resultTask.GetAwaiter().GetResult(); // Synchronously wait for completion
                            }
                            FileLogger.Log("[CodeRunner] script execution completed via <Factory>.");
                        }
                        else
                        {
                            FileLogger.LogError("[CodeRunner] <Factory> method NOT FOUND in entry type: " + entryType.FullName);
                            // Fallback to activator if factory not found
                            var method = entryType.GetMethod("<Initialize>", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static)
                                             ?? entryType.GetMethod("Execute", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);

                            if (method == null) return ExecutionResult.Failure("Could not find execution entry point in assembly.");

                            if (method.IsStatic)
                            {
                                method.Invoke(null, null);
                            }
                            else
                            {
                                // For instance methods, we need the constructor that takes (object[] globals)
                                var ctor = entryType.GetConstructors().FirstOrDefault();
                                if (ctor == null) return ExecutionResult.Failure("Could not find constructor for script type.");
                                
                                var ctorParams = ctor.GetParameters();
                                object instance;
                                if (ctorParams.Length > 0)
                                {
                                    // Create with empty globals array
                                    instance = ctor.Invoke(new object[] { new object[] { null, null } });
                                }
                                else
                                {
                                    instance = Activator.CreateInstance(entryType);
                                }
                                method.Invoke(instance, null);
                            }
                        }

                        string successMessage = "✅ Proprietary tool executed successfully | " + timestamp;
                        context.Println(successMessage);
                        
                        var execResult = ExecutionResult.Success(successMessage, null);
                        execResult.PrintLog = context.PrintLog.ToList();
                        return execResult;
                    }
                    catch (TargetInvocationException ex)
                    {
                        var innerEx = ex.InnerException ?? ex;
                        FileLogger.LogError("🛑 Binary execution TargetInvocationException: " + innerEx.ToString());
                        return ExecutionResult.Failure($"❌ Binary execution error: {innerEx.Message} | {timestamp}", context.PrintLog.ToArray());
                    }
                    catch (Exception ex)
                    {
                        FileLogger.LogError("🛑 Binary execution General Exception: " + ex.ToString());
                        return ExecutionResult.Failure($"❌ Binary execution error: {ex.Message} | {timestamp}", context.PrintLog.ToArray());
                    }
                }
            }
            finally
            {
                ExecutionGlobals.ClearContext();
                alc.Unload();
            }
        }

        public byte[] CompileToBytes(string userCode)
        {
            try
            {
                FileLogger.Log("🟢 Starting CodeRunner.CompileToBytes");

                List<ScriptFile> scriptFiles = new List<ScriptFile>();
                try
                {
                    var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(userCode, scriptJsonOptions);
                    if (scriptFiles == null || !scriptFiles.Any())
                        throw new Exception("No script files found in the incoming JSON.");
                }
                catch (JsonException ex)
                {
                    throw new Exception($"Error deserializing script content: {ex.Message}");
                }

                var topLevelScriptFile = ScriptParser.IdentifyTopLevelScript(scriptFiles);
                var topLevelScriptName = topLevelScriptFile?.FileName ?? "ProprietaryTool";

                var combinedScriptContent = SemanticCombinator.Combine(scriptFiles);
                
                SyntaxTree tree = CSharpSyntaxTree.ParseText(combinedScriptContent);
                
                // For proprietary tools, we use a special rewriter that pulls from ExecutionGlobals
                var pullingRewriter = new ParameterPullingRewriter();
                SyntaxNode newRoot = pullingRewriter.Visit(tree.GetRoot());
                
                var timeoutRewriter = new TimeoutRewriter();
                newRoot = timeoutRewriter.Visit(newRoot);
                
                string modifiedCode = newRoot.ToFullString();
                var finalScriptCode = "#line hidden\nusing static CoreScript.Engine.Globals.ScriptApi;\n#line default\n" + modifiedCode;

                // --- DEBUG: Log the generated code to verify the rewriter is working ---
                try {
                    var debugDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "debug");
                    if (!Directory.Exists(debugDir)) Directory.CreateDirectory(debugDir);
                    File.WriteAllText(Path.Combine(debugDir, "LastBuiltToolCode.cs"), finalScriptCode);
                    FileLogger.Log($"[CodeRunner] Generated .ptool code saved to {debugDir}\\LastBuiltToolCode.cs");
                } catch { }
                // --- END DEBUG ---

                string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
                var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                var revitRefs = revitDllPaths.Where(IsManagedAssembly).Select(path => MetadataReference.CreateFromFile(path)).ToList();
                var coreTypes = new[] { 
                    typeof(object), 
                    typeof(Enumerable), 
                    typeof(Assembly), 
                    typeof(List<>), 
                    typeof(Math), 
                    typeof(CodeRunner), 
                    typeof(JsonSerializer),
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
                    if (File.Exists(dllPath))
                    {
                        try { coreRefs.Add(MetadataReference.CreateFromFile(dllPath)); }
                        catch { }
                    }
                }

                var options = ScriptOptions.Default
                    .WithReferences(coreRefs.Concat(revitRefs))
                    .WithImports(
                        "System", 
                        "System.IO", 
                        "System.Linq", 
                        "System.Collections.Generic", 
                        "System.Text.Json", 
                        "System.Text.Json.Serialization", 
                        "Autodesk.Revit.DB", 
                        "Autodesk.Revit.DB.Architecture",
                        "Autodesk.Revit.DB.Structure",
                        "Autodesk.Revit.UI", 
                        "CoreScript.Engine.Globals", 
                        "CoreScript.Engine.Runtime",
                        "SixLabors.ImageSharp",
                        "SixLabors.ImageSharp.Processing",
                        "SixLabors.ImageSharp.PixelFormats",
                        "RestSharp",
                        "MiniExcelLibs",
                        "MathNet.Numerics",
                        "MathNet.Numerics.LinearAlgebra",
                        "MathNet.Numerics.Statistics"
                    )
                    .WithFilePath(topLevelScriptName);

                var script = CSharpScript.Create(finalScriptCode, options);
                var compilation = script.GetCompilation();

                using (var ms = new MemoryStream())
                {
                    var result = compilation.Emit(ms);
                    if (!result.Success)
                    {
                        var errors = string.Join("\n", result.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Select(d => d.ToString()));
                        throw new Exception("Compilation failed:\n" + errors);
                    }
                    return ms.ToArray();
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 CompileToBytes exception: " + ex.ToString());
                throw;
            }
        }

        private Dictionary<string, object> MapParameters(string parametersJson, ICoreScriptContext context, out List<ScriptParameter> richParams)
        {
            var parameters = new Dictionary<string, object>();
            richParams = new List<ScriptParameter>();

            if (string.IsNullOrWhiteSpace(parametersJson))
            {
                return parameters;
            }

            try
            {
                using (JsonDocument doc = JsonDocument.Parse(parametersJson))
                {
                    var root = doc.RootElement;
                    if (root.ValueKind == JsonValueKind.Array)
                    {
                        // RICH FORMAT: List<ScriptParameter>
                        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                        richParams = JsonSerializer.Deserialize<List<ScriptParameter>>(parametersJson, options) ?? richParams;
                        
                        foreach (var p in richParams)
                        {
                            // CRITICAL FIX: Skip parameters with null/empty names
                            if (string.IsNullOrEmpty(p.Name)) continue;
                            // CRITICAL FIX: Convert JsonElement to primitive BEFORE storing in dictionary
                            parameters[p.Name] = ConvertJsonElement(p.Value);
                        }
                    }
                    else if (root.ValueKind == JsonValueKind.Object)
                    {
                        // FLAT FORMAT: Dictionary<string, object>
                        var rawParams = JsonSerializer.Deserialize<Dictionary<string, object>>(parametersJson) ?? new Dictionary<string, object>();
                        foreach (var kvp in rawParams)
                        {
                            // Skip null keys
                            if (string.IsNullOrEmpty(kvp.Key)) continue;
                            if (kvp.Value is JsonElement element)
                            {
                                parameters[kvp.Key] = ConvertJsonElement(element);
                            }
                            else
                            {
                                parameters[kvp.Key] = kvp.Value;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 Error deserializing parameters: " + ex.Message);
            }
            
            return parameters;
        }

        private void HardenParameters(Dictionary<string, object> parameters, List<ScriptParameter> scriptParams, ICoreScriptContext context)
        {
            if (scriptParams == null || scriptParams.Count == 0) return;
            
            // Try to get Document from Global Context for Reference Hydration
            Autodesk.Revit.DB.Document doc = null;
            try 
            {
               // Access the static property safely via reflection if needed, or direct if visible
               // ExecutionGlobals is internal but we are in same assembly core. 
               // Actually ExecutionGlobals is in CoreScript.Engine.Globals namespace.
               // We need the instance associated with the current thread or passed Context.
               // CodeRunner sets ExecutionGlobals.SetContext(executionGlobals) BEFORE executing script,
               // but AFTER HardenParameters?
               // Wait, look at Execute():
               // 1. MapParameters -> HardenParameters
               // 2. new ExecutionGlobals(...)
               // So ExecutionGlobals is NOT set yet.
               
               // But 'context' IS available. If context has Doc property...
               var docProp = context.GetType().GetProperty("Doc");
               if (docProp != null) doc = docProp.GetValue(context) as Autodesk.Revit.DB.Document;
            }
            catch {}

            foreach (var p in scriptParams)
            {
                // 1. Fill Defaults if missing
                if (!parameters.ContainsKey(p.Name) || parameters[p.Name] == null)
                {
                    object val = null;
                    if (!string.IsNullOrEmpty(p.DefaultValueJson))
                    {
                        try 
                        {
                            if (p.Type == "number") 
                            {
                                if (double.TryParse(p.DefaultValueJson, out double d)) val = d;
                            }
                            else if (p.Type == "boolean")
                            {
                                val = p.DefaultValueJson.ToLower() == "true";
                            }
                            else if (p.Type == "string")
                            {
                                if (p.DefaultValueJson.StartsWith("\"") && p.DefaultValueJson.EndsWith("\""))
                                    val = JsonSerializer.Deserialize<string>(p.DefaultValueJson);
                                else 
                                    val = p.DefaultValueJson;
                            }
                        }
                        catch {}
                    }
                    if (val != null) parameters[p.Name] = val;
                }

                // 2. Apply Unit Conversion if it's a number and a unit is specified
                if (parameters.TryGetValue(p.Name, out var currentVal) && !string.IsNullOrEmpty(p.Unit))
                {
                    // ROBUST NUMERIC CHECK: Try to get a double regardless of the incoming type (int, long, double)
                    double? dVal = null;
                    try 
                    {
                        dVal = Convert.ToDouble(currentVal);
                    }
                    catch {}

                    if (dVal.HasValue)
                    {
                        Autodesk.Revit.DB.ForgeTypeId unitTypeId = null;
                        switch (p.Unit.ToLower())
                        {
                            case "mm": unitTypeId = Autodesk.Revit.DB.UnitTypeId.Millimeters; break;
                            case "cm": unitTypeId = Autodesk.Revit.DB.UnitTypeId.Centimeters; break;
                            case "m": unitTypeId = Autodesk.Revit.DB.UnitTypeId.Meters; break;
                            case "ft": unitTypeId = Autodesk.Revit.DB.UnitTypeId.Feet; break;
                            case "in": unitTypeId = Autodesk.Revit.DB.UnitTypeId.Inches; break;
                            case "m2":
                            case "sqm": unitTypeId = Autodesk.Revit.DB.UnitTypeId.SquareMeters; break;
                            case "ft2": 
                            case "sqft": unitTypeId = Autodesk.Revit.DB.UnitTypeId.SquareFeet; break;
                            case "m3":
                            case "cum": unitTypeId = Autodesk.Revit.DB.UnitTypeId.CubicMeters; break;
                            case "ft3":
                            case "cuft": unitTypeId = Autodesk.Revit.DB.UnitTypeId.CubicFeet; break;
                        }

                        if (unitTypeId != null)
                        {
                            parameters[p.Name] = Autodesk.Revit.DB.UnitUtils.ConvertToInternalUnits(dVal.Value, unitTypeId);
                        }
                    }
                }

                // 3. Coerce Types (Fixes String -> Number/Bool mismatches from JSON and Double -> Int precision issues)
                if (parameters.TryGetValue(p.Name, out var valToCoerce) && valToCoerce != null)
                {
                    if (p.Type == "number")
                    {
                        if (p.NumericType == "int")
                        {
                            if (valToCoerce is string sVal && int.TryParse(sVal, out int i))
                            {
                                parameters[p.Name] = i;
                            }
                            else if (valToCoerce is double dVal)
                            {
                                parameters[p.Name] = Convert.ToInt32(Math.Floor(dVal));
                            }
                            else if (valToCoerce is long lVal)
                            {
                                // Ensure it's stored as int if that's what we expect
                                parameters[p.Name] = (int)lVal;
                            }
                        }
                        else // double
                        {
                            if (valToCoerce is string sVal && double.TryParse(sVal, out double d))
                            {
                                parameters[p.Name] = d;
                            }
                            else if (valToCoerce is int iVal)
                            {
                                parameters[p.Name] = (double)iVal;
                            }
                            else if (valToCoerce is long lVal)
                            {
                                parameters[p.Name] = (double)lVal;
                            }
                        }
                    }
                    else if (p.Type == "boolean")
                    {
                        if (valToCoerce is string sVal && bool.TryParse(sVal, out bool b))
                        {
                            parameters[p.Name] = b;
                        }
                    }
                }

                // 4. Hydrate Reference Objects (Universal V3 Support)
                // If the script expects a 'Reference' but we got a 'string' (UniqueId/StableRef) or 'int' (ElementId), convert it.
                if (p.Type == "reference" && doc != null && parameters.TryGetValue(p.Name, out var refVal))
                {
                    // Case A: Input is a String (UniqueId OR Stable Representation)
                    if (refVal is string valStr && !string.IsNullOrEmpty(valStr))
                    {
                        try 
                        {
                            // 1. Try as Element UniqueId first (Common Case)
                            Element element = doc.GetElement(valStr);
                            if (element != null)
                            {
                                parameters[p.Name] = new Autodesk.Revit.DB.Reference(element);
                                FileLogger.Log($"[CodeRunner] Hydrated Reference from UniqueId: {valStr}");
                            }
                            else
                            {
                                // 2. Try as Stable Representation (Face/Edge)
                                try 
                                {
                                    var stableRef = Autodesk.Revit.DB.Reference.ParseFromStableRepresentation(doc, valStr);
                                    if (stableRef != null)
                                    {
                                        parameters[p.Name] = stableRef;
                                        FileLogger.Log($"[CodeRunner] Hydrated Reference from StableRepresentation");
                                    }
                                }
                                catch 
                                {
                                    // Not a stable ref either.
                                     FileLogger.Log($"[WARNING] [CodeRunner] String value '{valStr}' could not be resolved to Element or StableReference.");
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                             FileLogger.LogError($"[CodeRunner] Error resolving string reference: {ex.Message}");
                        }
                    }
                    // Case B: Input is an Integer (ElementId)
                    else if (refVal is int intId)
                    {
                        try 
                        {
                            var element = doc.GetElement(new Autodesk.Revit.DB.ElementId((long)intId));
                            if (element != null) 
                            { 
                                parameters[p.Name] = new Autodesk.Revit.DB.Reference(element);
                                FileLogger.Log($"[CodeRunner] Hydrated Reference from ElementId(int): {intId}");
                            }
                        }
                        catch {}
                    }
                    else if (refVal is long longId)
                    {
                        try 
                        {
                             var element = doc.GetElement(new Autodesk.Revit.DB.ElementId(longId));
                             if (element != null)
                             {
                                 parameters[p.Name] = new Autodesk.Revit.DB.Reference(element);
                                 FileLogger.Log($"[CodeRunner] Hydrated Reference from ElementId(long): {longId}");
                             }
                        }
                        catch {}
                    }
                }
            }
        }

        private object ConvertJsonElement(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.String:
                    return element.GetString();
                case JsonValueKind.Number:
                    if (element.TryGetInt32(out int i)) return i;
                    if (element.TryGetDouble(out double d)) return d;
                    return element.GetRawText();
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                case JsonValueKind.Null:
                    return null;
                case JsonValueKind.Object:
                    return element.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value));
                case JsonValueKind.Array:
                    return element.EnumerateArray().Select(ConvertJsonElement).ToList();
                default:
                    return element.GetRawText();
            }
        }

        /// <summary>
        /// Formats a runtime exception to look like a compiler error: [ERROR] (Line X): Exception: Message
        /// </summary>
        private string FormatRuntimeError(Exception ex)
        {
            // Try to extract line number from stack trace
            string stackTrace = ex.StackTrace ?? "";
            string lineNum = "";
            
            // Regex to find ":line \d+"
            var match = System.Text.RegularExpressions.Regex.Match(stackTrace, @":line (\d+)");
            if (match.Success)
            {
                if (int.TryParse(match.Groups[1].Value, out int rawLine))
                {
                    // Safety check
                    int adjustedLine = Math.Max(1, rawLine - 1);
                    lineNum = string.Format("({0}): ", adjustedLine);
                }
            }

            return string.Format("[ERROR] {0}{1}: {2}", lineNum, ex.GetType().Name, ex.Message);
        }

        /// <summary>
        /// Recursively extracts the innermost exception message to show the root cause clearly.
        /// </summary>
        private string GetRootExceptionMessage(Exception ex)
        {
            // Unwrap AggregateException to get the first inner exception
            if (ex is AggregateException aggEx && aggEx.InnerExceptions.Count > 0)
            {
                return GetRootExceptionMessage(aggEx.InnerExceptions[0]);
            }
            
            // Unwrap TargetInvocationException and other wrappers
            if (ex.InnerException != null)
            {
                return GetRootExceptionMessage(ex.InnerException);
            }
            
            return ex.Message;
        }

        private string GetFilteredExceptionString(Exception ex)
        {
            var lines = ex.ToString().Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var filteredLines = lines.Where(line => 
                !line.Contains("CoreScript.Engine") &&
                !line.Contains("Microsoft.CodeAnalysis") &&
                !line.Contains("System.Runtime.CompilerServices") &&
                !line.Contains("<<Initialize>>") && 
                !line.Contains("System.Threading.Tasks")
            );
            return string.Join(Environment.NewLine, filteredLines);
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

        public ParameterRewriter(Dictionary<string, object> parameters) 
        { 
            _parameters = parameters; 
        }

        private bool IsInsideParamsClass(SyntaxNode node)
        {
            var parent = node.Parent;
            while (parent != null)
            {
                if (parent is ClassDeclarationSyntax classDecl && classDecl.Identifier.Text == "Params")
                    return true;
                parent = parent.Parent;
            }
            return false;
        }

        // V2.5 SECURITY HARDENING: 
        // We have DISABLED VisitVariableDeclarator. 
        // Paracore will NEVER inject values into local variables or top-level fields.
        // The ONLY "Source of Truth" for parameters is public properties in the Params class.

        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            // STRICT ISOLATION: 
            // 1. Must be inside the 'Params' class
            // 2. Must be a Public property (matching the ParameterExtractor rule)
            if (!IsInsideParamsClass(node) || !node.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)))
            {
                return base.VisitPropertyDeclaration(node);
            }

            if (_parameters.TryGetValue(node.Identifier.Text, out object? newValue) && newValue != null)
            {
                // Get the property's type as a string for analysis
                var propertyTypeStr = node.Type.ToString();
                
                // GUARD 1: Handle String Values
                // Prevent injecting strings into incompatible types, UNLESS they represent Enums/Expressions
                if (newValue is string strVal)
                {
                    // Allow empty string ONLY for string types
                    if (string.IsNullOrEmpty(strVal))
                    {
                        if (!propertyTypeStr.Contains("string", StringComparison.OrdinalIgnoreCase))
                        {
                            return base.VisitPropertyDeclaration(node); // Skip
                        }
                    }
                    
                    // Allow injection ONLY if property is explicitly a string or object
                    // This blocks Reference, ElementId, Enum, List<T>, int, double, etc. being assigned a string
                    if (!propertyTypeStr.Contains("string", StringComparison.OrdinalIgnoreCase) && 
                        !propertyTypeStr.Equals("object", StringComparison.OrdinalIgnoreCase))
                    {
                         // Special exception: System.String is valid
                         if (propertyTypeStr != "System.String")
                            return base.VisitPropertyDeclaration(node); // Skip injection
                    }
                }

                // GUARD 2: Handle List Values (Arrays, Lists)
                if (newValue is System.Collections.IList paramListVal)
                {
                    // HARDENING: Coerce list items if target is specific numeric list
                    // This handles cases where JSON sends ["1", "2"] (strings) but target is List<int>
                    
                    if (propertyTypeStr.Contains("List<int>") || propertyTypeStr.Contains("IList<int>"))
                    {
                        var coercedList = new System.Collections.Generic.List<int>();
                        bool coercionSuccess = true;
                        foreach (var item in paramListVal)
                        {
                            if (item is int i) { coercedList.Add(i); }
                            else if (item is long l) { coercedList.Add((int)l); } // dagerous cast but standard for int params
                            else if (item is string s && int.TryParse(s, out int parsed)) { coercedList.Add(parsed); }
                            else { coercionSuccess = false; break; }
                        }
                        
                        if (coercionSuccess && coercedList.Count > 0)
                        {
                            newValue = coercedList; // Replace with strongly typed list for CreateExpression
                        }
                    }
                    else if (propertyTypeStr.Contains("List<double>") || propertyTypeStr.Contains("IList<double>"))
                    {
                        var coercedList = new System.Collections.Generic.List<double>();
                        bool coercionSuccess = true;
                        foreach (var item in paramListVal)
                        {
                            if (item is double d) { coercedList.Add(d); }
                            else if (item is float f) { coercedList.Add(f); }
                            else if (item is int i) { coercedList.Add((double)i); }
                            else if (item is long l) { coercedList.Add((double)l); }
                            else if (item is string s && double.TryParse(s, out double parsed)) { coercedList.Add(parsed); }
                            else { coercionSuccess = false; break; }
                        }
                        
                        if (coercionSuccess && coercedList.Count > 0)
                        {
                            newValue = coercedList; // Replace with strongly typed list
                        }
                    }
                    else if (propertyTypeStr.Contains("List<string>") || propertyTypeStr.Contains("IList<string>"))
                    {
                         // No specific check needed, CreateExpression defaults to string if mixed
                    }
                }
                
                // GUARD 3: Empty List Check
                if (newValue is System.Collections.IList listVal && listVal.Count == 0)
                {
                    return base.VisitPropertyDeclaration(node); // Skip injection
                }

                ExpressionSyntax newLiteral = CreateExpression(newValue);
                var equalsValue = SyntaxFactory.EqualsValueClause(newLiteral);
                
                if (node.Initializer != null)
                {
                    equalsValue = equalsValue
                        .WithLeadingTrivia(node.Initializer.EqualsToken.LeadingTrivia)
                        .WithTrailingTrivia(node.Initializer.Value.GetTrailingTrivia());
                }
                else
                {
                    equalsValue = equalsValue.WithLeadingTrivia(SyntaxFactory.TriviaList(SyntaxFactory.Space));
                }

                var updatedNode = node.WithInitializer(equalsValue);
                
                // If it was an auto-property with no initializer, it needs a semicolon.
                // CRITICAL FIX: We MUST preserve the trailing trivia of the original node 
                // (which likely contains the newline) and attach it to the new semicolon.
                // Otherwise, following preprocessor directives like #endregion get pulled onto this line.
                if (node.SemicolonToken.Kind() == SyntaxKind.None)
                {
                    var trailingTrivia = node.GetTrailingTrivia();
                    updatedNode = updatedNode.WithSemicolonToken(
                        SyntaxFactory.Token(SyntaxKind.SemicolonToken)
                        .WithTrailingTrivia(trailingTrivia));
                }
                
                return updatedNode;
            }
            return base.VisitPropertyDeclaration(node);
        }

        private ExpressionSyntax CreateExpression(object value)
        {
            switch (value)
            {
                case string s:
                    return SyntaxFactory.LiteralExpression(SyntaxKind.StringLiteralExpression, SyntaxFactory.Literal(s));
                case bool b:
                    return SyntaxFactory.LiteralExpression(b ? SyntaxKind.TrueLiteralExpression : SyntaxKind.FalseLiteralExpression);
                case int i:
                    return SyntaxFactory.LiteralExpression(SyntaxKind.NumericLiteralExpression, SyntaxFactory.Literal(i));
                case long l:
                    return SyntaxFactory.LiteralExpression(SyntaxKind.NumericLiteralExpression, SyntaxFactory.Literal(l));
                case double d:
                    return SyntaxFactory.LiteralExpression(SyntaxKind.NumericLiteralExpression, SyntaxFactory.Literal(d));
                case Autodesk.Revit.DB.XYZ xyz:
                    return SyntaxFactory.ParseExpression($"new Autodesk.Revit.DB.XYZ({xyz.X}, {xyz.Y}, {xyz.Z})");
                case Autodesk.Revit.DB.Reference r:
                    // Use the Doc from context to get stable representation during rewriting
                    // In the generated code, we assume 'Doc' is available in scope (Global Script Scope)
                    return SyntaxFactory.ParseExpression($"Autodesk.Revit.DB.Reference.ParseFromStableRepresentation(Doc, \"{r.ConvertToStableRepresentation(ExecutionGlobals.Current.Value.Doc)}\")");
                case List<string> list:
                    var stringLiterals = string.Join(", ", list.Select(s => $"\"{s.Replace("\"", "\\\"")}\""));
                    var listInitializerString = $"new System.Collections.Generic.List<string> {{ {stringLiterals} }}";
                    return SyntaxFactory.ParseExpression(listInitializerString);

                case System.Collections.IList objList:
                    // DYNAMIC LIST GENERATION
                    // Determines if the valid contents are int, double, or string
                    
                    bool allInt = true;
                    bool allDouble = true;
                    int itemCount = 0;

                    var intItems = new List<long>();
                    var doubleItems = new List<double>();
                    var stringItems = new List<string>();

                    foreach (var item in objList)
                    {
                        if (item == null) continue;
                        itemCount++;

                        // Check Int
                        if (allInt)
                        {
                            if (item is int iVal) intItems.Add(iVal);
                            else if (item is long lVal) intItems.Add(lVal);
                            else allInt = false;
                        }

                        // Check Double
                        if (allDouble)
                        {
                            if (item is double dVal) doubleItems.Add(dVal);
                            else if (item is float fVal) doubleItems.Add(fVal);
                            else if (item is int iVal2) doubleItems.Add(iVal2);
                            else if (item is long lVal2) doubleItems.Add(lVal2);
                            else allDouble = false;
                        }
                        
                        // Always collect string just in case
                        stringItems.Add(item.ToString().Replace("\"", "\\\""));
                    }

                    if (itemCount > 0 && allInt)
                    {
                         var intLiterals = string.Join(", ", intItems);
                         return SyntaxFactory.ParseExpression($"new System.Collections.Generic.List<int> {{ {intLiterals} }}");
                    }
                    
                    if (itemCount > 0 && allDouble)
                    {
                         var doubleLiterals = string.Join(", ", doubleItems);
                         return SyntaxFactory.ParseExpression($"new System.Collections.Generic.List<double> {{ {doubleLiterals} }}");
                    }

                    // Default to List<string>
                    var objLiterals = string.Join(", ", stringItems.Select(s => $"\"{s}\""));
                    return SyntaxFactory.ParseExpression($"new System.Collections.Generic.List<string> {{ {objLiterals} }}");

                default:
                    return SyntaxFactory.LiteralExpression(SyntaxKind.NullLiteralExpression);
            }
        }
    }

    public class ParameterPullingRewriter : CSharpSyntaxRewriter
    {
        private bool IsInsideParamsClass(SyntaxNode node)
        {
            var parent = node.Parent;
            while (parent != null)
            {
                if (parent is ClassDeclarationSyntax classDecl && classDecl.Identifier.Text == "Params")
                    return true;
                parent = parent.Parent;
            }
            return false;
        }

        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            if (!IsInsideParamsClass(node) || !node.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)))
            {
                return base.VisitPropertyDeclaration(node);
            }

            // Only rewrite if it's an auto-property (accessors have no body) OR it already has an initializer
            bool isAuto = node.AccessorList != null && node.AccessorList.Accessors.All(a => a.Body == null && a.ExpressionBody == null);
            if (!isAuto && node.Initializer == null)
            {
                return base.VisitPropertyDeclaration(node);
            }

            var paramName = node.Identifier.Text;

            // Rewrite: public Type MyParam { get; set; } = CoreScript.Engine.Globals.ExecutionGlobals.Get<Type>("MyParam");
            var pullExpression = SyntaxFactory.ParseExpression($"CoreScript.Engine.Globals.ExecutionGlobals.Get<{node.Type}>(\"{paramName}\")");

            var equalsValue = SyntaxFactory.EqualsValueClause(pullExpression)
                .WithLeadingTrivia(SyntaxFactory.TriviaList(SyntaxFactory.Space));

            var updatedNode = node.WithInitializer(equalsValue);
            
            // Auto-properties with initializers MUST have a semicolon
            if (updatedNode.SemicolonToken.Kind() == SyntaxKind.None)
            {
                updatedNode = updatedNode.WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken));
            }
            
            return updatedNode;
        }
    }

    internal class RunnerLogger : ILogger
    {
        public void Log(string message, LogLevel level) => FileLogger.Log(message, level);
        public void LogError(string message) => FileLogger.LogError(message);
    }
}
