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
        private readonly IParameterService _parameterService;
        private readonly IScriptCompiler _scriptCompiler;
        private readonly IScriptParser _scriptParser;
        private readonly IScriptCombiner _scriptCombiner;
        private readonly IScriptExecutor _scriptExecutor;
        private readonly IScriptRewriter _scriptRewriter;
        private readonly IParameterExtractor _parameterExtractor;
        private readonly IParameterOptionsExecutor _optionsExecutor;

        // V4: Assembly Cache for blazingly fast repeated runs
        private static readonly Dictionary<string, byte[]> _assemblyCache = new Dictionary<string, byte[]>();
        private static readonly object _cacheLock = new object();

        public CodeRunner()
        {
            var logger = new RunnerLogger();
            _parameterService = new ParameterService();
            _scriptCompiler = new ScriptCompiler();
            _scriptParser = new ScriptParser();
            _scriptCombiner = new ScriptCombiner(_scriptParser);
            _scriptExecutor = new ScriptExecutor();
            _scriptRewriter = new ScriptRewriter();
            _parameterExtractor = new ParameterExtractor(logger);
            _optionsExecutor = new ParameterOptionsExecutor(logger, _parameterService);
        }

        public ExecutionResult Execute(string scriptContent, string parametersJson, ICoreScriptContext context)
        {
            var alc = new AssemblyLoadContext("RevitScript", isCollectible: true);
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);

            FileLogger.Log("🟢 Starting CodeRunner.Execute");

            string topLevelScriptName = "Unknown Script";
            string finalScriptCode = string.Empty; // Store for error mapping
            string scriptPath = string.Empty;

            try
            {
                var parameters = _parameterService.MapParameters(parametersJson, out var richParams);
                var rawParameters = new Dictionary<string, object>(parameters);
                
                if (parameters.ContainsKey("__script_name__"))
                {
                    var forcedName = parameters["__script_name__"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(forcedName)) topLevelScriptName = forcedName;
                }

                if (parameters.TryGetValue("__absolute_path__", out var pathObj) && pathObj != null)
                {
                    scriptPath = pathObj.ToString() ?? string.Empty;
                }

                List<ScriptFile> scriptFiles = new List<ScriptFile>();
                try
                {
                    var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(scriptContent, scriptJsonOptions) ?? new List<ScriptFile>();
                }
                catch 
                { 
                    scriptFiles.Add(new ScriptFile { FileName = topLevelScriptName + ".cs", Content = scriptContent });
                }

                string combinedUserCode = _scriptCombiner.Combine(scriptFiles);

                // --- V4 CORE FIX: Unit Regression ---
                if (richParams.Count == 0 && !string.IsNullOrEmpty(combinedUserCode))
                {
                    FileLogger.Log("[CodeRunner] No rich parameters provided. Extracting from source code to ensure [Unit] conversion works.");
                    richParams = _parameterExtractor.ExtractParameters(combinedUserCode);
                }

                if (richParams.Count > 0) _parameterService.HardenParameters(parameters, richParams);
                // -------------------------------------

                string modifiedUserCode = _scriptRewriter.Rewrite(combinedUserCode, parameters);
                
                // V3.1: Start with #line hidden to ensure internal using doesn't count toward line numbers
                finalScriptCode = "#line hidden" + Environment.NewLine + 
                                  "using static CoreScript.Engine.Globals.ScriptApi;" + Environment.NewLine + 
                                  modifiedUserCode;

                try
                {
                    var debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CompiledScript.cs");
                    Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                    File.WriteAllText(debugPath, finalScriptCode);
                }
                catch { }

                var executionGlobals = new ExecutionGlobals(context, parameters, rawParameters);

                // --- V4 ELITE: MAGIC HYDRATION (Pre-calculate Resolution Pools) ---
                foreach (var p in richParams)
                {
                    if (_optionsExecutor.HasOptionsFunction(scriptContent, p.Name))
                    {
                        try
                        {
                            var pool = _optionsExecutor.ExecuteElementOptionsFunction(scriptContent, p.Name, context, parametersJson, richParams).Result;
                            if (pool != null && pool.Any())
                            {
                                executionGlobals.ResolutionPools[p.Name] = pool;
                                FileLogger.Log($"[CodeRunner] 🪄 Magic Hydration: Pre-calculated pool for '{p.Name}' ({pool.Count} items)");
                            }
                        }
                        catch (Exception ex)
                        {
                            FileLogger.LogError($"[CodeRunner] Failed to pre-calculate pool for '{p.Name}': {ex.Message}");
                        }
                    }
                }

                ExecutionGlobals.SetContext(executionGlobals);

                // --- V4 ELITE: Assembly Caching Logic ---
                string codeHash = _scriptCompiler.GetCodeHash(finalScriptCode);
                byte[]? cachedAssembly = null;
                lock (_cacheLock)
                {
                    if (_assemblyCache.TryGetValue(codeHash, out cachedAssembly))
                    {
                        FileLogger.Log($"[CodeRunner] ⚡ CACHE HIT: Re-using compiled assembly for {topLevelScriptName}");
                    }
                }

                ExecutionResult result;
                if (cachedAssembly != null)
                {
                    // Run pre-compiled assembly (Blazingly Fast)
                    result = _scriptExecutor.ExecuteBinary(cachedAssembly, context);
                }
                else
                {
                    // Compile fresh (Slow path)
                    FileLogger.Log($"[CodeRunner] 🐢 CACHE MISS: Compiling {topLevelScriptName}...");
                    var script = _scriptCompiler.CreateScript(finalScriptCode, topLevelScriptName);
                    var state = _scriptExecutor.ExecuteAsync(script).Result;
                    
                    result = ExecutionResult.Success("✅ Code executed successfully", state.ReturnValue);
                    
                    // Add to cache for next time
                    try
                    {
                        var assemblyBytes = _scriptCompiler.CompileToBytes(finalScriptCode);
                        lock (_cacheLock) { _assemblyCache[codeHash] = assemblyBytes; }
                        FileLogger.Log($"[CodeRunner] 💾 Cached assembly for future runs ({assemblyBytes.Length} bytes)");
                    }
                    catch (Exception cacheEx)
                    {
                        FileLogger.LogError($"[CodeRunner] Failed to cache assembly: {cacheEx.Message}");
                    }
                }

                context.Println("✅ Code executed successfully | " + timestamp);
                result.PrintLog = context.PrintLog.ToList();
                result.ScriptName = topLevelScriptName;

                // Structured output handling...
                var contextType = context.GetType();
                var structuredOutputLogProperty = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (structuredOutputLogProperty != null)
                {
                    var log = structuredOutputLogProperty.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null)
                    {
                        foreach (var item in log)
                        {
                            result.StructuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item, ExecutionGlobals.SerializerOptions));
                        }
                    }
                }

                return result;
            }
            catch (Exception ex)
            {
                FileLogger.LogError("🛑 CodeRunner Exception: " + ex.ToString());
                
                string summaryMessage;
                List<string> details = new List<string>();

                // Unwrap AggregateException for better reporting
                var actualEx = (ex is AggregateException aex && aex.InnerException != null) ? aex.InnerException : ex;

                if (actualEx is CompilationErrorException cex)
                {
                    summaryMessage = "Compilation Failed";
                    
                    // Use DiagnosticMapper to get correct file/line mappings
                    var mappedErrors = DiagnosticMapper.MapAndDeduplicate(
                        cex.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error),
                        finalScriptCode);
                    
                    details = mappedErrors.Select(e => e.ToString()).ToList();
                }
                else
                {
                    summaryMessage = actualEx.Message;
                }

                var failureResult = ExecutionResult.Failure($"❌ {summaryMessage}", context.PrintLog.ToArray());
                if (details.Any())
                {
                    // Format multiple errors with newlines for clean wrap in frontend
                    failureResult.ErrorMessage = $"❌ {summaryMessage}:{Environment.NewLine}{string.Join(Environment.NewLine, details)}";
                    failureResult.ErrorDetails = details.ToArray();
                }
                
                failureResult.ScriptName = topLevelScriptName;
                return failureResult;
            }
            finally
            {
                ExecutionGlobals.ClearContext();
                
                // V3.1 ELITE: Only unload if NO watchdog is registered for this path
                if (!string.IsNullOrEmpty(scriptPath) && WatchdogRegistry.GetActiveWatchdogs().Any(w => w.ScriptPath == scriptPath))
                {
                    FileLogger.Log($"[CodeRunner] Preserving ALC for background watcher: {topLevelScriptName}");
                }
                else
                {
                    alc.Unload();
                }
            }
        }

        public ExecutionResult ExecuteBinary(byte[] assemblyBytes, string parametersJson, ICoreScriptContext context)
        {
            string timestamp = DateTime.Now.ToString("dddd dd, MMMM yyyy | hh:mm:ss tt", CultureInfo.InvariantCulture);
            string topLevelScriptName = "Protected Tool";

            FileLogger.Log("=========================================================");
            FileLogger.Log("🚀 [CodeRunner] EXECUTE BINARY TOOL (v3.1 STABLE)");
            FileLogger.Log("=========================================================");

            try
            {
                var parameters = _parameterService.MapParameters(parametersJson, out var richParams);
                var rawParameters = new Dictionary<string, object>(parameters);
                
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
                    // Do NOT remove — ScriptApi.Watchdog() needs it at runtime
                }

                if (richParams.Count > 0) _parameterService.HardenParameters(parameters, richParams);
                
                ExecutionGlobals.SetContext(new ExecutionGlobals(context, parameters, rawParameters));

                var result = _scriptExecutor.ExecuteBinary(assemblyBytes, context);
                
                // Enrich result
                result.ScriptName = topLevelScriptName;
                result.PrintLog = context.PrintLog.ToList();

                var contextType = context.GetType();
                var structuredOutputLogProperty = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (structuredOutputLogProperty != null)
                {
                    var log = structuredOutputLogProperty.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null) foreach (var item in log) result.StructuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item, ExecutionGlobals.SerializerOptions));
                }

                return result;
            }
            catch (Exception ex)
            {
                var failureResult = ExecutionResult.Failure($"❌ Binary error: {ex.Message}", context.PrintLog.ToArray());
                failureResult.ScriptName = topLevelScriptName;
                return failureResult;
            }
            finally { ExecutionGlobals.ClearContext(); }
        }

        public byte[] CompileToBytes(string scriptContent)
        {
            List<ScriptFile> scriptFiles = new List<ScriptFile>();
            try
            {
                var scriptJsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                scriptFiles = JsonSerializer.Deserialize<List<ScriptFile>>(scriptContent, scriptJsonOptions);
            }
            catch { /* Fallback to raw code if not JSON */ }

            string combinedCode;
            if (scriptFiles != null && scriptFiles.Any())
            {
                combinedCode = _scriptCombiner.Combine(scriptFiles);
            }
            else
            {
                combinedCode = scriptContent;
            }

            // Rewrite with empty parameters for build-time (parameters injected at runtime)
            string modifiedUserCode = _scriptRewriter.Rewrite(combinedCode, new Dictionary<string, object>());
            
            string finalScriptCode = "#line hidden" + Environment.NewLine + 
                                  "using static CoreScript.Engine.Globals.ScriptApi;" + Environment.NewLine + 
                                  modifiedUserCode;

            try
            {
                var debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CompiledScript.cs");
                Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                File.WriteAllText(debugPath, finalScriptCode);
            }
            catch { }

            return _scriptCompiler.CompileToBytes(finalScriptCode);
        }

        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _assemblyCache.Clear();
                FileLogger.Log("[CodeRunner] 🧹 Assembly cache cleared manually.");
            }
        }
    }

    internal class RunnerLogger : ILogger { public void Log(string m, LogLevel l) => FileLogger.Log(m, l); public void LogError(string m) => FileLogger.LogError(m); }
}