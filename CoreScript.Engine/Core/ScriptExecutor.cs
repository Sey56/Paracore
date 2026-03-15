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
                return ExecutionResult.Failure($"❌ Binary error: {ex.Message}", context.PrintLog.ToArray());
            }
            finally
            {
                alc.Unload();
            }
        }
    }

    internal class SharedAssemblyLoadContext : AssemblyLoadContext
    {
        public SharedAssemblyLoadContext(string name) : base(name, isCollectible: true) { }

        protected override Assembly? Load(AssemblyName assemblyName)
        {
            var loadedAssembly = AssemblyLoadContext.Default.Assemblies
                .FirstOrDefault(a => a.GetName().Name == assemblyName.Name);

            return loadedAssembly != null ? loadedAssembly : null;
        }
    }
}
