using SH_Tools.Models;

namespace SH_Tools.Factories
{
    public class ModelFactory
    {
        private readonly Dictionary<string, Func<CadModel, string, BaseLayerModel>> layerModelMapping;

        public ModelFactory()
        {
            layerModelMapping = new Dictionary<string, Func<CadModel, string, BaseLayerModel>>
        {
            { "Walls", (cadModel, layerName) => new WallLayerModel(cadModel, layerName) },
            { "Doors", (cadModel, layerName) => new DoorLayerModel(cadModel, layerName) },
            { "Windows", (cadModel, layerName) => new WindowLayerModel(cadModel, layerName) },
            { "Columns", (cadModel, layerName) => new ColumnLayerModel(cadModel, layerName) },
            { "Beams", (cadModel, layerName) => new BeamLayerModel(cadModel, layerName) },
            // ... add other mappings ...
        };
        }

        public BaseLayerModel? CreateModel(string layerName, CadModel cadModel)
        {
            // Extract the category name from the layer name
            string? categoryName = cadModel.CategoryNames.FirstOrDefault(name => layerName.StartsWith(name));

            if (categoryName != null && layerModelMapping.TryGetValue(categoryName, out var modelFactory))
            {
                return modelFactory(cadModel, layerName);
            }
            else
            {
                // Handle the case where there is no mapping for the category name
                return null;
            }
        }
    }
}