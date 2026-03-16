using Microsoft.CodeAnalysis.Scripting;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Context;
using CoreScript.Engine.Logging;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using Microsoft.CodeAnalysis;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class ReplSessionManager
    {
        private class ReplSession
        {
            public ScriptState<object> State { get; set; }
            public ExecutionGlobals Globals { get; set; }
        }

        private static readonly Dictionary<string, ReplSession> _sessions = new Dictionary<string, ReplSession>();
        private static readonly object _lock = new object();

        public static async Task<(bool isSuccess, string output, string error, List<string> structuredOutput)> ExecuteAsync(string code, string sessionId, ICoreScriptContext context)
        {
            try
            {
                var lowerCode = code.Trim().ToLowerInvariant();

                // 1. Intercept Meta-Commands BEFORE any wrapping or session logic
                if (lowerCode == "reset" || lowerCode == "clear vars" || lowerCode == "reset vars")
                {
                    ResetSession(sessionId);
                    return (true, "REPL session reset. All variables cleared.", string.Empty, new List<string>());
                }

                ReplSession session;
                lock (_lock)
                {
                    _sessions.TryGetValue(sessionId, out session);
                }

                if (lowerCode == "vars" || lowerCode == "list" || lowerCode == "list vars")
                {
                    if (session == null)
                    {
                        return (true, "No active variables. (Session is empty)", string.Empty, new List<string>());
                    }

                    var vars = session.State.Variables;
                    if (!vars.Any())
                    {
                        return (true, "No active variables found in this session.", string.Empty, new List<string>());
                    }

                    // Roslyn ScriptState keeps shadowed variables (var x = 5; var x = 12 creates two 'x' vars).
                    // We GroupBy name and take the Last() to only show the most recently defined value for each variable name.
                    var uniqueVars = vars.GroupBy(v => v.Name).Select(g => g.Last()).ToList();

                    var sb = new System.Text.StringBuilder();
                    sb.AppendLine("=== Active REPL Variables ===");
                    foreach (var v in uniqueVars)
                    {
                        string typeName = v.Type.Name;
                        string valStr = v.Value?.ToString() ?? "null";

                        // Truncate extremely long string values to avoid blowing up the console
                        if (valStr.Length > 200) valStr = valStr.Substring(0, 200) + "... [truncated]";

                        sb.AppendLine($"[{typeName}] {v.Name} = {valStr}");
                    }
                    return (true, sb.ToString().TrimEnd(), string.Empty, new List<string>());
                }

                if (lowerCode.StartsWith("inspect ") && session != null)
                {
                    var varName = code.Trim().Substring(8).Trim();
                    var vars = session.State.Variables;
                    var targetVar = vars.LastOrDefault(v => v.Name == varName);
                    if (targetVar == null)
                    {
                        return (false, string.Empty, $"Variable '{varName}' not found in active session.", new List<string>());
                    }

                    try
                    {
                        var json = JsonSerializer.Serialize(targetVar.Value, new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = ExecutionGlobals.SerializerOptions.PropertyNamingPolicy, Converters = { new RevitElementConverterFactory(), new ElementIdConverter(), new DocumentConverter(), new XYZConverter(), new ParameterConverter() } });
                        return (true, json, string.Empty, new List<string>());
                    }
                    catch (Exception ex)
                    {
                        return (false, string.Empty, $"Failed to inspect '{varName}': {ex.Message}", new List<string>());
                    }
                }

                // --- Path-based Reference Gathering (Matches ScriptCompiler.cs) ---
                string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName) ?? string.Empty;
                var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                var revitRefs = revitDllPaths.Where(IsManagedAssembly).Select(path => MetadataReference.CreateFromFile(path)).ToList();

                var coreTypes = new[] {
                    typeof(object), typeof(Enumerable), typeof(Assembly), typeof(List<>),
                    typeof(Math), typeof(ReplSessionManager), typeof(JsonSerializer),
                    typeof(Microsoft.CSharp.RuntimeBinder.Binder),
                    typeof(System.Runtime.CompilerServices.DynamicAttribute),
                    typeof(System.Linq.Expressions.Expression),
                    typeof(System.Dynamic.DynamicObject)
                };
                var coreRefs = coreTypes.Select(t => MetadataReference.CreateFromFile(t.Assembly.Location)).ToList();

                string engineDir = Path.GetDirectoryName(typeof(ReplSessionManager).Assembly.Location) ?? "";
                string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
                foreach (var dllName in extraDlls)
                {
                    string dllPath = Path.Combine(engineDir, dllName);
                    if (File.Exists(dllPath))
                    {
                        coreRefs.Add(MetadataReference.CreateFromFile(dllPath));
                    }
                }

                // Prepare script options
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
                        "Autodesk.Revit.UI.Selection",
                        "CoreScript.Engine.Globals", "CoreScript.Engine.Runtime",
                        "SixLabors.ImageSharp", "SixLabors.ImageSharp.Processing", "SixLabors.ImageSharp.PixelFormats",
                        "MiniExcelLibs",
                        "MathNet.Numerics", "MathNet.Numerics.LinearAlgebra", "MathNet.Numerics.Statistics"
                    );

                // Inject ScriptApi and resolve Parameter ambiguity
                string fullCode = "using static CoreScript.Engine.Globals.ScriptApi;" + Environment.NewLine +
                                  "using Parameter = Autodesk.Revit.DB.Parameter;" + Environment.NewLine +
                                  code;

                if (session == null)
                {
                    // Intercept "vars" or "list" commands when no session exists
                    if (lowerCode == "vars" || lowerCode == "list" || lowerCode == "list vars")
                    {
                        return (true, "No active variables. (Session is empty)", string.Empty, new List<string>());
                    }

                    // Start new session
                    var globals = new ExecutionGlobals(context, new Dictionary<string, object>(), new Dictionary<string, object>());
                    ExecutionGlobals.SetContext(globals);
                    try
                    {
                        var state = await CSharpScript.RunAsync(fullCode, options, globals: globals);
                        session = new ReplSession { State = state, Globals = globals };
                    }
                    finally
                    {
                        ExecutionGlobals.ClearContext();
                    }
                }
                else
                {
                    // Intercept "vars" or "list" commands for an active session

                    if (lowerCode == "clear vars" || lowerCode == "reset" || lowerCode == "reset vars")
                    {
                        ResetSession(sessionId);
                        return (true, "REPL session reset. All variables cleared.", string.Empty, new List<string>());
                    }

                    if (lowerCode.StartsWith("inspect "))
                    {
                        var varName = code.Trim().Substring(8).Trim();
                        var vars = session.State.Variables;
                        var targetVar = vars.LastOrDefault(v => v.Name == varName);
                        if (targetVar == null)
                        {
                            return (false, string.Empty, $"Variable '{varName}' not found in active session.", new List<string>());
                        }

                        try
                        {
                            var json = JsonSerializer.Serialize(targetVar.Value, new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = ExecutionGlobals.SerializerOptions.PropertyNamingPolicy, Converters = { new RevitElementConverterFactory(), new ElementIdConverter(), new DocumentConverter(), new XYZConverter(), new ParameterConverter() } });
                            return (true, json, string.Empty, new List<string>());
                        }
                        catch (Exception ex)
                        {
                            return (false, string.Empty, $"Failed to inspect '{varName}': {ex.Message}", new List<string>());
                        }
                    }

                    if (lowerCode == "vars" || lowerCode == "list" || lowerCode == "list vars")
                    {
                        var vars = session.State.Variables;
                        if (!vars.Any())
                        {
                            return (true, "No active variables found in this session.", string.Empty, new List<string>());
                        }

                        // Roslyn ScriptState keeps shadowed variables (var x = 5; var x = 12 creates two 'x' vars).
                        // We GroupBy name and take the Last() to only show the most recently defined value for each variable name.
                        var uniqueVars = vars.GroupBy(v => v.Name).Select(g => g.Last()).ToList();

                        var sb = new System.Text.StringBuilder();
                        sb.AppendLine("=== Active REPL Variables ===");
                        foreach (var v in uniqueVars)
                        {
                            string typeName = v.Type.Name;
                            string valStr = v.Value?.ToString() ?? "null";

                            // Truncate extremely long string values to avoid blowing up the console
                            if (valStr.Length > 200) valStr = valStr.Substring(0, 200) + "... [truncated]";

                            sb.AppendLine($"[{typeName}] {v.Name} = {valStr}");
                        }
                        return (true, sb.ToString().TrimEnd(), string.Empty, new List<string>());
                    }

                    // Continue existing session
                    session.Globals.UpdateContext(context);
                    ExecutionGlobals.SetContext(session.Globals);

                    try
                    {
                        session.State = await session.State.ContinueWithAsync(fullCode, options);
                    }
                    finally
                    {
                        ExecutionGlobals.ClearContext();
                    }
                }

                lock (_lock)
                {
                    _sessions[sessionId] = session;
                }

                // --- Structured Output Capture ---
                var structuredOutput = new List<string>();
                var contextType = context.GetType();
                var logProp = contextType.GetProperty("StructuredOutputLog") ?? contextType.GetProperty("ShowOutputLog");
                if (logProp != null)
                {
                    var log = logProp.GetValue(context) as System.Collections.IEnumerable;
                    if (log != null)
                    {
                        foreach (var item in log)
                        {
                            structuredOutput.Add(item is string s ? s : JsonSerializer.Serialize(item, ExecutionGlobals.SerializerOptions));
                        }
                    }
                }

                // If the script printed anything (e.g. via Println), return that as the main output
                var printLog = string.Join(Environment.NewLine, context.PrintLog);
                if (!string.IsNullOrEmpty(printLog))
                {
                    return (true, printLog, string.Empty, structuredOutput);
                }

                // Otherwise, fall back to the return value of the expression
                var output = session.State.ReturnValue?.ToString() ?? string.Empty;
                return (true, output, string.Empty, structuredOutput);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[REPL] Error: {ex.Message}");
                return (false, string.Empty, ex.Message, new List<string>());
            }
        }

        public static void ResetSession(string sessionId)
        {
            lock (_lock)
            {
                if (_sessions.ContainsKey(sessionId))
                {
                    _sessions.Remove(sessionId);
                    FileLogger.Log($"[REPL] Session '{sessionId}' reset.");
                }
            }
        }

        private static bool IsManagedAssembly(string path)
        {
            try
            {
                AssemblyName.GetAssemblyName(path);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
