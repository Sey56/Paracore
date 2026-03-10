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

        public static async Task<(bool isSuccess, string output, string error)> ExecuteAsync(string code, string sessionId, ICoreScriptContext context)
        {
            try
            {
                ReplSession session;
                lock (_lock)
                {
                    _sessions.TryGetValue(sessionId, out session);
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
                    if (File.Exists(dllPath)) coreRefs.Add(MetadataReference.CreateFromFile(dllPath));
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
                        "RestSharp", "MiniExcelLibs", 
                        "MathNet.Numerics", "MathNet.Numerics.LinearAlgebra", "MathNet.Numerics.Statistics"
                    );

                // Inject ScriptApi
                string fullCode = "using static CoreScript.Engine.Globals.ScriptApi;" + Environment.NewLine + code;

                if (session == null)
                {
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

                // If the script printed anything (e.g. via Println), return that as the main output
                var printLog = string.Join(Environment.NewLine, context.PrintLog);
                if (!string.IsNullOrEmpty(printLog))
                {
                    return (true, printLog, string.Empty);
                }

                // Otherwise, fall back to the return value of the expression
                var output = session.State.ReturnValue?.ToString() ?? "Success (no return value)";
                return (true, output, string.Empty);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[REPL] Error: {ex.Message}");
                return (false, string.Empty, ex.Message);
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
