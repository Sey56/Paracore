using Autodesk.Revit.UI;
using System.Windows.Media.Imaging;
using System.IO;

namespace SH_Tools
{
    public class SH_ToolsApp : IExternalApplication
    {
        static readonly string AssemblyPath = typeof(SH_ToolsApp).Assembly.Location;
        readonly string IconPath = Path.Combine(Path.GetDirectoryName(AssemblyPath)!, "Images");

        // File path for all error logs
        public static readonly string HomePath = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        public Result OnShutdown(UIControlledApplication app)
        {
            return Result.Succeeded;
        }

        public Result OnStartup(UIControlledApplication app)
        {
            // Create custom tab
            string tabName = "SH_Tools";
            if (!app.GetRibbonPanels().Any(panel => panel.Name == tabName))
            {
                app.CreateRibbonTab(tabName);
            }

            // Create custom panel for SynCad
            const string synCadpanelName = "SynCad";
            RibbonPanel ribbonPanel = app.CreateRibbonPanel(tabName, synCadpanelName);

            // Create pushbutton for SynCad
            PushButtonData pushButtonData1 = new("SynCadPush", "SynCad", AssemblyPath, "SH_Tools.SynCad")
            {
                LargeImage = new BitmapImage(new Uri("pack://application:,,,/SH_Tools;component/Images/SynCad_32x32.png"))
            };

            // Add the pushbutton to the SynCad panel
            ribbonPanel.AddItem(pushButtonData1);

            // Create custom panel for OffsetMax
            const string offsetMaxPanelName = "OffsetMax";
            RibbonPanel offsetMasterPanel = app.CreateRibbonPanel(tabName, offsetMaxPanelName);

            // Create pushbutton for OffsetMax
            PushButtonData pushButtonData2 = new("OffsetPush", "OffsetMax", AssemblyPath, "SH_Tools.OffsetMax")
            {
                LargeImage = new BitmapImage(new Uri("pack://application:,,,/SH_Tools;component/Images/OffsetMax_32x32.png"))
            };

            // Add the pushbutton to the OffsetMax panel
            offsetMasterPanel.AddItem(pushButtonData2);


            return Result.Succeeded;
        }
    }
}
