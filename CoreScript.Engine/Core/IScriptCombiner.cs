using CoreScript.Engine.Models;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IScriptCombiner
    {
        string Combine(List<ScriptFile> scriptFiles);
    }
}
