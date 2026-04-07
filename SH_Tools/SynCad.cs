using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.ViewModels;
using SH_Tools.Views;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;


namespace SH_Tools
{
    [Regeneration(RegenerationOption.Manual)]
    [Transaction(TransactionMode.Manual)]
    public class SynCad : IExternalCommand
    {
        // Error log file name for Cad2RevitCommands
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "SynCadError.txt");

        // Keep a reference to the window
        private static Window? window;

        public Result Execute(ExternalCommandData comData, ref string msg, ElementSet elementSet)
        {
            try
            {
                UIApplication uiApp = comData.Application;
                CadViewModel cadModelView = new(uiApp);

                // Check if the window is already open
                if (window != null && window.IsVisible)
                {
                    // If the window is already open, bring it to the front and maximize it
                    window.Activate();
                    window.WindowState = WindowState.Maximized;
                    return Result.Succeeded;
                }

                // Create the window if it's not already open
                CadView cadView = new(cadModelView);
                window = new()
                {
                    Content = cadView,
                    SizeToContent = SizeToContent.WidthAndHeight,
                    Title = "SynCad version 1.0"
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
                TaskDialog.Show("Error", "An error occurred. Please check the SynCadError.txt file in your home directory for details.");
            }
            return Result.Succeeded;
        }
    }
}
