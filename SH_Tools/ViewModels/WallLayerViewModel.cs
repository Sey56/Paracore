using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;
using SH_Tools.Models;
using SH_Tools.Services;
using System.Collections.ObjectModel;
using System.IO;

namespace SH_Tools.ViewModels
{
    public class WallLayerViewModel : BaseLayerViewModel
    {
        // Error log file name for WallsCreation
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "WallsCreationError.txt");
        private ICollection<Element>? _existingWallsAtLevel;
        private readonly WallLayerModel _wallLayerModel;
        private List<CadWall> CadWalls {  get; set; }

        public WallLayerViewModel(WallLayerModel wallLayerModel, CadViewModel cadViewModel)
            : base(wallLayerModel, cadViewModel)
        {
            _wallLayerModel = wallLayerModel;
            CadWalls = _wallLayerModel.CadWalls;
            
        }

        public override void Create(UIApplication uiApp, Element element)
        {

            Document doc = uiApp.ActiveUIDocument.Document;

            // Get the base level from the _cadViewModel's SelectedBaseLevel property
            Level baseLevel = _cadViewModel.SelectedBaseLevel ?? throw new InvalidOperationException("No base level provided.");
            double elevation = baseLevel.Elevation;
            // Get the top level which is one level above the base level
            // Convert IEnumerable<Level> to ObservableCollection<Level>
            ObservableCollection<Level> observableLevels = new(_cadViewModel.LevelElements.OfType<Level>());

            // Get the top constraint level
            Level topLevel = TopLevelService.GetLevelAbove(baseLevel, observableLevels, uiApp)
                ?? throw new InvalidOperationException("No top constraint level provided.");

            // Check if a wall already exists at this location
            FilteredElementCollector collector = new(doc);
            _existingWallsAtLevel = [.. collector
                .OfClass(typeof(Wall))
                .WherePasses(new ElementLevelFilter(baseLevel.Id))];

            try
            {
                // Start a new transaction
                using Transaction tx = new(doc);
                tx.Start("Create Walls");

                // Loop through each newLine in the FinalObjects
                foreach (CadWall cadWall in CadWalls)
                {
                    bool wallExists = false;
                    if (_existingWallsAtLevel != null)
                    {
                        foreach (Wall existingWallInstance in _existingWallsAtLevel.Cast<Wall>())
                        {
                            // Given an existing line (newLine) and an elevation value:
                            Line newLine = cadWall.WallLine;
                            XYZ startPointAtLevel = new(newLine.GetEndPoint(0).X, newLine.GetEndPoint(0).Y, newLine.GetEndPoint(0).Z + elevation);
                            XYZ endPointAtLevel = new(newLine.GetEndPoint(1).X, newLine.GetEndPoint(1).Y, newLine.GetEndPoint(1).Z + elevation);

                            // Create a new line using the adjusted points:
                            Line updatedLine = Line.CreateBound(startPointAtLevel, endPointAtLevel);                            
                            bool isOverlapping = _existingWallsAtLevel.Cast<Wall>().Any(existingWallInstance =>
                            {
                                Line? existingWallLine = FindLocationCurveAsLine(existingWallInstance);
                                return existingWallLine != null && LineUtility.AreLinesOverlapping(updatedLine, existingWallLine);
                            });

                            Line? existingWallLine = FindLocationCurveAsLine(existingWallInstance);

                            // Check if the lines are collinear and if their midpoints approximately match
                            if (existingWallLine != null)
                            {
                                if (LineUtility.AreLinesOverlapping(updatedLine, existingWallLine))
                                {
                                    if (element is WallType wallToCreate && wallToCreate.Kind == WallKind.Curtain && existingWallInstance.WallType.Kind != WallKind.Curtain) continue;
                                    wallExists = true;
                                    cadWall.StatusMessage = "wall(s) exist(s).";
                                    break;
                                }
                            }
                        }
                    }

                    // If a wall does not already exist at this location, create a new one
                    if (!wallExists)
                    {
                        Wall wall = Wall.Create(doc, cadWall.WallLine, baseLevel.Id, false);
                        if (wall != null)
                        {
                            if (element is WallType wallType)
                            {
                                wall.WallType = wallType;
                            }

                            wall.get_Parameter(BuiltInParameter.WALL_HEIGHT_TYPE).Set(topLevel.Id);


                            cadWall.StatusMessage = "created successfully.";
                            // Update the ProgressValue after each element creation
                        }
                    }
                }

                // Commit the transaction
                tx.Commit();

                // Store the SharedData instance for this level in SharedDataStorage
            }
            catch (Exception ex)
            {
                // Log the exception to a file
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the WallsCreationError.txt file in your home directory for details.");
            }
        }

        static Line? FindLocationCurveAsLine(Wall wallInstance)
        {
            LocationCurve? wallLocationCurve = wallInstance.Location as LocationCurve;
            return wallLocationCurve?.Curve as Line;
        }

        public override string GetCreationMessage()
        {
            // Group the CadDoor objects by their status messages
            var groupedCadWalls = CadWalls.GroupBy(cadWall => cadWall.StatusMessage);

            // Build the message
            string message = "";
            foreach (var group in groupedCadWalls)
            {
                message += $" {group.Count()} {group.Key} ";
            }

            return message;
        }
    }
}