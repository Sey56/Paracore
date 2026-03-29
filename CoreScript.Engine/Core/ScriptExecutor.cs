using CoreScript.Engine.Context;
using CoreScript.Engine.Models;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading.Tasks;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Core
{
    public class ScriptExecutor : IScriptExecutor
    {
        public async Task<ScriptState<object>> ExecuteAsync(Script<object> script)
        {
            return await script.RunAsync();
        }

        public ExecutionResult ExecuteBinary(byte[] assemblyBytes, ICoreScriptContext context)
        {
            var alc = new SharedAssemblyLoadContext("RevitScriptBinary");
            try
            {
                using (var ms = new MemoryStream(assemblyBytes))
                {
                    var assembly = alc.LoadFromStream(ms);
                    var entryType = assembly.GetTypes().FirstOrDefault(t => t.Name.Contains("Submission#0")) ?? assembly.GetTypes().FirstOrDefault();
                    if (entryType == null)
                    {
                        return ExecutionResult.Failure("Entry type not found.");
                    }

                    var factoryMethod = entryType.GetMethod("<Factory>", BindingFlags.Public | BindingFlags.Static);
                    if (factoryMethod != null)
                    {
                        var resultTask = factoryMethod.Invoke(null, new object[] { new object[] { null, null } }) as Task;
                        resultTask?.GetAwaiter().GetResult();
                    }

                    var execResult = ExecutionResult.Success("Success", null);
                    execResult.PrintLog = context.PrintLog.ToList();
                    return execResult;
                }
            }
            catch (Exception ex)
            {
                var targetEx = ex;
                if (ex is TargetInvocationException tie && tie.InnerException != null)
                {
                    targetEx = tie.InnerException;
                }
                
                string errorMsg = $"❌ Binary error: {targetEx.Message}";
                // Include partial stack trace for better debugging of cached errors
                if (targetEx.StackTrace != null)
                {
                    errorMsg += $"\n{targetEx.StackTrace.Split('\n').FirstOrDefault()}";
                }
                
                return ExecutionResult.Failure(errorMsg, context.PrintLog.ToArray());
            }
            finally
            {
                alc.Unload();
            }
        }
    }

    internal class SharedAssemblyLoadContext : AssemblyLoadContext
    {
        private readonly AssemblyLoadContext _parentContext;

        public SharedAssemblyLoadContext(string name) : base(name, isCollectible: true)
        {
            // Capture the ALC that CoreScript.Engine is loaded in (the isolated context).
            // This ensures scripts can find ExecutionGlobals, ScriptApi, and all Paracore types.
            _parentContext = AssemblyLoadContext.GetLoadContext(typeof(ScriptExecutor).Assembly)
                             ?? AssemblyLoadContext.Default;
        }

        protected override Assembly? Load(AssemblyName assemblyName)
        {
            // 1. Check the parent (isolated) context first — this is where CoreScript.Engine lives
            var loaded = _parentContext.Assemblies
                .FirstOrDefault(a => a.GetName().Name == assemblyName.Name);
            if (loaded != null) return loaded;

            // 2. Fall back to Default for system/Revit assemblies
            loaded = AssemblyLoadContext.Default.Assemblies
                .FirstOrDefault(a => a.GetName().Name == assemblyName.Name);
            return loaded;
        }
    }

}
