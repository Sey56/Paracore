using RScript.Engine.Models;
using System.Collections.Generic;

namespace RScript.Engine.Core
{
    public interface IParameterExtractor
    {
        List<ScriptParameter> ExtractParameters(string scriptContent);
    }
}
