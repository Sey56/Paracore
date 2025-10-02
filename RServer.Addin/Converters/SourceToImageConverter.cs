using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media.Imaging;

namespace RServer.Addin.Converters
{
    public class SourceToImageConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is string sourceString)
            {
                switch (sourceString.ToUpperInvariant())
                {
                    case "WEB":
                        return new BitmapImage(new Uri("pack://application:,,,/RServer.Addin;component/Images/web_icon.png"));
                    case "VSCODE":
                        return new BitmapImage(new Uri("pack://application:,,,/RServer.Addin;component/Images/vscode_icon.png"));
                    case "UNKNOWN":
                        return new BitmapImage(new Uri("pack://application:,,,/RServer.Addin;component/Images/unknown_icon.png"));
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
