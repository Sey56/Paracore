using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.ViewModels;
using System.Text;

namespace SH_Tools.Utilities
{
    public static class OffsetMaxUtils
    {
        public static void ApplyOffsetMax(Document document, OffsetMaxViewModel viewModel, Level level)
        {
            try
            {
                // Get all levels if the option is selected
                List<Level> levelsToProcess = viewModel.IsAllLevels ? viewModel.Levels.ToList() : new List<Level> { level };

                bool anyWallsProcessed = false;
                StringBuilder overallFeedback = new();
                StringBuilder logMessages = new();

                foreach (var lvl in levelsToProcess)
                {
                    // Get all walls on the level
                    FilteredElementCollector wallCollector = new(document);
                    List<Wall> wallsAtLevel = wallCollector.OfClass(typeof(Wall))
                        .WherePasses(new ElementLevelFilter(lvl.Id))
                        .Cast<Wall>()
                        .Where(wallInstance => wallInstance.WallType.Kind != WallKind.Curtain)
                        .ToList();

                    if (wallsAtLevel.Count == 0)
                    {
                        continue; // Skip to the next level if no walls are found
                    }

                    bool slabsFound = false;
                    bool beamsFound = false;
                    bool boresPerformed = false;

                    // Start a transaction to adjust offsets to slabs and beams
                    using (Transaction trans = new(document, "Adjust Offsets"))
                    {
                        trans.Start();

                        foreach (Element wallElement in wallsAtLevel)
                        {
                            if (viewModel.IsSlab)
                            {
                                slabsFound = WallOffsetAndBoreUtils.AdjustWallTopOffsetsToSlabs(wallElement, document, lvl) || slabsFound;
                            }
                            if (viewModel.IsBeam)
                            {
                                beamsFound = WallOffsetAndBoreUtils.AdjustWallTopOffsetsToBeams(wallElement, document, lvl) || beamsFound;
                            }
                        }

                        trans.Commit();
                    }

                    if (viewModel.IsBore)
                    {
                        // Start a transaction to disallow joins
                        using (Transaction trans = new(document, "Disallow Wall Joins"))
                        {
                            trans.Start();
                            DisallowJoinAllWalls(wallsAtLevel);
                            trans.Commit();
                        }

                        // Start a transaction to create openings
                        using (Transaction trans = new(document, "Create Openings"))
                        {
                            trans.Start();

                            foreach (Element wallElement in wallsAtLevel)
                            {
                                boresPerformed = WallOffsetAndBoreUtils.BoreWalls(wallElement, document, lvl) || boresPerformed;
                            }

                            trans.Commit();
                        }

                        // Start a transaction to rejoin walls
                        using (Transaction trans = new(document, "Allow Wall Joins"))
                        {
                            trans.Start();
                            AllowJoinAllWalls(wallsAtLevel, logMessages);
                            trans.Commit();
                        }
                    }

                    anyWallsProcessed = true;

                    overallFeedback.AppendLine($"{lvl.Name}: ToBeams: {(beamsFound ? "✔" : "✘")} | ToSlabs: {(slabsFound ? "✔" : "✘")} | Bore: {(boresPerformed ? "✔" : "✘")}");
                }

                if (!anyWallsProcessed)
                {
                    overallFeedback.AppendLine("No walls found at any of the specified levels.");
                }

                viewModel.FeedbackMessage = overallFeedback.ToString().Trim();
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Error", $"An error occurred: {ex.Message}");
            }
        }


        private static void DisallowJoinAllWalls( List<Wall> walls)
        {
            foreach (Wall wall in walls)
            {
                if (wall.Location is LocationCurve)
                {
                    WallUtils.DisallowWallJoinAtEnd(wall, 0);
                    WallUtils.DisallowWallJoinAtEnd(wall, 1);
                }
            }
        }

        private static void AllowJoinAllWalls(List<Wall> walls, StringBuilder logMessages)
        {
            foreach (Wall wall in walls)
            {
                if (wall.Location is LocationCurve)
                {
                   
                        WallUtils.AllowWallJoinAtEnd(wall, 0);
                        WallUtils.AllowWallJoinAtEnd(wall, 1);

                }
            }
        }
    }
}
