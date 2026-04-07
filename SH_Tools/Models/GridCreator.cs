using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;

namespace SH_Tools.Models
{
    public static class GridCreator
    {
        public static bool GridIsCreated { get; set; } = false;


        public static bool CreateGrids(UIApplication uiApp, List<Line> gridLines)
        {
            // If grids have already been created, do not create them again
            if (GridIsCreated)
            {
                return false;
            }

            Document doc = uiApp.ActiveUIDocument.Document;
            int totalGridsCreated = 0; // Counter for total grids created

            // Start a new transaction
            using (Transaction tx = new(doc))
            {
                tx.Start("Create Grids");
                // Organize the lines by their direction
                Dictionary<string, List<Line>> linesByDirection = LineUtility.OrganizeLinesByDirectionAndDistance(gridLines);

                // Sort the dictionary entries by the count of lines in each direction
                var sortedByCount = linesByDirection.OrderByDescending(entry => entry.Value.Count).ToList();

                // Get the two directions with the most lines
                List<Line> mostCommonDirection1 = sortedByCount[0].Value;
                List<Line> mostCommonDirection2 = sortedByCount[1].Value;
                // Reverse the order of the lines in the first direction
                mostCommonDirection1.Reverse();
                // Get all existing grids in the document
                FilteredElementCollector gridCollector = new FilteredElementCollector(doc).OfClass(typeof(Grid));
                List<Line?> existingGridLines = gridCollector.Cast<Grid>().Select(g => g.Curve as Line).ToList();

                // Now you can create and name the grids
                int i = 1; // Counter for the first direction
                char j = 'A'; // Counter for the second direction

                foreach (Line line in mostCommonDirection1)
                {
                    // Check if a similar grid already exists
                    if (!existingGridLines.Any(existingLine => LineUtility.AreCollinear(line, existingLine) && LineUtility.AreMidPointsAlmostEqualTo(line, existingLine)))
                    {
                        Grid newGrid = Grid.Create(uiApp.ActiveUIDocument.Document, line);
                        newGrid.Name = $"{i++}"; // Name the grids in the first direction as 1, 2, 3, ...
                        totalGridsCreated++;
                    }
                    else
                    {
                        GridIsCreated = true;
                        return false; // Skip the rest of the method
                    }
                }

                foreach (Line line in mostCommonDirection2)
                {
                    // Check if a similar grid already exists
                    if (!existingGridLines.Any(existingLine => LineUtility.AreCollinear(line, existingLine) && LineUtility.AreMidPointsAlmostEqualTo(line, existingLine)))
                    {
                        Grid newGrid = Grid.Create(uiApp.ActiveUIDocument.Document, line);
                        newGrid.Name = $"{j++}"; // Name the grids in the second direction as A, B, C, ...
                        totalGridsCreated++;
                    }
                    else
                    {
                        GridIsCreated = true;
                        return false; // Skip the rest of the method
                    }
                }

                // Check if all lines have been used to create a grid
                if (totalGridsCreated == mostCommonDirection1.Count + mostCommonDirection2.Count)
                {
                    GridIsCreated = true;
                }

                // Commit the transaction
                tx.Commit();
            }

            return GridIsCreated;
        }
    }
}
