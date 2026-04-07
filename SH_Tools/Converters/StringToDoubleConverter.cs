using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace SH_Tools.Converters
{
    public class StringToDoubleConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is double)
            {
                return ((double)value).ToString((string)parameter);
            }
            return null;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            string stringValue = value as string;
            double result;
            if (double.TryParse(stringValue, out result))
            {
                return result;
            }
            return DependencyProperty.UnsetValue;
        }
    }
}
