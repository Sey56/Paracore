using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;
using SH_Tools.Models;
using SH_Tools.LineUtils;
using SH_Tools.Utilities;
using System.IO;

namespace SH_Tools.ViewModels
{
    public class WindowLayerViewModel : BaseLayerViewModel
    {
        // Error log file name for WindowsCreation
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "WindowsCreationError.txt");
        const double TOLERANCE = 0.01;
        private ICollection<Element> _existingWindowsAtLevel = []; // Initialize to an empty list
        public List<CadWindow> CurrentLayerCadWindows { get; set; }
        private List<Wall> _existingWallsAtLevel = [];
        private readonly WindowLayerModel _windowLayerModel;
        public WindowLayerViewModel(WindowLayerModel windowLayerModel, CadViewModel cadViewModel)
            : base(windowLayerModel, cadViewModel)
        {
            _windowLayerModel = windowLayerModel;
            CurrentLayerCadWindows = windowLayerModel.CurrentLayerCadWindows;
        }

        public override void Create(UIApplication uiApp, Element element)
        {
            Document doc = uiApp.ActiveUIDocument.Document;
            Level baseLevel = _cadViewModel.SelectedBaseLevel;
            double sillHeight = _windowLayerModel.SillHeight;
            UnitOfMeasurement UserUnit = Converter.GetCurrentUnitSystem(doc);

            // Check if a window already exists at this location
            FamilySymbol selectedFamilySymbol = (FamilySymbol)element;
            FilteredElementCollector windowCollector = new(doc);
            _existingWindowsAtLevel = windowCollector
                .OfCategory(BuiltInCategory.OST_Windows)
                .OfClass(typeof(FamilyInstance))
                .WhereElementIsNotElementType()
                .WherePasses(new ElementLevelFilter(baseLevel.Id))
                .Where(win => ((FamilyInstance)win).Symbol.Id == selectedFamilySymbol.Id)
                .ToList();

            // Collect all the walls on the selected base level
            FilteredElementCollector wallCollector = new(doc);
            _existingWallsAtLevel = wallCollector
                .OfCategory(BuiltInCategory.OST_Walls)
                .WhereElementIsNotElementType()
                .WherePasses(new ElementLevelFilter(baseLevel.Id))
                .Cast<Wall>().ToList();

            try
            {
                using Transaction tx = new(doc);
                tx.Start("Create Windows");

                if (!selectedFamilySymbol.IsActive)
                {
                    selectedFamilySymbol.Activate();
                    doc.Regenerate();
                }

                foreach (CadWindow cadWindow in CurrentLayerCadWindows)
                {
                    XYZ start = cadWindow.WindowLine.GetEndPoint(0);
                    XYZ end = cadWindow.WindowLine.GetEndPoint(1);
                    start = new XYZ(start.X, start.Y, start.Z + baseLevel.Elevation);
                    end = new XYZ(end.X, end.Y, end.Z + baseLevel.Elevation);
                    Line adjustedWindowLine = Line.CreateBound(start, end);

                    XYZ midpoint = 0.5 * (cadWindow.WindowLine.GetEndPoint(0) + cadWindow.WindowLine.GetEndPoint(1));
                    midpoint = new XYZ(midpoint.X, midpoint.Y, midpoint.Z + baseLevel.Elevation);
                    bool windowExists = false;

                    // Find host wall for the adjustedWindowLine
                    Wall? hostWall = LineUtility.FindHostWall(adjustedWindowLine, _existingWallsAtLevel);

                    // If hostWall is not null set the cadWindow's HostWall property to hostWall
                    if (hostWall != null)
                    {
                        cadWindow.HostWall = hostWall;
                        // Okay now host wall is found and set but we need to check
                        // If there are no windows at the same location as the ones
                        // we are trying to create now

                        if (_existingWindowsAtLevel.Count > 0)
                        {
                            foreach (FamilyInstance existingWindowInstance in _existingWindowsAtLevel.Cast<FamilyInstance>())
                            {
                                XYZ? exisingInstLP = GetLocationPoint(existingWindowInstance);
                                if (exisingInstLP == null) continue;
                                if ((Math.Abs(exisingInstLP.X - midpoint.X) < TOLERANCE) && (Math.Abs(exisingInstLP.Y - midpoint.Y) < TOLERANCE))
                                {
                                    windowExists = true;
                                    // Increment the count of doors not created due to existing door
                                    cadWindow.StatusMessage = "window(s) exist(s).";
                                    break;
                                }
                            }
                        }
                    }
                    // Create Windows if there is no existing window at cadWindow location point
                    FamilyInstance? windowInstance = null;
                    if (!windowExists)
                    {
                        // Create a new window if its HostWall is not null

                        if (cadWindow.HostWall?.IsValidObject == true)
                        {
                            windowInstance = doc.Create.NewFamilyInstance(midpoint, selectedFamilySymbol, cadWindow.HostWall, baseLevel, StructuralType.NonStructural);

                            if (windowInstance != null)
                            {
                                Parameter sillHeightParam = windowInstance.get_Parameter(BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM);
                                if (sillHeightParam?.IsReadOnly == false)
                                {
                                    // Convert the SillHeight from the user's unit system to feet
                                    double sillHeightInFeet = Converter.ConvertToFeet(sillHeight, UserUnit);

                                    // Set the sill height to the converted value
                                    bool result = sillHeightParam.Set(sillHeightInFeet);
                                }



                                cadWindow.StatusMessage = "created successfully.";
                            }
                        }
                        else // If there is no HostWall for cadWindow
                        {
                            cadWindow.StatusMessage = "host wall(s) not found.";
                        }
                    }
                }

                tx.Commit();

                // Store the SharedData instance for this level in SharedDataStorage
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the WindowsCreationError.txt file in your home directory for details.");
            }
        }

        static XYZ? GetLocationPoint(FamilyInstance windowInstance)
        {
            if (windowInstance.Location is LocationPoint winLocationPT)
            {
                return winLocationPT.Point as XYZ;
            }
            return null;
        }

        public override string GetCreationMessage()
        {
            // Group the CadDoor objects by their status messages
            var groupedCadWindows = CurrentLayerCadWindows.GroupBy(cadWindow => cadWindow.StatusMessage);

            // Build the message
            string message = "";
            foreach (var group in groupedCadWindows)
            {
                message += $" {group.Count()} {group.Key} ";
            }

            return message;
        }
    }
}
