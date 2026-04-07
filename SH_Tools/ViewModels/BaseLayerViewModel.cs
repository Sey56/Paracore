using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.Models;

namespace SH_Tools.ViewModels
{
    public abstract class BaseLayerViewModel
    {
        protected BaseLayerViewModel(BaseLayerModel layerModel, CadViewModel cadViewModel)
        {
            LayerModel = layerModel;
            LayerUnits = layerModel.LayerUnits;
            FinalObjects = layerModel.FinalObjects;
            _cadViewModel = cadViewModel;
        }

        protected BaseLayerModel LayerModel { get; }
        protected List<GeometryObject> LayerUnits { get; }
        protected List<GeometryObject> FinalObjects { get; }
        protected CadViewModel _cadViewModel { get; } // Initialize _cadViewModel

        public abstract void Create(UIApplication uiApp, Element element);

        public abstract string GetCreationMessage();
    }
}
