using Autodesk.Revit.UI;
using RServer.Addin.ViewModels;
using RServer.Addin.Context;

namespace RServer.Addin.Commands
{
    public class ServerActionHandler : IExternalEventHandler
    {
        private readonly ServerViewModel _viewModel;

        public ServerActionHandler(ServerViewModel viewModel)
        {
            _viewModel = viewModel;
        }

        public void Execute(UIApplication app)
        {
            // The dispatcher holds the correct context internally. 
            // Passing a new or different context here would be incorrect.
            _viewModel.ExecuteCodeInRevit(null);
        }

        public string GetName() => "RScript Code Executor";
    }
}