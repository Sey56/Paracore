using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;
using System.IO;

namespace SH_Tools.Models
{
    public class WallLayerModel : BaseLayerModel
    {
        // Error log file name for WallLayerModelCreation
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "WallLayerModelCreation.txt");
        public Dictionary<string, List<GeometryObject>>? HostedWindowLines { get; }
        private List<CadDoor> _hostedDoors;
        public List<Line>? DoorLinesForWalls { get; set; }
        public List<Line>? WindowLineForWalls { get; set; }
        public List<CadWall> CadWalls { get; set; }
        public double Gap { get; set; }

        public WallLayerModel(CadModel cadModel, string layerName) : base(cadModel, layerName)
        {
            // The ImportInstance could have been transformed
            ImportInstance importInstance = cadModel.ImportInstance;
            Transform currentTransform = importInstance.GetTransform();
            try
            {
                if (cadModel.AllGapsForAllWalls.TryGetValue(LayerName, out double gap))
                {
                    Gap = gap;
                }
                var cadWindowsByHost = cadModel.AllCadWindowsByHostLayer;
                if (cadWindowsByHost.TryGetValue(LayerName, out List<CadWindow>? cadWindows))
                {
                    WindowLineForWalls = cadWindows.SelectMany(win => new List<Line> { win.WindowLines.Item1, win.WindowLines.Item2 }).ToList();
                }
                var cadDoorsByHost = cadModel.FullySetUpCadDoorsByHostLayer;

                if (cadDoorsByHost.TryGetValue(LayerName, out List<CadDoor>? hostedCadDoors))
                {
                    _hostedDoors = hostedCadDoors;
                }
                else
                {
                    _hostedDoors = [];
                }

                // We need the HostedCadDoors in DoorLayerModel to 
                // use the DoorLine property for making doors.

                // This should be all the WallLines in the HostedDoors flattened
                DoorLinesForWalls = _hostedDoors
        .SelectMany(door => new List<Line> { door.WallLines?.Item1, door.WallLines?.Item2 })
        .ToList();

                //TaskDialog.Show("LayerUnits for this door: ", $"{LayerUnits.Count}");
                // Add them to the LayerUnits (wall layer geoObjects)
                LayerUnits.AddRange(DoorLinesForWalls);
                LayerUnits.AddRange(WindowLineForWalls);
                //TransformedLines = CreateTransformedLines(LayerUnits.Cast<Line>().ToList(), currentTransform);
                FinalObjects = ComputeFinalObjects(LayerUnits); // to populate FinalObjects

                // Make CadWall objects from the FinalObjects
                CadWalls = CreateCadWalls(FinalObjects);
            }
            catch (System.Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the WallLayerModelCreation.txt file in your home directory for details.");
            }
        }

        protected override List<GeometryObject> ComputeFinalObjects(List<GeometryObject> layerUnits)
        {
            // Cast wallLayerUnits GeometryObject list to Lines list
            List<Line> lines = layerUnits.OfType<Line>().ToList();

            List<List<Line>> collinerLinesLists = WallLayerProcessor.CollinearLists(lines);
            List<List<Line>> orientedCollinearLists = WallLayerProcessor.OrientedCollinearLists(collinerLinesLists);
            List<List<Line>> mergedCollinearLists = WallLayerProcessor.MergeCollinearLists(orientedCollinearLists);
            List<Line> mergedFlattened = WallLayerProcessor.FlattenMergedCollinearLists(mergedCollinearLists);
            List<List<Line>> pairedLinesLists = WallLayerProcessor.GroupFlattenedIntoPairs(mergedFlattened, Gap);

            // Filter pairedLinesLists to only include lists with two elements
            List<List<Line>> filteredPairedLinesLists = pairedLinesLists.Where(list => list.Count == 2).ToList();

            // Now pass the filtered list to the next method
            List<Line> midLines = WallLayerProcessor.MidLines(filteredPairedLinesLists);

            // Cast List<Line> back to List<GeometryObject>
            return midLines.Cast<GeometryObject>().ToList();
        }

        public static List<CadWall> CreateCadWalls(List<GeometryObject> finalObjects)
        {
            var cadWalls = new List<CadWall>();
            foreach (var wallLine in finalObjects.Cast<Line>().ToList())
            {
                var cadWall = new CadWall(wallLine, "");
                cadWalls.Add(cadWall);

            }
            return cadWalls;
        }
    }
}