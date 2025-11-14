using Autodesk.Revit.UI;
using RServer.Addin.ViewModels;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;

namespace RServer.Addin.Views
{
    public partial class DashboardView : UserControl, IDockablePaneProvider
    {
        private bool _isDarkTheme = true;

        public DashboardView()
        {
            InitializeComponent();
            // Ensure DataContext is set to ServerViewModel.Instance
            DataContext = ServerViewModel.Instance;
        }

        public void SetupDockablePane(DockablePaneProviderData data)
        {
            data.FrameworkElement = this;
            data.InitialState = new DockablePaneState
            {
                DockPosition = DockPosition.Tabbed,
                TabBehind = DockablePanes.BuiltInDockablePanes.ProjectBrowser
            };
        }

        private void SwitchTheme_Click(object sender, RoutedEventArgs e)
        {
            _isDarkTheme = !_isDarkTheme;
            var themeDictionary = new ResourceDictionary
            {
                Source = new System.Uri(_isDarkTheme ? "Themes/DarkTheme.xaml" : "Themes/LightTheme.xaml", System.UriKind.Relative)
            };
            Resources.MergedDictionaries.Clear();
            Resources.MergedDictionaries.Add(themeDictionary);
        }

    }
}
