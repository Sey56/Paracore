using Autodesk.Revit.DB;
using System.Windows;

namespace SH_Tools.Models
{
    public class WindowLayerModel : BaseLayerModel
    {
        public List<CadWindow> CurrentLayerCadWindows { get; set; }
        public double SillHeight { get; set; }

        public WindowLayerModel(CadModel cadModel, string layerName) : base(cadModel, layerName)
        {
            var allCadWindowsByLayer = cadModel.AllCadWindowsByOwnLayer;
            if (allCadWindowsByLayer.TryGetValue(LayerName, out List<CadWindow>? cadWindowsOfThisLayer))
            {
                CurrentLayerCadWindows = cadWindowsOfThisLayer;
                //List<Line> midLines = cadWindowsOfThisLayer.Select(win => win.WindowLine).ToList();
                //FinalObjects = midLines.Cast<GeometryObject>().ToList();
            }
            else
            {
                CurrentLayerCadWindows = [];
            }

            //MessageBox.Show($"Number of this doors: {CurrentLayerCadWindows.Count}");
        }

        protected override List<GeometryObject>? ComputeFinalObjects(List<GeometryObject> geoObjects)
        {
            return null;
        }
    }
}
