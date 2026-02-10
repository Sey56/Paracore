using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IScriptRewriter
    {
        string Rewrite(string code, Dictionary<string, object> parameters);
    }
}
