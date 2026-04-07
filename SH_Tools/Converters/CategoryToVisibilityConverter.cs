using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace SH_Tools.Converters
{
    public class CategoryToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            // Check if the value is a string and if it equals "Windows"
            if (value is string category && category == "Windows")
            {
                // If the category is "Windows", return Visibility.Visible
                return Visibility.Visible;
            }

            // For all other categories, return Visibility.Collapsed
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
