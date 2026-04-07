using Autodesk.Revit.DB;
namespace SH_Tools.Models
{
    public class CadBeam(Line wLine, string message)
    {
        public string StatusMessage = message;
        public Line BeamLine { get; set; } = wLine;
    }
}
