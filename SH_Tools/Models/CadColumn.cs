using Autodesk.Revit.DB;
namespace SH_Tools.Models
{
    public class CadColumn(PolyLine pLine, string message)
    {
        public string StatusMessage = message;
        public PolyLine Polyline { get; set; } = pLine;
    }
}
