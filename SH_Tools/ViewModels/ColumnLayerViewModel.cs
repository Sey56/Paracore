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
    public class ColumnLayerViewModel : BaseLayerViewModel
    {
        // Error log file name for ColumnsCreation
        private readonly string filePath = Path.Combine(SH_ToolsApp.HomePath, "ColumnsCreationError.txt");
        private ColumnLayerModel _columnLayerModel;
        private ICollection<Element> _existingColumnsAtLevel = []; // Initialize to an empty list
        private List<CadColumn> CadColumns {  get; set; }

        public ColumnLayerViewModel(ColumnLayerModel columnLayerModel, CadViewModel cadViewModel)
            : base(columnLayerModel, cadViewModel)
        {
            _columnLayerModel = columnLayerModel;
            CadColumns = _columnLayerModel.CadColumns;
        }

        public override void Create(UIApplication uiApp, Element element)
        {
            // Reset CreatedElementsCount at the start
            Document doc = uiApp.ActiveUIDocument.Document;

            // Get the base level from the _cadViewModel's SelectedBaseLevel property
            Level baseLevel = _cadViewModel.SelectedBaseLevel ?? throw new InvalidOperationException("No base level provided."); // Use the _cadViewModel instance

            // Get the top level which is one level above the base level
            ObservableCollection<Level> levelElements = new(_cadViewModel.LevelElements.OfType<Level>());
            Level topLevel = TopLevelService.GetLevelAbove(baseLevel, levelElements, _cadViewModel.UIApp) ?? throw new InvalidOperationException("No top constraint level provided.");

            FamilySymbol selectedFamilySymbol = (FamilySymbol)element;

            FilteredElementCollector columnCollector = new(doc);
            _existingColumnsAtLevel = columnCollector
                .OfCategory(BuiltInCategory.OST_StructuralColumns)
                .OfClass(typeof(FamilyInstance))
                .WhereElementIsNotElementType()
                .WherePasses(new ElementLevelFilter(baseLevel.Id))
                .Where(col => ((FamilyInstance)col).Symbol.Id == selectedFamilySymbol.Id)
                .ToList();

            try
            {
                using Transaction trans = new(doc, "Create Columns");
                trans.Start(); // Start the transaction

                ////////////////////////////////////////////////////////////

                // Activate the symbol if it's not active
                if (!selectedFamilySymbol.IsActive)
                {
                    selectedFamilySymbol.Activate();
                    doc.Regenerate(); // Regenerate the document to apply changes
                }

                // Loop through each CadColumn in the CadColumns list
                foreach (CadColumn cadColumn in CadColumns)
                {
                    PolyLine cadPolyLine = cadColumn.Polyline;
                    bool columnExists = false;

                    // Calculate the center of the CadColumn
                    XYZ minPoint = cadPolyLine.GetCoordinates()[0];
                    XYZ maxPoint = cadPolyLine.GetCoordinates()[0];
                    for (int i = 1; i < cadPolyLine.NumberOfCoordinates; i++)
                    {
                        XYZ point = cadPolyLine.GetCoordinates()[i];
                        minPoint = new XYZ(Math.Min(minPoint.X, point.X), Math.Min(minPoint.Y, point.Y), 0);
                        maxPoint = new XYZ(Math.Max(maxPoint.X, point.X), Math.Max(maxPoint.Y, point.Y), 0);
                    }
                    XYZ center = minPoint + (0.5 * (maxPoint - minPoint));

                    // Calculate the orientation of the CadColumn
                    XYZ direction1 = cadPolyLine.GetCoordinates()[1] - cadPolyLine.GetCoordinates()[0];
                    XYZ direction2 = cadPolyLine.GetCoordinates()[2] - cadPolyLine.GetCoordinates()[1];
                    double angle1 = Math.Atan2(direction1.Y, direction1.X);
                    double angle2 = Math.Atan2(direction2.Y, direction2.X);

                    // Check the lengths of the sides
                    double length1 = direction1.GetLength();
                    double length2 = direction2.GetLength();

                    // Use the angle corresponding to the longer side
                    double angle = length1 > length2 ? angle1 : angle2;

                    // Calculate the center point at the base level
                    XYZ centerAtBaseLevel = new(center.X, center.Y, baseLevel.Elevation);
                    XYZ centerAtTopLevel = new(center.X, center.Y, topLevel.Elevation);
                    Line newLocationCurveAsLine = Line.CreateBound(centerAtBaseLevel, centerAtTopLevel);

                    foreach (FamilyInstance columnElement in _existingColumnsAtLevel.Cast<FamilyInstance>())
                    {
                        Line? existingLocCurveLine = FindLocationCurveAsLine(columnElement);
                        if (existingLocCurveLine != null)
                        {
                            if (LineUtility.AreLinesOverlapping(newLocationCurveAsLine, existingLocCurveLine))
                            {
                                columnExists = true;
                                cadColumn.StatusMessage = "column(s) exist(s).";
                                break;
                            }
                        }
                    }
                    if (!columnExists)
                    {
                        // Create a new column at the center using the selected FamilySymbol
                        FamilyInstance columnInstance = doc.Create.NewFamilyInstance(newLocationCurveAsLine, selectedFamilySymbol, baseLevel, StructuralType.Column);

                        if (columnInstance != null)
                        {
                            // Set the rotation of the column to match the orientation of the CadColumn
                            if (columnInstance.Location is LocationCurve locationCurveInstance)
                            {
                                XYZ curveCenter = 0.5 * (locationCurveInstance.Curve.GetEndPoint(0) + locationCurveInstance.Curve.GetEndPoint(1));
                                const double adjustment = 90 * (Math.PI / 180); // Convert 90 degrees to radians
                                locationCurveInstance.Rotate(Line.CreateBound(curveCenter, curveCenter + XYZ.BasisZ), angle + adjustment);
                            }

                            // Set the base and top levels of the column
                            columnInstance.get_Parameter(BuiltInParameter.FAMILY_BASE_LEVEL_PARAM).Set(baseLevel.Id);
                            columnInstance.get_Parameter(BuiltInParameter.FAMILY_TOP_LEVEL_PARAM).Set(topLevel.Id);

                            // call the OnElementsCreate event

                            cadColumn.StatusMessage = "created Successfully.";
                        }
                    }

                    /////////////////////////////////////////////////////////////

                }

                trans.Commit(); // Commit the transaction
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(filePath, ex.ToString());
                TaskDialog.Show("Error", "An error occurred. Please check the ColumnsCreationError.txt file in your home directory for details.");
            }
        }

        public override string GetCreationMessage()
        {
            // Group the CadDoor objects by their status messages
            var groupedCadDoors = CadColumns.GroupBy(cadDoor => cadDoor.StatusMessage);

            // Build the message
            string message = "";
            foreach (var group in groupedCadDoors)
            {
                message += $" {group.Count()} {group.Key} ";
            }

            return message;
        }

        static Line? FindLocationCurveAsLine(FamilyInstance columnInstance)
        {
            LocationCurve? locationCurve = columnInstance.Location as LocationCurve;
            return locationCurve?.Curve as Line;
        }
    }
}
