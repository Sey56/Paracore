using CoreScript.Engine.Models;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IScriptParser
    {
        ScriptFile IdentifyTopLevelScript(List<ScriptFile> scriptFiles);
        string CombineScriptFiles(List<ScriptFile> scriptFiles);
    }
}
