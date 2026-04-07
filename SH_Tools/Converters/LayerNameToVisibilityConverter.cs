using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace SH_Tools.Converters
{
    public class LayerNameToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            // Check if the value is a string
            if (value is string layerName)
            {
                // Check if the layer name starts with "Walls"
                if (layerName.StartsWith("Walls"))
                {
                    return Visibility.Visible;
                }
            }

            // Return Visibility.Collapsed for all other cases
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
