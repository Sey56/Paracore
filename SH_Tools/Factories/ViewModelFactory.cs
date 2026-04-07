using SH_Tools.Models;
using SH_Tools.ViewModels;

namespace SH_Tools.Factories
{
    public class ViewModelFactory
    {
        private readonly CadViewModel _cadViewModel; // Add a field to hold the _cadViewModel instance
        private readonly Dictionary<string, Func<BaseLayerModel, BaseLayerViewModel>> layerViewModelMapping;

        public ViewModelFactory(CadViewModel cadViewModel) // Adjust the constructor to take a _cadViewModel
        {
            _cadViewModel = cadViewModel; // Initialize the _cadViewModel instance

            layerViewModelMapping = new Dictionary<string, Func<BaseLayerModel, BaseLayerViewModel>>
        {
            { "Walls", (model) => new WallLayerViewModel((WallLayerModel)model, _cadViewModel) },
            { "Doors", (model) => new DoorLayerViewModel((DoorLayerModel)model, _cadViewModel) },
            { "Windows", (model) => new WindowLayerViewModel((WindowLayerModel)model, _cadViewModel) },
            { "Columns", (model) => new ColumnLayerViewModel((ColumnLayerModel)model, _cadViewModel) },
            { "Beams", (model) => new BeamLayerViewModel((BeamLayerModel)model, _cadViewModel) },
            // ... add other mappings ...
        };
        }

        public BaseLayerViewModel? CreateViewModel(string layerName, BaseLayerModel model, CadModel cadModel)
        {
            // Extract the category name from the layer name
            string? categoryName = cadModel.CategoryNames.FirstOrDefault(name => layerName.StartsWith(name));

            if (categoryName != null && layerViewModelMapping.TryGetValue(categoryName, out var viewModelFactory))
            {
                return viewModelFactory(model);
            }
            else
            {
                // Handle the case where there is no mapping for the category name
                return null;
            }
        }
        // ... rest of the class ...
    }
}