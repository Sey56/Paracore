using Autodesk.Revit.UI;
using SH_Tools.ViewModels;

namespace SH_Tools.Handlers
{
    public class CreateRevitElementsExternalEvent(CadViewModel viewModel) : IExternalEventHandler
    {
        private readonly CadViewModel _cadViewModel = viewModel;

        public void Execute(UIApplication app)
        {
            _cadViewModel.CreateElementsInRevit(app);

            // Set the status bar message
            _cadViewModel.StatusBarMessage = _cadViewModel.CreationMessage;
        }

        public string GetName()
        {
            return "Create Revit Elements";
        }
    }
}