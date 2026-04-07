using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.ViewModels;
using SH_Tools.Views;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;

namespace SH_Tools
{
    [Transaction(TransactionMode.Manual)]
    public class OffsetMax : IExternalCommand
    {
        // Error log file name
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "OffsetMaxError.txt");

        // Keep a reference to the window
        private static Window? window;

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                UIApplication uiApp = commandData.Application;
                Document doc = uiApp.ActiveUIDocument.Document;

                // Create the ViewModel
                OffsetMaxViewModel viewModel = new OffsetMaxViewModel();
                viewModel.Levels = new ObservableCollection<Level>(new FilteredElementCollector(doc)
                    .OfClass(typeof(Level))
                    .Cast<Level>()
                    .OrderBy(l => l.Elevation));

                // Check if the window is already open
                if (window != null && window.IsVisible)
                {
                    // If the window is already open, bring it to the front and maximize it
                    window.Activate();
                    window.WindowState = WindowState.Maximized;
                    return Result.Succeeded;
                }

                // Create the window if it's not already open
                OffsetMaxView control = new OffsetMaxView(viewModel);
                window = new()
                {
                    Content = control,
                    Title = "OffsetMax version 1.0",
                    SizeToContent = SizeToContent.WidthAndHeight
                };

                // Get the Revit main window handle
                IntPtr revitMainWindowHandle = Process.GetCurrentProcess().MainWindowHandle;
                WindowInteropHelper helper = new(window)
                {
                    Owner = revitMainWindowHandle
                };

                window.Show();
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the OffsetMaxError.txt file in your home directory for details.");
            }
            return Result.Succeeded;
        }
    }
}
