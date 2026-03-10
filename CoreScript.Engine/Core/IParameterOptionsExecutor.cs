using Autodesk.Revit.DB;
using CoreScript.Engine.Context;
using CoreScript.Engine.Models;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace CoreScript.Engine.Core
{
    public interface IParameterOptionsExecutor
    {
        Task<List<string>> ExecuteOptionsFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema);
        Task<List<object>> ExecuteElementOptionsFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema);
        Task<(double Min, double Max, double Step)?> ExecuteRangeFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema);
        bool HasOptionsFunction(string scriptContent, string parameterName);
        bool HasRangeFunction(string scriptContent, string parameterName);
    }
}
