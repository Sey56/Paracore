using CoreScript.Engine.Models;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IParameterExtractor
    {
        List<ScriptParameter> ExtractParameters(string scriptContent);
    }
}
