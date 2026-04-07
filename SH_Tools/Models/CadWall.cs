using Autodesk.Revit.DB;
namespace SH_Tools.Models
{
    public class CadWall(Line wLine, string message)
    {
        public string StatusMessage = message;
        public Line WallLine { get; set; } = wLine;
    }
}
