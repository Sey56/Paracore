using Autodesk.Revit.DB;

namespace SH_Tools.Models
{
    public class ColumnLayerModel : BaseLayerModel
    {
        public List<CadColumn> CadColumns { get; set; }
        public ColumnLayerModel(CadModel cadModel, string layerName) : base(cadModel, layerName)
        {
            FinalObjects = LayerUnits;
            CadColumns = CreateCadColumns(cadModel.ColumnPolyLines);
        }

        protected override List<GeometryObject> ComputeFinalObjects(List<GeometryObject> layerUnits)
        {
            return FinalObjects;
        }

        List<CadColumn> CreateCadColumns(List<PolyLine> finalObjects)
        {
            var cadColumns = new List<CadColumn>();
            foreach (PolyLine polyLine in finalObjects.Cast<PolyLine>().ToList())
            {
                cadColumns.Add(new CadColumn(polyLine, ""));
            }

            return cadColumns;
        }
    }
}
