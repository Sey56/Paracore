using Autodesk.Revit.DB;

namespace SH_Tools.Models
{
    public class DoorLayerModel : BaseLayerModel
    {
        public Dictionary<string, List<CadDoor>> _doorsByOwnLayer;
        public List<CadDoor> CurrentLayerCadDoors { get; set; }

        public DoorLayerModel(CadModel cadModel, string layerName) : base(cadModel, layerName)
        {
            // Assign the HostedCadDoors from the static class
            _doorsByOwnLayer = cadModel.FullySetUpCadDoorsByOwnLayer;

            // Filter the CadDoors based on the layer name
            if (_doorsByOwnLayer.TryGetValue(LayerName, out List<CadDoor>? currentDoors))
            {
                // doorDataForLayer now contains the list of CadDoors for the specified layer

                CurrentLayerCadDoors = currentDoors;
            }
            else
            {
                // Handle the case where there is no data for the specified layer
                // You might want to throw an exception, return, or set CurrentLayerCadDoors to an empty list
                CurrentLayerCadDoors = [];
            }
        }

        protected override List<GeometryObject>? ComputeFinalObjects(List<GeometryObject> layerUnits)
        {
            return null;
        }
    }
}
