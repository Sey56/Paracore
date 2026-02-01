using System.Text.Json.Serialization;

namespace CoreScript.Engine.Models
{
    public class ScriptFile
    {
        [JsonPropertyName("file_name")]
        public string FileName { get; set; }

        [JsonPropertyName("content")]
        public string Content { get; set; }
    }
}
