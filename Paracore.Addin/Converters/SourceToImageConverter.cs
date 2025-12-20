using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media.Imaging;

namespace Paracore.Addin.Converters
{
    public class SourceToImageConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is string sourceString)
            {
                switch (sourceString.ToUpperInvariant())
                {
                    case "PARACORE":
                        return null;
                    case "VSCODE":
                        return null;
                    default:
                        return null; // Or a default placeholder image
                }
            }
            return null; // Or a default placeholder image
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
