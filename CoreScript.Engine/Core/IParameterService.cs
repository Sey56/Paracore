using CoreScript.Engine.Models;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IParameterService
    {
        Dictionary<string, object> MapParameters(string json, out List<ScriptParameter> richParameters);
        void HardenParameters(Dictionary<string, object> parameters, List<ScriptParameter> scriptParams);
    }
}
