using RScript.Engine.Models;

namespace RScript.Engine.Core
{
    public interface IMetadataExtractor
    {
        ScriptMetadata ExtractMetadata(string scriptContent);
    }
}
