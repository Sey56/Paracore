using Autodesk.Revit.DB;
using SH_Tools.LineUtils;

namespace SH_Tools.Models
{
    public class BeamLayerModel : BaseLayerModel
    {
        public List<CadBeam> CadBeams {  get; set; } 
        public BeamLayerModel(CadModel cadModel, string layerName) : base(cadModel, layerName)
        {
            //FinalObjects = ComputeFinalObjects(LayerUnits);
            CadBeams = CreateCadBeams(FinalObjects);
        }
        protected override List<GeometryObject> ComputeFinalObjects(List<GeometryObject> geoObjects)
        {
            List<PolyLine> columnRectangles = CadModel.ColumnPolyLines;

            // Organize the lines by their direction
            Dictionary<string, List<Line>> linesByDirection = LineUtility.OrganizeLinesByDirectionAndDistance(geoObjects.Cast<Line>().ToList());

            // Sort the dictionary entries by the count of lines in each direction
            var sortedByCount = linesByDirection.OrderByDescending(entry => entry.Value.Count).ToList();

            // Get the two directions with the most lines
            List<Line> mostCommonDirection1 = sortedByCount[0].Value;
            List<Line> mostCommonDirection2 = sortedByCount[1].Value;

            // Combine the beam segments from both directions
            List<Line> segmentsForDirection1 = GetBeamSegments(mostCommonDirection1, columnRectangles);
            List<Line> segmentsForDirection2 = GetBeamSegments(mostCommonDirection2, columnRectangles);

            segmentsForDirection1.AddRange(segmentsForDirection2);

            return segmentsForDirection1.Cast<GeometryObject>().ToList();
        }

        public static List<Line> GetBeamSegments(List<Line> gridLines, List<PolyLine> columnRectangles)
        {
            List<Line> allSegments = [];

            // Loop through each Line in the gridLines list
            foreach (Line line in gridLines)
            {
                List<XYZ> pointsOnLine = []; // Moved outside the inner loop

                foreach (PolyLine cadColumn in columnRectangles)
                {
                    // Calculate the intersection points of the CadColumn with the line
                    for (int i = 0; i < cadColumn.NumberOfCoordinates - 1; i++)
                    {
                        Line columnEdge = Line.CreateBound(cadColumn.GetCoordinates()[i], cadColumn.GetCoordinates()[i + 1]);
                        IntersectionResultArray results;
                        SetComparisonResult result = line.Intersect(columnEdge, out results);

                        if (result == SetComparisonResult.Overlap)
                        {
                            XYZ intersection = results.get_Item(0).XYZPoint;
                            pointsOnLine.Add(intersection);
                        }
                    }
                }

                // Sort the points and create the line segments after checking all column centers
                List<XYZ> sortedPts = pointsOnLine.OrderBy(p => p.DistanceTo(line.GetEndPoint(0))).ToList();
                for (int i = 1; i < sortedPts.Count - 1; i += 2)
                {
                    allSegments.Add(Line.CreateBound(sortedPts[i], sortedPts[i + 1]));
                }
            }
            return [..allSegments];
        }

        static List<CadBeam> CreateCadBeams(List<GeometryObject> finalObjects)
        {
            var cadBeams = new List<CadBeam>();
            foreach (Line line in finalObjects.Cast<Line>().ToList())
            {
                cadBeams.Add(new CadBeam(line, ""));
            }
            return cadBeams;
        }
    }
}
