using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace SH_Tools.Services
{
    // In WallFetchingService.cs or similar
    public class WallFetchingService
    {
        private readonly UIApplication _uiApp;
        private readonly Guid _sharedParameterGuid;

        public WallFetchingService(UIApplication uiApp, Guid sharedParameterGuid)
        {
            _uiApp = uiApp;
            _sharedParameterGuid = sharedParameterGuid;
        }

        public List<Wall> GetWallsCreatedByAddIn()
        {
            Document doc = _uiApp.ActiveUIDocument.Document;
            FilteredElementCollector collector = new(doc);
            ICollection<ElementId> wallIds = collector.OfClass(typeof(Wall)).WhereElementIsNotElementType().ToElementIds();

            List<Wall> myWalls = [];
            foreach (ElementId id in wallIds)
            {
                Wall wall = doc.GetElement(id) as Wall;
                Parameter param = wall.get_Parameter(_sharedParameterGuid);
                if (param != null && param.AsString() == "Created by My Add-In")
                {
                    myWalls.Add(wall);
                }
            }

            return myWalls;
        }
    }
}
