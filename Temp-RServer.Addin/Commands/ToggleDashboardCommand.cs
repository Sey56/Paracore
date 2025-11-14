using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RServer.Addin.App;
using RServer.Addin.ViewModels;

namespace RServer.Addin.Commands
{
    [Transaction(TransactionMode.Manual)]
    public class ToggleDashboardCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var dpid = new DockablePaneId(RServerApp.DashboardPaneId);
            var dp = commandData.Application.GetDockablePane(dpid);
            if (dp.IsShown())
            {
                dp.Hide();
            }
            else
            {
                dp.Show();
            }
            return Result.Succeeded;
        }
    }
}
