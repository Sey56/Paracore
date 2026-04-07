using System.Windows;
using System.Windows.Controls;
using SH_Tools.ViewModels;

namespace SH_Tools.Views
{
    /// <summary>
    /// Interaction logic for CadView.xaml
    /// </summary>
    public partial class CadView : UserControl
    {
        public CadView(CadViewModel cadViewModel)
        {
            InitializeComponent();

            DataContext = cadViewModel;



            Loaded += (s, e) =>
            {
                Window parentWindow = Window.GetWindow(this);
                if (parentWindow != null)
                {
                    parentWindow.MinWidth = 540; // Set minimum width
                    //parentWindow.MinHeight = 600; // Set minimum height
                }
            };
        }
    }
}
