using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace SH_Tools.Converters
{
    public class MappingModeVisibilityConverter : IMultiValueConverter
    {
        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
        {
            if (values[0] is bool isMappingMode && values[1] is bool isMappingFinished && values[2] != null)
            {
                // In "Mapping" mode, the section is visible when the mapping is finished
                if (isMappingMode)
                {
                    return isMappingFinished ? Visibility.Visible : Visibility.Collapsed;
                }
                // In "Default" mode, the section is always visible when a file is selected
                else
                {
                    return Visibility.Visible;
                }
            }
            return Visibility.Collapsed;
        }

        public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
