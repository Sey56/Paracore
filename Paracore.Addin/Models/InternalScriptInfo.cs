using System.Collections.Generic;

namespace Paracore.Addin.Models
{
    public class InternalScriptInfo
    {
        public CoreScript.ScriptMetadata Metadata { get; set; }
        public List<CoreScript.ScriptParameter> Parameters { get; set; }
    }
}
