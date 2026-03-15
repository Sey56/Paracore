using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Paracore.Addin.Converters
{
    public class BoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool boolValue)
            {
                return parameter != null && parameter.ToString().Equals("Inverse", StringComparison.OrdinalIgnoreCase)
                    ? boolValue ? Visibility.Collapsed : Visibility.Visible
                    : boolValue ? Visibility.Visible : Visibility.Collapsed;
            }
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is Visibility visibility)
            {
                return parameter != null && parameter.ToString().Equals("Inverse", StringComparison.OrdinalIgnoreCase)
                    ? visibility == Visibility.Collapsed
                    : visibility == Visibility.Visible;
            }
            return false;
        }
    }
}
