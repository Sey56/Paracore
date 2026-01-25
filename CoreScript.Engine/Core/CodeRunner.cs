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
            return Execute(scriptContent, parametersJson, context, null);
        }

        public ExecutionResult Execute(string userCode, string parametersJson, ICoreScriptContext context, object? customHost)
        {
            var alc = new AssemblyLoadContext("RevitScript", isCollectible: true);
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);

            FileLogger.Log("🟢 Starting CodeRunner.Execute");

            string topLevelScriptName = "Unknown Script"; // Initialize here so it's accessible in catch blocks

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
                        
                        List<ScriptParameter> paramList = null;
                        
                        // Deserialization solely supports V2 Format (List of Objects)
                        paramList = JsonSerializer.Deserialize<List<ScriptParameter>>(unescapedParametersJson, paramJsonOptions);

                        if (paramList != null)
                        {
                            foreach (var param in paramList)
                            {
                                string name = param.Name;
                                object value = null;
                                switch (param.Type)
                                {
                                    case "string":
                                    {
                                        if (param.SelectionType == "Point")
                                        {
                                            string xyzStr = param.Value.ValueKind == JsonValueKind.String ? param.Value.GetString() : param.Value.ToString();
                                            if (!string.IsNullOrEmpty(xyzStr))
                                            {
                                                var parts = xyzStr.Split(',');
                                                if (parts.Length == 3 && 
                                                    double.TryParse(parts[0], out double x) && 
                                                    double.TryParse(parts[1], out double y) && 
                                                    double.TryParse(parts[2], out double z))
                                                {
                                                    value = new Autodesk.Revit.DB.XYZ(x, y, z);
                                                }
                                            }
                                            if (value == null) value = Autodesk.Revit.DB.XYZ.Zero;
                                        }
                                        else if (param.SelectionType == "Edge" || param.SelectionType == "Face")
                                        {
                                            string refStr = param.Value.ValueKind == JsonValueKind.String ? param.Value.GetString() : param.Value.ToString();
                                            if (!string.IsNullOrEmpty(refStr))
                                            {
                                                try { value = Autodesk.Revit.DB.Reference.ParseFromStableRepresentation(context.Doc, refStr); }
                                                catch { }
                                            }
                                        }
                                        else if (param.MultiSelect)
                                        {
                                            if (param.Value.ValueKind == JsonValueKind.Array)
                                            {
                                                value = JsonSerializer.Deserialize<List<string>>(param.Value.GetRawText());
                                            }
                                            else if (param.Value.ValueKind == JsonValueKind.String)
                                            {
                                                string stringValue = param.Value.GetString();
                                                if (stringValue.Trim().StartsWith("[") && stringValue.Trim().EndsWith("]"))
                                                {
                                                    try { value = JsonSerializer.Deserialize<List<string>>(stringValue); }
                                                    catch { value = new List<string> { stringValue }; } 
                                                }
                                                else
                                                {
                                                    value = stringValue.Split(',').Select(s => s.Trim()).ToList();
                                                }
                                            }
                                            else
                                            {
                                                value = param.Value.ToString();
                                            }
                                        }
                                        else
                                        {
                                            if (param.Value.ValueKind == JsonValueKind.String)
                                            {
                                                value = param.Value.GetString();
                                            }
                                            else
                                            {
                                                value = param.Value.GetRawText();
                                            }
                                        }
                                        break;
                                    }
                                    case "number":
                                        if (param.Value.ValueKind == JsonValueKind.Number)
                                        {
                                            if (param.Value.TryGetInt64(out long longVal)) 
                                            {
                                                // Prefer int if it fits, for backward compatibility with older scripts using int properties
                                                if (longVal >= int.MinValue && longVal <= int.MaxValue)
                                                    value = (int)longVal;
                                                else
                                                    value = longVal;
                                            }
                                            else if (param.Value.TryGetDouble(out double dblVal)) value = dblVal;
                                        }
                                        else if (param.Value.ValueKind == JsonValueKind.String && double.TryParse(param.Value.GetString(), out double parsedDbl)) value = parsedDbl;

                                        // Automatic Unit Conversion (Zero Boilerplate)
                                        double? valueToConvert = null;
                                        if (value is double d) valueToConvert = d;
                                        else if (value is int i) valueToConvert = (double)i;
                                        else if (value is long l) valueToConvert = (double)l; // Handle long conversion

                                        string unitToUse = param.Unit;
                                        if (string.IsNullOrEmpty(unitToUse) && !string.IsNullOrEmpty(param.Suffix)) unitToUse = param.Suffix;

                                        if (valueToConvert.HasValue && !string.IsNullOrEmpty(unitToUse))
                                        {
                                            double dVal = valueToConvert.Value;
                                            try 
                                            {
                                                ForgeTypeId unitTypeId = null;
                                                switch (unitToUse.ToLower())
                                                {
                                                    case "mm": unitTypeId = UnitTypeId.Millimeters; break;
                                                    case "cm": unitTypeId = UnitTypeId.Centimeters; break;
                                                    case "m": unitTypeId = UnitTypeId.Meters; break;
                                                    case "ft": unitTypeId = UnitTypeId.Feet; break;
                                                    case "in": unitTypeId = UnitTypeId.Inches; break;
                                                    
                                                    // Area
                                                    case "m2":
                                                    case "sqm": unitTypeId = UnitTypeId.SquareMeters; break;
                                                    case "ft2": 
                                                    case "sqft": unitTypeId = UnitTypeId.SquareFeet; break;
                                                    case "mm2": unitTypeId = UnitTypeId.SquareMillimeters; break;
                                                    case "cm2": unitTypeId = UnitTypeId.SquareCentimeters; break;
                                                    case "in2": unitTypeId = UnitTypeId.SquareInches; break;

                                                    // Volume
                                                    case "m3":
                                                    case "cum": unitTypeId = UnitTypeId.CubicMeters; break;
                                                    case "ft3":
                                                    case "cuft": unitTypeId = UnitTypeId.CubicFeet; break;
                                                    case "mm3": unitTypeId = UnitTypeId.CubicMillimeters; break;
                                                    case "cm3": unitTypeId = UnitTypeId.CubicCentimeters; break;
                                                    case "in3": unitTypeId = UnitTypeId.CubicInches; break;
                                                }

                                                if (unitTypeId != null)
                                                {
                                                    value = UnitUtils.ConvertToInternalUnits(dVal, unitTypeId);
                                                    FileLogger.Log($"[CodeRunner] Converted {param.Name}: {dVal} {param.Unit} -> {value} ft");
                                                }
                                            }
                                            catch (Exception ex)
                                            {
                                                FileLogger.LogError($"[CodeRunner] Unit conversion failed for {param.Name}: {ex.Message}");
                                            }
                                        }
                                        break;
                                    case "boolean":
                                        if (param.Value.ValueKind == JsonValueKind.True || param.Value.ValueKind == JsonValueKind.False) value = param.Value.GetBoolean();
                                        else if (param.Value.ValueKind == JsonValueKind.String && bool.TryParse(param.Value.GetString(), out bool parsedBool)) value = parsedBool;
                                        break;
                                    case "xyz":
                                    {
                                        string xyzStr = param.Value.GetString();
                                        if (!string.IsNullOrEmpty(xyzStr))
                                        {
                                            var parts = xyzStr.Split(',');
                                            if (parts.Length == 3 && 
                                                double.TryParse(parts[0], out double x) && 
                                                double.TryParse(parts[1], out double y) && 
                                                double.TryParse(parts[2], out double z))
                                            {
                                                value = new Autodesk.Revit.DB.XYZ(x, y, z);
                                            }
                                        }
                                        if (value == null) value = Autodesk.Revit.DB.XYZ.Zero;
                                        break;
                                    }
                                    case "reference":
                                    {
                                        string refStr = param.Value.GetString();
                                        if (!string.IsNullOrEmpty(refStr))
                                        {
                                            try { value = Autodesk.Revit.DB.Reference.ParseFromStableRepresentation(context.Doc, refStr); }
                                            catch { }
                                        }
                                        break;
                                    }
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
                    scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(userCode, scriptJsonOptions);
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
                
                // V2 FIX: Ensure defaults (with unit conversions) are applied even if input JSON is empty (VSCode case)
                List<ScriptParameter> extractedParams = new List<ScriptParameter>();
                try 
                {
                    var extractor = new ParameterExtractor(new RunnerLogger());
                    extractedParams = extractor.ExtractParameters(combinedScriptContent);
                    
                    foreach (var p in extractedParams)
                    {
                        if (!parameters.ContainsKey(p.Name))
                        {
                            object val = null;
                            // DefaultValueJson is raw display value. Convert if Unit is present.
                            if (!string.IsNullOrEmpty(p.DefaultValueJson))
                            {
                                try 
                                {
                                    if (p.Type == "number") 
                                    {
                                        if (double.TryParse(p.DefaultValueJson, out double d)) 
                                        {
                                            val = d;
                                            // Apply Unit Conversion
                                            if (!string.IsNullOrEmpty(p.Unit))
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
                                                    val = Autodesk.Revit.DB.UnitUtils.ConvertToInternalUnits(d, unitTypeId);
                                                }
                                            }
                                        }
                                    }
                                    else if (p.Type == "boolean")
                                    {
                                        val = p.DefaultValueJson.ToLower() == "true";
                                    }
                                    else if (p.Type == "string")
                                    {
                                        // Simple string or JSON string
                                        if (p.DefaultValueJson.StartsWith("\"") && p.DefaultValueJson.EndsWith("\""))
                                            val = JsonSerializer.Deserialize<string>(p.DefaultValueJson);
                                        else 
                                            val = p.DefaultValueJson;
                                            
                                        // Handle list defaults if multiselect
                                        if (p.MultiSelect && val is string s && s.StartsWith("["))
                                        {
                                            try { val = JsonSerializer.Deserialize<List<string>>(s); } catch {}
                                        }
                                    }
                                }
                                catch {}
                            }
                            
                            if (val != null)
                            {
                                parameters[p.Name] = val;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[CodeRunner] Failed to inject defaults: {ex.Message}");
                }

                // V2 FIX: Coerce types based on extracted definition (Fixes CS0029 when JSON says "string" but C# says "long")
                try
                {
                    var paramDefs = extractedParams.ToDictionary(p => p.Name, StringComparer.OrdinalIgnoreCase);
                    // Use ToList to allow modification of the dictionary during iteration
                    foreach (var key in parameters.Keys.ToList()) 
                    {
                        if (paramDefs.TryGetValue(key, out var def))
                        {
                            var currentValue = parameters[key];
                            
                            // 1. Coerce String -> Long/Int/Double
                            if (def.Type == "number" && currentValue is string sVal && !string.IsNullOrWhiteSpace(sVal))
                            {
                                if (def.NumericType == "int")
                                {
                                    if (long.TryParse(sVal, out long l)) parameters[key] = l;
                                }
                                else
                                {
                                    if (double.TryParse(sVal, out double d)) parameters[key] = d;
                                }
                            }
                            // 2. Coerce String -> Boolean
                            else if (def.Type == "boolean" && currentValue is string sBool)
                            {
                                if (bool.TryParse(sBool, out bool b)) parameters[key] = b;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[CodeRunner] Type coercion failed: {ex.Message}");
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
                string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll" };
                
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
                        "MiniExcelLibs"
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

                var structuredOutputLogProperty = context.GetType().GetProperty("StructuredOutputLog");
                if (structuredOutputLogProperty != null)
                {
                    var structuredOutputLog = structuredOutputLogProperty.GetValue(context);
                    if (structuredOutputLog is System.Collections.IEnumerable enumerable)
                    {
                        foreach (var item in enumerable)
                        {
                            var jsonString = JsonSerializer.Serialize(item);
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

                string msg = ex.Message ?? "";
                // Refined check: Only flag actual assembly/type loading issues as conflicts.
                // Standard NREs or InvalidOps are likely engine bugs or script issues, not conflicts.
                bool isEngineError = ex is ReflectionTypeLoadException || ex is FileLoadException || ex is TypeLoadException || msg.Contains("Roslyn") || msg.Contains("SyntaxTree") || msg.Contains("CSharpScript");

                string failureMessage = isEngineError 
                    ? "⚠️ Add-in Conflict: Paracore is unable to safely run this script because its engine has been blocked by another Revit Add-in."
                    : $"❌ Script execution error: {ex.Message} | {timestamp}";
                
                if (isEngineError)
                {
                    context.Println("💡 Tip: A conflict with another add-in (e.g. pyRevit) was detected. See 'CoreScriptError.txt' or 'CodeRunnerDebug.txt' in your logs folder for the technical footprint.");
                }
                else
                {
                    // Standardized single exception logging
                    context.Println(FormatRuntimeError(ex));
                }

                // Check if a Loader.log exists and inform the user
                var logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "Loader.log");
                if (File.Exists(logPath) && new FileInfo(logPath).LastWriteTime > DateTime.Now.AddMinutes(-1))
                {
                    context.Println($"💡 Tip: A recent assembly load error was detected. See 'Loader.log' and 'CodeRunnerDebug.txt' in %AppData%\\Roaming\\paracore-data\\logs for more details.");
                }

                var failureResult = ExecutionResult.Failure(failureMessage, context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName;
                return failureResult;
            }
            finally
            {
                ExecutionGlobals.ClearContext();
                alc.Unload();
                FileLogger.Log("🟣 Unloaded script AssemblyLoadContext and cleared context.");
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
        public ParameterRewriter(Dictionary<string, object> parameters) { _parameters = parameters; }

        public override SyntaxNode VisitVariableDeclarator(VariableDeclaratorSyntax node)
        {
            if (_parameters.TryGetValue(node.Identifier.Text, out object? newValue) && newValue != null)
            {
                ExpressionSyntax newLiteral = CreateExpression(newValue);
                return node.WithInitializer(SyntaxFactory.EqualsValueClause(newLiteral)
                    .WithLeadingTrivia(node.Initializer?.EqualsToken.LeadingTrivia ?? SyntaxFactory.TriviaList(SyntaxFactory.Space))
                    .WithTrailingTrivia(node.Initializer?.Value.GetTrailingTrivia() ?? SyntaxFactory.TriviaList()));
            }
            return base.VisitVariableDeclarator(node);
        }

        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            if (_parameters.TryGetValue(node.Identifier.Text, out object? newValue) && newValue != null)
            {
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
                
                // If it was an auto-property with no initializer, it needs a semicolon
                if (node.SemicolonToken.Kind() == SyntaxKind.None)
                {
                    updatedNode = updatedNode.WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken));
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
                default:
                    return SyntaxFactory.LiteralExpression(SyntaxKind.NullLiteralExpression);
            }
        }
    }

    internal class RunnerLogger : ILogger
    {
        public void Log(string message, LogLevel level) => FileLogger.Log(message, level);
        public void LogError(string message) => FileLogger.LogError(message);
    }
}
