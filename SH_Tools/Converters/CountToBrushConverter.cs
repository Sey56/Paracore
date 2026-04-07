using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace SH_Tools.Converters
{
    public class CountToBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is int && (int)value > 0)
            {
                return Brushes.Black; // Normal color
            }
            return Brushes.Gray; // Dimmed color
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
