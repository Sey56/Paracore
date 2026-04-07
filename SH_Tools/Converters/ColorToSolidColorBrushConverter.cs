using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace SH_Tools.Converters
{
    public class ColorToSolidColorBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is Autodesk.Revit.DB.Color color)
            {
                return new SolidColorBrush(new Color() { R = color.Red, G = color.Green, B = color.Blue, A = 255 });
            }
            return Brushes.Transparent; // Default color
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
