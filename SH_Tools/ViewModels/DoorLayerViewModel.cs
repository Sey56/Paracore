using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;
using SH_Tools.Models;
using System.IO;

namespace SH_Tools.ViewModels
{
    public class DoorLayerViewModel : BaseLayerViewModel
    {
        // Error log file name for DoorsCreation
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "DoorsCreationError.txt");
        const double TOLERANCE = 0.001;
        private ICollection<Element> _existingDoorsAtLevel = []; // Initialize to an empty list
        public List<CadDoor> CurrentLayerCadDoors { get; set; }
        private List<Wall> _existingWallsAtLevel = [];

        public DoorLayerViewModel(DoorLayerModel doorLayerModel, CadViewModel cadViewModel)
            : base(doorLayerModel, cadViewModel)
        {

            CurrentLayerCadDoors = doorLayerModel.CurrentLayerCadDoors;
        }

        public override void Create(UIApplication uiApp, Element element)
        {
            // Reset CreatedElementsCount at the start
            Document doc = uiApp.ActiveUIDocument.Document;
            Level baseLevel = _cadViewModel.SelectedBaseLevel;

            FamilySymbol selectedFamilySymbol = (FamilySymbol)element;
            FilteredElementCollector doorCollector = new(doc);
            _existingDoorsAtLevel = doorCollector
                .OfCategory(BuiltInCategory.OST_Doors)
                .OfClass(typeof(FamilyInstance))
                .WhereElementIsNotElementType()
                .WherePasses(new ElementLevelFilter(baseLevel.Id))
                .Where(door => ((FamilyInstance)door).Symbol.Id == selectedFamilySymbol.Id).ToList();

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
                tx.Start("Create Doors");

                if (!selectedFamilySymbol.IsActive)
                {
                    selectedFamilySymbol.Activate();
                    doc.Regenerate();
                }

                foreach (CadDoor cadDoor in CurrentLayerCadDoors)
                {
                    if (cadDoor.DoorLine == null) continue;
                    XYZ start = cadDoor.DoorLine.GetEndPoint(0);
                    XYZ end = cadDoor.DoorLine.GetEndPoint(1);
                    start = new XYZ(start.X, start.Y, start.Z + baseLevel.Elevation);
                    end = new XYZ(end.X, end.Y, end.Z + baseLevel.Elevation);
                    Line adjustedDoorLine = Line.CreateBound(start, end);

                    XYZ midpoint = 0.5 * (adjustedDoorLine.GetEndPoint(0) + adjustedDoorLine.GetEndPoint(1));
                    bool doorExists = false;

                    // Find the host wall for the adjusted door line
                    Wall? hostWall = LineUtility.FindHostWall(adjustedDoorLine, _existingWallsAtLevel);

                    // If hostWall is not null set the cadDoor's HostWall property to hostWall
                    if (hostWall?.IsValidObject == true)
                    {
                        // Set the cadDoor's HostWall property
                        cadDoor.HostWall = hostWall;
                        // Okay now host wall exists but we have to check
                        // if it doesn't host door at the same location
                        // we are tryin to create now

                        if (_existingDoorsAtLevel.Count != 0)
                        {
                            foreach (FamilyInstance existingDoorInstance in _existingDoorsAtLevel.Cast<FamilyInstance>())
                            {
                                XYZ? existingInstanceLPoint = GetDoorLocationPoint(existingDoorInstance);
                                if (existingInstanceLPoint == null) continue;
                                // We check if the existing door's location point is the same as
                                // the midpoint for the new door we are trying to create
                                // if the locations match it means there is a door
                                if (existingInstanceLPoint.IsAlmostEqualTo(midpoint, TOLERANCE))
                                {
                                    doorExists = true;
                                    cadDoor.StatusMessage = "door(s) exist(s).";
                                    break;
                                }
                            }
                        }
                    }

                    // Check if there is already a door at the specified location

                    FamilyInstance? doorInstance = null;
                    if (!doorExists)
                    {
                        // Use the HostWall property of the CadDoor to get the host wall
                        // and create a door hosted in it
                        if (cadDoor.HostWall?.IsValidObject == true)
                        {
                            doorInstance = doc.Create.NewFamilyInstance(midpoint, selectedFamilySymbol, cadDoor.HostWall, baseLevel, StructuralType.NonStructural);

                            if (doorInstance != null)
                            {
                                if (cadDoor.HostWall.Location is LocationCurve wallCurve)
                                {
                                    XYZ wallDirection = (wallCurve.Curve.GetEndPoint(1) - wallCurve.Curve.GetEndPoint(0)).Normalize();
                                    XYZ doorDirection = (adjustedDoorLine.GetEndPoint(1) - adjustedDoorLine.GetEndPoint(0)).Normalize();

                                    if (wallDirection.DotProduct(doorDirection) > 0)
                                    {
                                        doorInstance.flipHand();
                                        doorInstance.flipFacing();
                                    }

                                    bool isSwingClockwise = cadDoor.Swing.Normal.Z < 0;

                                    if (!isSwingClockwise)
                                    {
                                        doorInstance.flipFacing();
                                    }
                                }


                                cadDoor.StatusMessage = "created successfully.";
                            }
                        }
                        else // If cadDoor.HostWall is null
                        {
                            cadDoor.StatusMessage = "host wall(s) not found.";
                        }
                    }
                }

                tx.Commit();

                GetCreationMessage();
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the DoorsCreationError.txt file in your home directory for details.");
            }
        }

        static XYZ? GetDoorLocationPoint(FamilyInstance doorInstance)
        {
            if (doorInstance.Location is LocationPoint doorInstanceLPoint)
            {
                return doorInstanceLPoint.Point as XYZ;
            }

            return null;
        }

        public override string GetCreationMessage()
        {
            // Group the CadDoor objects by their status messages
            var groupedCadDoors = CurrentLayerCadDoors.GroupBy(cadDoor => cadDoor.StatusMessage);

            // Build the message
            string message = "";
            foreach (var group in groupedCadDoors)
            {
                message += $" {group.Count()} {group.Key} ";
            }

            return message;
        }

    }
}
