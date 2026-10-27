namespace Paracore.Addin.Models
{
    public class StructuredOutputPoco
    {
        public string Type { get; set; }
        public string Data { get; set; }
        public string Title { get; set; }
        /// <summary>JSON-deserialised mirror of StructuredOutputItem.CapExempt.</summary>
        public bool CapExempt { get; set; }
    }
}
