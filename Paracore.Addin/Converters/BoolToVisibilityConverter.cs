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
                if (parameter != null && parameter.ToString().Equals("Inverse", StringComparison.OrdinalIgnoreCase))
                {
                    return boolValue ? Visibility.Collapsed : Visibility.Visible;
                }
                return boolValue ? Visibility.Visible : Visibility.Collapsed;
            }
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is Visibility visibility)
            {
                if (parameter != null && parameter.ToString().Equals("Inverse", StringComparison.OrdinalIgnoreCase))
                {
                    return visibility == Visibility.Collapsed;
                }
                return visibility == Visibility.Visible;
            }
            return false;
        }
    }
}
