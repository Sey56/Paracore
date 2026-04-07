using System.Windows;
using System.Windows.Controls;
using SH_Tools.ViewModels;

namespace SH_Tools.Views
{
    /// <summary>
    /// Interaction logic for OffsetMaxView.xaml
    /// </summary>
    public partial class OffsetMaxView : UserControl
    {
        public OffsetMaxView(OffsetMaxViewModel offsetMaxViewModel)
        {
            InitializeComponent();
            this.DataContext = offsetMaxViewModel;

            // Handle the Loaded event to set the MinWidth, MinHeight, MaxWidth, MaxHeight properties
            this.Loaded += (s, e) =>
            {
                Window parentWindow = Window.GetWindow(this);
                if (parentWindow != null)
                {
                    parentWindow.ResizeMode = ResizeMode.NoResize; // Disable resizing
                    parentWindow.Width = 380; // Set fixed width
                    parentWindow.Height = 600; // Set fixed height
                    parentWindow.MinWidth = 380;
                    parentWindow.MaxWidth = 380;
                    parentWindow.MinHeight = 600;
                    parentWindow.MaxHeight = 600;
                }
            };
        }
    }
}
