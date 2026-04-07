using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;
using SH_Tools.Models;
using SH_Tools.Services;
using System.Collections.ObjectModel;
using System.IO;

namespace SH_Tools.ViewModels
{
    public class BeamLayerViewModel : BaseLayerViewModel
    {
        // Error log file name for BeamsCreation
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "BeamsCreationError.txt");
        private readonly BeamLayerModel _beamLayerModel;
        private ICollection<Element> _existingBeamsAtRefLevel = []; // Initialize to an empty list
        private List<CadBeam> CadBeams { get; set; }
        public BeamLayerViewModel(BeamLayerModel layerModel, CadViewModel cadViewModel) : base(layerModel, cadViewModel)
        {
            _beamLayerModel = layerModel;
            CadBeams = _beamLayerModel.CadBeams;
        }
        public override void Create(UIApplication uiApp, Element element)
        {
            // Reset CreatedElementsCount at the start
            Document doc = uiApp.ActiveUIDocument.Document;

            // Get the base level from the _cadViewModel's SelectedBaseLevel property
            Level baseLevel = _cadViewModel.SelectedBaseLevel ?? throw new InvalidOperationException("No base level provided.");
            // Get the elevation of the SelectedBaseLevel
            double elevation = baseLevel.Elevation;
            // Get the top level which is one level above the base level
            ObservableCollection<Level> levelElements = new(_cadViewModel.LevelElements.OfType<Level>());
            Level topLevel = TopLevelService.GetLevelAbove(baseLevel, levelElements, uiApp) ?? throw new InvalidOperationException("No top constraint level provided.");

            FamilySymbol selectedFamilySymbol = (FamilySymbol)element;
            _existingBeamsAtRefLevel = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_StructuralFraming)
                .WhereElementIsNotElementType()
                .Where(bm => bm.get_Parameter(BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM).AsElementId() == baseLevel.Id)
                .ToList();

            try
            {
                // Reset the GridIsCreated flag before creating grids
                GridCreator.GridIsCreated = false;
                // If grids have not been created yet, create them
                if (!GridCreator.GridIsCreated)
                {
                    GridCreator.CreateGrids(uiApp, LayerUnits.OfType<Line>().ToList());
                }

                // Start a new transaction
                using Transaction tx = new(doc);
                tx.Start("Create Beams");

                // Activate the symbol if it's not active
                if (!selectedFamilySymbol.IsActive)
                {
                    selectedFamilySymbol.Activate();
                    doc.Regenerate(); // Regenerate the document to apply changes
                }

                // Create beams for the first direction
                foreach (CadBeam cadBeam in CadBeams)
                {
                    Line beamSegment = cadBeam.BeamLine;
                    bool beamExists = false;

                    XYZ startPoint = new(beamSegment.GetEndPoint(0).X, beamSegment.GetEndPoint(0).Y, elevation);
                    XYZ endPoint = new(beamSegment.GetEndPoint(1).X, beamSegment.GetEndPoint(1).Y, elevation);
                    Line newBeamSegment = Line.CreateBound(startPoint, endPoint);

                    if (_existingBeamsAtRefLevel != null)
                    {
                        foreach (FamilyInstance beamInstance in _existingBeamsAtRefLevel.Cast<FamilyInstance>())
                        {
                            double beamHalfHeight = 0;
                            Parameter beamElevationParam = beamInstance.get_Parameter(BuiltInParameter.STRUCTURAL_ELEVATION_AT_BOTTOM);
                            if (beamElevationParam != null)
                            {
                                beamHalfHeight = -1 * beamElevationParam.AsDouble() / 2.0; // Divide by 2 to get half height
                            }
                            LocationCurve? existingBeamLC = beamInstance.Location as LocationCurve;
                            Line? existingBeamLine = existingBeamLC?.Curve as Line;

                            if (existingBeamLine != null)
                            {
                                if (LineUtility.AreLinesOverlapping(newBeamSegment, existingBeamLine))
                                {
                                    beamExists = true;
                                    cadBeam.StatusMessage = "beam(s) exist(s).";
                                    break;
                                }
                            }
                        }

                        if (!beamExists)
                        {
                            FamilyInstance? beamInstance = doc.Create.NewFamilyInstance(newBeamSegment, selectedFamilySymbol, baseLevel, StructuralType.Beam);
                            if (beamInstance != null)
                            {
                                // Set the beam's start and end extensions to zero
                                beamInstance.get_Parameter(BuiltInParameter.START_EXTENSION).Set(0);
                                beamInstance.get_Parameter(BuiltInParameter.END_EXTENSION).Set(0);
                                cadBeam.StatusMessage = "created successfully.";
                            }
                        }
                    }
                }
                // Commit the transaction
                tx.Commit();
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the BeamsCreationError.txt file in your home directory for details.");
            }
        }

        public override string GetCreationMessage()
        {
            // Group the CadDoor objects by their status messages
            var groupedCadBeams = CadBeams.GroupBy(cadBeam => cadBeam.StatusMessage);

            // Build the message
            string message = "";
            foreach (var group in groupedCadBeams)
            {
                message += $" {group.Count()} {group.Key} ";
            }

            return message;
        }
    }
}
