using Microsoft.CodeAnalysis.Scripting;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IScriptCompiler
    {
        Script<object> CreateScript(string code, string scriptName);
        byte[] CompileToBytes(string code);
        string GetCodeHash(string code);
    }
}
