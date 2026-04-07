using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.ViewModels;
using SH_Tools.Utilities;

namespace SH_Tools.Handlers
{
    public class OffsetMaxEventHandler : IExternalEventHandler
    {
        public Document? Document { get; set; }
        public OffsetMaxViewModel? ViewModel { get; set; }
        public Level? Level { get; set; }

        public OffsetMaxEventHandler(OffsetMaxViewModel offsetMaxViewModel)
        {
            ViewModel = offsetMaxViewModel;
        }

        public void Execute(UIApplication app)
        {
            // Get the active document from the UIApplication parameter
            Document = app.ActiveUIDocument.Document;
            if (Document != null && ViewModel != null && Level != null)
            {
                OffsetMaxUtils.ApplyOffsetMax(Document, ViewModel, Level);
            }

        }

        public string GetName()
        {
            return "OffsetMaxEventHandler";
        }
    }
}
