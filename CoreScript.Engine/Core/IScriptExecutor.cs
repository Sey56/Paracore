using CoreScript.Engine.Context;
using CoreScript.Engine.Models;
using Microsoft.CodeAnalysis.Scripting;
using System.Threading.Tasks;

namespace CoreScript.Engine.Core
{
    public interface IScriptExecutor
    {
        Task<ScriptState<object>> ExecuteAsync(Script<object> script);
        ExecutionResult ExecuteBinary(byte[] assemblyBytes, ICoreScriptContext context);
    }
}
