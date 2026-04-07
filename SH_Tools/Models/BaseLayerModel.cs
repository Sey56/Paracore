using Autodesk.Revit.DB;

namespace SH_Tools.Models
{
    public abstract class BaseLayerModel
    {
        protected CadModel CadModel { get; set; }
        public string LayerName { get; set; }
        public List<GeometryObject> LayerUnits { get; protected set; }
        public List<GeometryObject> FinalObjects { get; protected set; }
        protected BaseLayerModel(CadModel cadModel, string layerName)
        {
            CadModel = cadModel;
            LayerName = layerName;
            string categoryName = LayerName.Split('_')[0];
            var allObjectsOfCategory = CadModel.CategoryObjectsByLayer(categoryName, CadModel.ObjectsByCategoryAndLayer);
            if (allObjectsOfCategory.TryGetValue(LayerName, out List<GeometryObject>? objects))
            {
                LayerUnits = objects;
            }
            else
            {
                LayerUnits = [];
            }

            FinalObjects = ComputeFinalObjects(LayerUnits)!;
        }

        protected abstract List<GeometryObject>? ComputeFinalObjects(List<GeometryObject> geoObjects);
    }
}
