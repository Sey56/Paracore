using CoreScript.Engine.Models;

namespace CoreScript.Engine.Core
{
    public interface IMetadataExtractor
    {
        ScriptMetadata ExtractMetadata(string scriptContent);
    }
}
