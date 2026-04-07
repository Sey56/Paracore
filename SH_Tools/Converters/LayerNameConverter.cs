using System.Globalization;
using System.Windows.Data;

namespace SH_Tools.Converters
{
    public class LayerNameConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            string layerName = value as string;
            if (layerName != null)
            {
                var splitLayerName = layerName.Split('_');
                return splitLayerName.Length > 1 ? splitLayerName[1] : layerName;
            }
            return value;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
