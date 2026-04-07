using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;
using SH_Tools.Utilities;
using System.Windows;

namespace SH_Tools.Models
{
    public class CadModel
    {
        const double TOLERANCE = 0.001; // CM
        private static readonly double MAX_WALL_WIDTH = Converter.ConvertToFeet(60, UnitOfMeasurement.Centimeters);
        public List<string> CategoryNames { get; } = ["Columns", "Beams", "Walls", "Doors", "Windows"];

        private UIApplication UiApp { get; }
        public ImportInstance ImportInstance { get; set; }

        // Dictionary that organizes objects first by category and then by layer
        public Dictionary<string, Dictionary<string, List<GeometryObject>>> ObjectsByCategoryAndLayer { get; }
        //public Dictionary<string, Color> LayerColors { get; private set; }

        public Dictionary<string, List<string>> CadLayerNamesByCategory { get; }
        public Dictionary<string, List<GeometryObject>> AllWallLayerUnits { get; }
        public Dictionary<string, List<GeometryObject>> AllDoorObjectsByLayer { get; }
        public Dictionary<string, List<GeometryObject>> AllWindowObjectsByLayer { get; }
        public Dictionary<string, List<CadWindow>> AllCadWindowsByOwnLayer { get; }
        public Dictionary<string, List<CadWindow>> AllCadWindowsByHostLayer { get; }

        public Dictionary<string, List<CadDoor>> OrientedCadDoors { get; set; }
        public Dictionary<string, List<CadDoor>> _cadDoorsByHostLayerName;
        public Dictionary<string, List<CadDoor>> FullySetUpCadDoorsByHostLayer { get; set; }
        public Dictionary<string, List<CadDoor>> FullySetUpCadDoorsByOwnLayer { get; set; }
        public List<PolyLine> ColumnPolyLines { get; }
        public Dictionary<string, double> AllGapsForAllWalls { get; set; }
        public Dictionary<string, List<(Line, Line)>> AllWindowPairsByLayer { get; set; }
        public CadModel(UIApplication uiApp, ImportInstance importInstance)
        {
            UiApp = uiApp;
            ImportInstance = importInstance;

            // Get the ImportInstance's transform
            Transform impInstanceTransform = ImportInstance.GetTransform();

            // ImportInstance's internal geometries are contained in a GeometryElement
            GeometryElement geometryElement = ImportInstance.get_Geometry(new Options());
            // Extract objects with their transform adjusted
            List<GeometryObject> extractGeometryObjectsWithAdjustedTransform = ExtractGeometryObjectsAndAdjustTransform(geometryElement);
            // Preserve their GraphicsStyleId (this addin can't work without preserving the layer names)
            Dictionary<GeometryObject, ElementId> geometryWithStyle = MapObjectsToStyle(extractGeometryObjectsWithAdjustedTransform);

            // The main object that has all the objects organized first by their
            // CategoryName and then by their Layer Name. A dictionary of dictionaries, where
            // the outer dictionary keys are the CategoryNames and the inner dictionary keys
            // are different layer names in each category
            ObjectsByCategoryAndLayer = GroupObjectsByCategoryAndLayer(geometryWithStyle);

            // All layers names in the linked/imported cad file
            var cadLayers = (from Category category in ImportInstance.Category.SubCategories select category.Name).ToList();

            AllWallLayerUnits = CategoryObjectsByLayer("Walls", ObjectsByCategoryAndLayer);
            AllGapsForAllWalls = GetGapsForAllWallLayers(AllWallLayerUnits);

            AllWindowObjectsByLayer = CategoryObjectsByLayer("Windows", ObjectsByCategoryAndLayer);
            var allWindowObjectsFlattened = AllWindowObjectsByLayer.SelectMany(kpv => kpv.Value).ToList();
            /////////////////////////////////////////////////////////////////////////////
            AllWindowPairsByLayer = GetAllWindowPairsByLayer(AllWindowObjectsByLayer);

            //MessageBox.Show($"Number of all window lines: {AllWindowPairsByLayer.SelectMany(ky => ky.Value.ToList()).Count()}");

            // CadWindows organized by their own layer names (window layer names)
            AllCadWindowsByOwnLayer = CollectAllCadWindowsByLayer(AllWindowPairsByLayer);

            var allCadWindowsFlattened = AllCadWindowsByOwnLayer.SelectMany(kpv => kpv.Value).ToList();
            AllCadWindowsByHostLayer = GetAllHostedCadWindowsByHostLayer(AllWallLayerUnits, allCadWindowsFlattened);

            var columnObjects = CategoryObjectsByLayer("Columns", ObjectsByCategoryAndLayer);
            ColumnPolyLines = columnObjects.SelectMany(kvp => kvp.Value.OfType<PolyLine>()).ToList();

            AllDoorObjectsByLayer = CategoryObjectsByLayer("Doors", ObjectsByCategoryAndLayer);

            var beamObjects = CategoryObjectsByLayer("Beams", ObjectsByCategoryAndLayer);
            //TaskDialog.Show("Beam Count: ", $"{beamObjects.Sum(kpv => kpv.Value.Count)}");

            // Initialize cdLayerNamesByCategory
            // This should contains layers only that have geometry
            CadLayerNamesByCategory = GetCadLayerNamesByCategory(ObjectsByCategoryAndLayer); // Adjusted to get layer names from the new structure

            // First all cad objects organized by CategoryName and then LayerName
            // i.e a dictionary of dictionaries for all objects in the cad
            // the first string is CategoryName and the second is LayerName

            // Then Isolate all wall wallLayerUnits for all wall layer types 
            // arranged by their layer names

            // Now set the gaps for all CadDoor objects
            // Then Isolate all winLine layer units for all winLine layer types
            // arranged by their layer names

            var allCadDoors = CollectAllCadDoors(AllDoorObjectsByLayer);
            // Find all the gaps for all wall layers

            // using the winLine layer objects from all winLine layer units collect the CadDoors
            // and return them arranged by their layer names
            var allCadDoorsByLayer = CollectAllCadDoors(AllDoorObjectsByLayer);

            // Then for each CadDoor the Leaf/Line and the Swing/Arc properties must be oriented
            OrientedCadDoors = OrientAllCadDoors(allCadDoors);// in a dictionary

            // OrientedCadDoors flattened
            List<CadDoor> allOrientedCadDoors = OrientedCadDoors.Values.SelectMany(list => list).ToList();

            // We need to check all CadDoor which wall layer they are hosted and
            // Arrange them by their host layer name.
            _cadDoorsByHostLayerName = CollectAllHostedDoorsByHostLayerName(AllWallLayerUnits, allOrientedCadDoors);

            // Based on their host layer wall's gap which is computed from the cad file lines
            // set the Gap property of each CadDoor (AllGapsForAllWalls contains each wall layer's
            // Gap as a Dictionary<string, double>. the key is the wall layer and the value is the Gap
            SetGapsForAllCadDoors(AllGapsForAllWalls, _cadDoorsByHostLayerName);

            // Based on the acquired Gap property set DoorLine and WallLines property of each CadDoor
            // This fullsetup CadDoor objects organized by host layer name is what the
            // WallLayerModel needs so that it can extract the WallLines property
            FullySetUpCadDoorsByHostLayer = GetFullySetUpCadDoorsByHostLayerName(_cadDoorsByHostLayerName);

            // After that make another dictionary where fully setup CadDoors are organized
            // by their own names. these are needed for the DoorLayerModel so that it can
            // extract the DoorLine property to make its doors
            FullySetUpCadDoorsByOwnLayer = GetFullySetUpCadDoorsByOwnLayer(FullySetUpCadDoorsByHostLayer);
        }

        // This is not only extracting the GeometryObject objects from the ImportInstance
        // But also adjusting the transforms for other nested GeometryInsance objects
        // which has solved the wierd behaviour of blocks and nested blocks
        // in autocad file that is linked in revit.
        private static List<GeometryObject> ExtractGeometryObjectsAndAdjustTransform(GeometryElement geoElement, Transform? parentTransform = null)
        {
            var objects = new List<GeometryObject>();
            foreach (var obj in geoElement)
            {
                if (obj == null) continue;
                if (obj is not GeometryInstance instance)
                {
                    if (obj is Line || obj is PolyLine || obj is Arc)
                    {
                        objects.Add(obj);
                    }
                }
                else
                {
                    var instanceTransform = instance.Transform;
                    if (parentTransform != null)
                    {
                        instanceTransform = parentTransform.Multiply(instanceTransform);
                    }

                    var geoElementInstance = instance.GetSymbolGeometry(instanceTransform);
                    objects.AddRange(ExtractGeometryObjectsAndAdjustTransform(geoElementInstance, instanceTransform));
                }
            }
            return objects;
        }

        // Map objects to their GraphicsStyleId without transforming
        static Dictionary<GeometryObject, ElementId> MapObjectsToStyle(List<GeometryObject> explodedObjects)
        {
            Dictionary<GeometryObject, ElementId> geometryWithStyle = [];

            foreach (var obj in explodedObjects)
            {
                 // Store the original GraphicsStyleId
                geometryWithStyle[obj] = obj.GraphicsStyleId; // Map the object to the original style
            }

            return geometryWithStyle;
        }

        // Method to populate the ObjectsByCategoryAndLayer property
        public Dictionary<string, Dictionary<string, List<GeometryObject>>> GroupObjectsByCategoryAndLayer(Dictionary<GeometryObject, ElementId> geometryWithStyle)
        {
            Dictionary<string, Dictionary<string, List<GeometryObject>>> OrganizedObjects = [];

            foreach (var kvp in geometryWithStyle)
            {
                GeometryObject geoObj = kvp.Key;
                ElementId styleId = kvp.Value;

                string layerName;
                Document document = UiApp.ActiveUIDocument.Document;
                using (var graphicsStyle = document.GetElement(styleId) as GraphicsStyle)
                {
                    if (graphicsStyle == null) continue;
                    layerName = graphicsStyle.GraphicsStyleCategory.Name;
                }

                string categoryName = CategoryNames.Find(name => layerName.StartsWith(name)) ?? "DefaultCategory";

                if (categoryName == null) continue; // If the layer name does not start with any category name, skip this object

                if (!OrganizedObjects.TryGetValue(categoryName, out Dictionary<string, List<GeometryObject>>? value))
                {
                    value = [];
                    OrganizedObjects[categoryName] = value;
                }

                if (!value.ContainsKey(layerName))
                {
                    value[layerName] = [];
                }

                value[layerName].Add(geoObj);
            }

            // Remove categories and layers that have no objects
            foreach (var category in OrganizedObjects.Where(kvp => kvp.Value.Values.All(list => list.Count == 0)).Select(kvp => kvp.Key).ToList())
            {
                OrganizedObjects.Remove(category);
            }

            return OrganizedObjects;
        }

        public static Dictionary<string, List<string>> GetCadLayerNamesByCategory(Dictionary<string, Dictionary<string, List<GeometryObject>>> objectsByCategoryAndLayer)
        {
            var userCadLayerNames = new Dictionary<string, List<string>>();

            foreach (var category in objectsByCategoryAndLayer)
            {
                userCadLayerNames[category.Key] = [.. category.Value.Keys];
            }

            return userCadLayerNames;
        }

        public void DeletePreviousImportInstance()
        {
            // If ImportInstance is null, there's nothing to delete, so return
            if (ImportInstance == null) return;

            using var trans = new Transaction(UiApp.ActiveUIDocument.Document, "Delete CAD");
            try
            {
                // Try to start the transaction and delete the ImportInstance
                trans.Start();
                UiApp.ActiveUIDocument.Document.Delete(ImportInstance.Id);
                trans.Commit();
            }
            catch (Autodesk.Revit.Exceptions.InvalidObjectException)
            {
                // If an InvalidObjectException is thrown, it means the ImportInstance has already been deleted.
                // This can happen if the user manually deletes the linked file in Revit without exiting the add-in's session.
                // In this case, we simply return without throwing an error, allowing the program to continue running.
                return;
            }
        }

        // Returns all objects of a category arranged by their layer names
        public static Dictionary<string, List<GeometryObject>> CategoryObjectsByLayer(
    string categoryName,
    Dictionary<string, Dictionary<string, List<GeometryObject>>> objectsByCategoryAndLayer)
        {
            double MIN_LENGTH_DOORS = Converter.ConvertToFeet(30, UnitOfMeasurement.Centimeters);
            double MIN_LENGTH_WALLS = Converter.ConvertToFeet(1, UnitOfMeasurement.Centimeters);
            double MIN_LENGTH_WINDOWS = Converter.ConvertToFeet(30, UnitOfMeasurement.Centimeters);

            double minLength;
            if (categoryName == "Doors")
            {
                minLength = MIN_LENGTH_DOORS;
            }
            else if (categoryName == "Windows")
            {
                minLength = MIN_LENGTH_WINDOWS;
            }
            else
            {
                minLength = MIN_LENGTH_WALLS;
            }

            if (objectsByCategoryAndLayer.TryGetValue(categoryName, out Dictionary<string, List<GeometryObject>>? tempObjectsByLayer))
            {
                var result = new Dictionary<string, List<GeometryObject>>();
                var objectsByLayer = tempObjectsByLayer ?? [];
                foreach (var kvp in objectsByLayer)
                {
                    string layerName = kvp.Key;
                    List<GeometryObject> objects = kvp.Value;

                    foreach (var geoObj in objects)
                    {
                        if (!result.ContainsKey(layerName))
                            result[layerName] = [];

                        if (geoObj is PolyLine polyline)
                        {
                            if (categoryName == "Columns" || categoryName == "Floors")
                            {
                                result[layerName].Add(polyline);
                            }
                            else if (categoryName != "Columns" && categoryName != "Floors")
                            {
                                var lines = ExplodeToLines(polyline, minLength).OfType<Line>().ToList();
                                result[layerName].AddRange(lines.Where(ln => ln.Length > minLength));
                            }
                        }
                        else if (geoObj is Line line && line.Length > minLength)
                        {
                            if (categoryName != "Columns" && categoryName != "Floors")
                            {
                                result[layerName].Add(line);
                            }
                        }
                        else if (geoObj is Arc arc && categoryName == "Doors")
                        {
                            result[layerName].Add(arc);
                        }
                    }
                }

                return result;
            }

            return [];
        }

        // Method for exploding PolyLine objects
        // Method for exploding PolyLine objects
        private static List<GeometryObject> ExplodeToLines(PolyLine polyline, double minLength)
        {
            var lines = new List<GeometryObject>();
            IList<XYZ> coords = polyline.GetCoordinates();
            for (int i = 0; i < coords.Count - 1; i++)
            {
                XYZ p1 = coords[i];
                XYZ p2 = coords[i + 1];
                if ((p2 - p1).GetLength() < minLength) continue;
                lines.Add(Line.CreateBound(p1, p2));
            }
            return lines;
        }

        // Collects all CadDoor based on layer name and the swing by taking all winLine layer
        // objects as a parameter
        public static Dictionary<string, List<CadDoor>> CollectAllCadDoors(Dictionary<string, List<GeometryObject>> allDoorObjects)
        {
            Dictionary<string, List<CadDoor>> allCadDoors = [];

            foreach (KeyValuePair<string, List<GeometryObject>> kvp in allDoorObjects)
            {
                string layerName = kvp.Key;
                List<GeometryObject> objects = kvp.Value;

                List<Arc> swings = [..objects.OfType<Arc>()];
                List<Line> potentialLeaves = [.. objects.OfType<Line>()];

                foreach (var swing in swings)
                {
                    if (!swing.IsBound) continue;
                    var swingCenter = swing.Center;
                    var swingStart = swing.GetEndPoint(0);
                    var swingEnd = swing.GetEndPoint(1);

                    var leaf = potentialLeaves.Find(line =>
                    {
                        var lineStart = line.GetEndPoint(0);
                        var lineEnd = line.GetEndPoint(1);

                        bool isLineStartAtSwingCenter = lineStart.IsAlmostEqualTo(swingCenter, TOLERANCE);
                        bool isLineEndAtSwingCenter = lineEnd.IsAlmostEqualTo(swingCenter, TOLERANCE);

                        var otherEndPoint = isLineStartAtSwingCenter ? lineEnd : lineStart;

                        bool isOtherEndPointAtSwingStartOrEnd = otherEndPoint.IsAlmostEqualTo(swingStart, TOLERANCE) ||
                                                                otherEndPoint.IsAlmostEqualTo(swingEnd, TOLERANCE);

                        bool hasSameLength = Math.Abs(line.Length - swing.Radius) < TOLERANCE;

                        return (isLineStartAtSwingCenter || isLineEndAtSwingCenter) &&
                               isOtherEndPointAtSwingStartOrEnd &&
                               hasSameLength;
                    });

                    if (leaf != null)
                    {
                        if (!allCadDoors.TryGetValue(layerName, out List<CadDoor>? value))
                        {
                            value = [];
                            allCadDoors[layerName] = value;
                        }

                        CadDoor newCadDoor = new(swing, leaf, Line.CreateBound(swing.Center, swing.GetEndPoint(0)));
                        if (newCadDoor != null)
                        {
                            newCadDoor.LayerName = layerName;
                            value.Add(newCadDoor);
                        }
                    }
                }
            }

            return allCadDoors;
        }

        // This orients the CadDoor's Leaf and Swing properties. After orienting
        // it creates and sets the Opening property of the CadDoor 
        public static Dictionary<string, List<CadDoor>> OrientAllCadDoors(Dictionary<string, List<CadDoor>> cadDoors)
        {
            Dictionary<string, List<CadDoor>> orientedCadDoors = [];

            // Iterate over each key-value pair in cadDoors
            foreach (KeyValuePair<string, List<CadDoor>> pair in cadDoors)
            {
                string layerName = pair.Key;
                List<CadDoor> doors = pair.Value;

                // If the layer name is not already a key in the dictionary, add it
                if (!orientedCadDoors.TryGetValue(layerName, out List<CadDoor>? value))
                {
                    value = [];
                    orientedCadDoors[layerName] = value;
                }

                // Iterate over each CadDoor in doors
                foreach (CadDoor door in doors)
                {
                    Arc originalSwing = door.Swing;
                    Line leaf = door.Leaf;

                    if (!leaf.GetEndPoint(0).IsAlmostEqualTo(originalSwing.Center, TOLERANCE))
                    {
                        // Recreate the leaf so it starts at the center of the arc
                        leaf = Line.CreateBound(originalSwing.Center, leaf.GetEndPoint(0));
                    }

                    // Check if the arc's second point is not at the second point of the leaf
                    Arc swing = originalSwing;
                    if (!swing.GetEndPoint(1).IsAlmostEqualTo(leaf.GetEndPoint(1), TOLERANCE))
                    {
                        // If not, recreate the arc with swapped start and end points
                        swing = Arc.Create(swing.GetEndPoint(1), swing.GetEndPoint(0), swing.Evaluate(0.5, true));
                    }

                    // Create a new CadDoor with the reoriented swing and leaf
                    CadDoor newCadDoor = new(swing, leaf, Line.CreateBound(swing.Center, swing.GetEndPoint(0)));
                    if (newCadDoor != null)
                    {
                        newCadDoor.LayerName = layerName;  // Set the LayerName property
                        value.Add(newCadDoor);
                    }
                }
            }

            return orientedCadDoors;
        }

        // Method to return all CadDoors organized by their host layer names
        // here their Gap, DoorLine and WallLines property
        // are still 0, null, null respectively
        private static Dictionary<string, List<CadDoor>> CollectAllHostedDoorsByHostLayerName(
            Dictionary<string, List<GeometryObject>> allWallLayerUnits,
            List<CadDoor> allCadDoors)
        {
            var allCadDoorsByHostLayerName = new Dictionary<string, List<CadDoor>>();

            foreach (var wallLayerEntry in allWallLayerUnits)
            {
                string wallLayerName = wallLayerEntry.Key;
                List<GeometryObject> wallLayerUnits = wallLayerEntry.Value;

                // Find hosted doors for this wall layer
                List<CadDoor> hostedDoors = CollectHostedDoors(wallLayerUnits, allCadDoors);

                // Add to the result dictionary
                allCadDoorsByHostLayerName[wallLayerName] = hostedDoors;
            }

            return allCadDoorsByHostLayerName;
        }

        // This collects hosted CadDoors for a single wall layer
        private static List<CadDoor> CollectHostedDoors(List<GeometryObject> wallLayerunits, List<CadDoor> allCadDoors)
        {
            List<CadDoor> hostedDoors = [];

            foreach (CadDoor door in allCadDoors)
            {
                // Check for each wallLine in wallLayerunits
                foreach (Line line in wallLayerunits.OfType<Line>())
                {
                    // Use the Opening property of the winLine for comparison
                    Line doorOpening = door.Opening;

                    // Check conditions for both points of the wallLine
                    for (int i = 0; i < 2; i++)
                    {
                        const double Tolerance = 0.0001;
                        bool isPointAtCenterOrStart = line.GetEndPoint(i).IsAlmostEqualTo(door.Swing.Center, Tolerance) ||
                                                      line.GetEndPoint(i).IsAlmostEqualTo(door.Swing.GetEndPoint(0), Tolerance);
                        bool isPointCollinear = LineUtility.AreCollinear(line, doorOpening);

                        // If conditions are met, add the winLine
                        if (isPointAtCenterOrStart && isPointCollinear)
                        {
                            // Check if the winLine already exists in the list
                            if (!hostedDoors.Any(existingDoor => existingDoor.Equals(door)))
                            {
                                hostedDoors.Add(door);
                                break;  // Exit the loop as the winLine is already hosted
                            }
                        }
                    }
                }
            }

            return hostedDoors;
        }

        /////////////////////////////////////////////////////////////////////////

        // Returns paired window lines for a single window layer
        public static List<(Line, Line)> PairWindowLines(List<GeometryObject> windowLayerLines)
        {
            var pairedLines = new List<(Line, Line)>();

            // Sort the lines by start point's y-coordinate in ascending order
            var sortedLines = windowLayerLines
                    .OfType<Line>()
                    .OrderBy(line => line.GetEndPoint(0).Y)
                    .ThenBy(line => line.GetEndPoint(0).X)
                    .ToList();

            for (int i = 0; i < sortedLines.Count - 1; i++)
            {
                for (int j = i + 1; j < sortedLines.Count; j++)
                {
                    // Calculate the shortest spacing between the two lines
                    double spacing = LineUtility.ShortestDistanceVector(sortedLines[i], sortedLines[j]).GetLength();
                    // Check if the next line is parallel and a line projected from the midpoint of one line crosses the other line at its midpoint
                    bool areParallel = LineUtility.AreParallel(sortedLines[i], sortedLines[j]);
                    bool isPerpendicularIntersect = LineUtility.IsPerpendicularIntersectAtMidpoint(sortedLines[i], sortedLines[j]);
                    bool areEqualInLength = Math.Abs(sortedLines[i].Length - sortedLines[j].Length) < TOLERANCE;

                    if (areParallel && spacing < MAX_WALL_WIDTH && isPerpendicularIntersect && areEqualInLength && sortedLines[i] != sortedLines[j])
                    {
                        pairedLines.Add((sortedLines[i], sortedLines[j]));
                    }
                }
            }

            // Post-processing step to ensure all line pairs have the same direction
            for (int i = 0; i < pairedLines.Count; i++)
            {
                var pair = pairedLines[i];
                if (!pair.Item1.Direction.IsAlmostEqualTo(pair.Item2.Direction, TOLERANCE))
                {
                    // If the lines in the pair do not have the same direction, reverse the second line
                    Line line2 = Line.CreateBound(pair.Item2.GetEndPoint(1), pair.Item2.GetEndPoint(0));
                    pairedLines[i] = (pair.Item1, line2);
                }
            }

            return pairedLines;
        }

        // returns all paired lines for all window layers
        public static Dictionary<string, List<(Line, Line)>> GetAllWindowPairsByLayer(Dictionary<string, List<GeometryObject>> allWindowLayerUnits)
        {
            Dictionary<string, List<(Line, Line)>> allWindowPairsByLayer = [];

            foreach (var kvp in allWindowLayerUnits)
            {
                string windowLayerName = kvp.Key;
                List<GeometryObject> windowLayerLines = kvp.Value;

                // Pair the window lines
                List<(Line, Line)> pairedLines = PairWindowLines(windowLayerLines);

                // Add the paired lines to the dictionary
                allWindowPairsByLayer[windowLayerName] = pairedLines;
            }

            return allWindowPairsByLayer;
        }

        // First just collect all CadWindow objects and set the WindowLines and WindowLine properties
        // take as parameter Dictionary<string, List<(Line,LIne)> where string is the window layer name
        // and the two pair of lines are the lines that represent the window
        public static Dictionary<string, List<CadWindow>> CollectAllCadWindowsByLayer(Dictionary<string, List<(Line, Line)>> allWindowPairsByLayer)
        {
            var cadWindowsByLayer = new Dictionary<string, List<CadWindow>>();

            foreach (var kvp in allWindowPairsByLayer)
            {
                string windowLayerName = kvp.Key;
                List<(Line, Line)> windowPairs = kvp.Value;

                // Initialize a list to store the CadWindow objects for this layer
                List<CadWindow> cadWindows = [];

                foreach ((Line line1, Line line2) in windowPairs)
                {
                    // Create a CadWindow object from the pair of lines
                    CadWindow cadWindow = new(line1, line2)
                    {
                        // Set the LayerName property
                        LayerName = windowLayerName
                    };

                    // Add the CadWindow object to the list
                    cadWindows.Add(cadWindow);
                }

                // Add the list of CadWindow objects to the dictionary
                cadWindowsByLayer[windowLayerName] = cadWindows;
            }

            return cadWindowsByLayer;
        }

        private static List<CadWindow> GetHostedCadWindows(List<GeometryObject> wallLayerUnits, List<CadWindow> allCadWindows)
        {
            const double TOLERANCE = 0.0001;
            List<CadWindow> hostedWindows = [];

            foreach (CadWindow window in allCadWindows)
            {
                Line windowLine = window.WindowLines.Item1;

                // Check for each wallLine in wallLayerUnits
                foreach (Line line in wallLayerUnits.OfType<Line>())
                {
                    // Use one of the lines of the CadWindow.WindowLines property for comparison

                    bool areLinesCollinear = LineUtility.AreCollinear(line, windowLine);

                    bool endPointsMatch = line.GetEndPoint(0).IsAlmostEqualTo(windowLine.GetEndPoint(0), TOLERANCE) ||
                                             line.GetEndPoint(0).IsAlmostEqualTo(windowLine.GetEndPoint(1), TOLERANCE) ||
                                             line.GetEndPoint(1).IsAlmostEqualTo(windowLine.GetEndPoint(0), TOLERANCE) ||
                                             line.GetEndPoint(1).IsAlmostEqualTo(windowLine.GetEndPoint(1), TOLERANCE);

                    // If conditions are met, add the window
                    if (areLinesCollinear && endPointsMatch)
                    {
                        // Check if the window already exists in the list
                        if (!hostedWindows.Any(existingWindow => existingWindow.Equals(window)))
                        {
                            hostedWindows.Add(window);
                        }
                    }
                }
            }

            return hostedWindows;
        }

        private Dictionary<string, List<CadWindow>> GetAllHostedCadWindowsByHostLayer(
    Dictionary<string, List<GeometryObject>> allWallLayerUnits,
    List<CadWindow> allCadWindows)
        {
            var allWindowsByHostLayer = new Dictionary<string, List<CadWindow>>();

            foreach (var wallLayerEntry in allWallLayerUnits)
            {
                string wallLayerName = wallLayerEntry.Key;
                List<GeometryObject> wallLayerUnits = wallLayerEntry.Value;

                // Find hosted doors for this wall layer
                List<CadWindow> hostedDoors = GetHostedCadWindows(wallLayerUnits, allCadWindows);

                // Add to the result dictionary
                allWindowsByHostLayer[wallLayerName] = hostedDoors;
            }

            return allWindowsByHostLayer;
        }

        /////////////////////////////////////////////////////////////////////////

        // This finds Width of wall for all wall types (wall layer names)
        public static Dictionary<string, double> GetGapsForAllWallLayers(Dictionary<string, List<GeometryObject>> wallLayerUnits)
        {
            var gapsByHostWallLayerName = new Dictionary<string, double>();

            foreach (var layerName in wallLayerUnits.Keys)
            {
                var lines = wallLayerUnits[layerName].OfType<Line>().ToList();
                var gaps = new List<double>();

                for (int i = 0; i < lines.Count - 1; i++)
                {
                    for (int j = i + 1; j < lines.Count; j++)
                    {
                        Line line1 = lines[i];
                        Line line2 = lines[j];

                        if (line1 != null && line2 != null && LineUtility.AreParallel(line1, line2))
                        {
                            double gap = CalculateGap(line1, line2);
                            gaps.Add(gap);
                        }
                    }
                }

                // Find the most common gap for this layer
                double mostCommonGap = FindMostCommon(gaps);
                gapsByHostWallLayerName[layerName] = mostCommonGap;
            }

            return gapsByHostWallLayerName;
        }

        private static double FindMostCommon(List<double> gaps)
        {
            const double TOLERANCE = 0.001;
            Dictionary<double, int> gapCounts = [];
            foreach (double gap in gaps)
            {
                double closeKey = gapCounts.Keys.FirstOrDefault(k => Math.Abs(k - gap) <= TOLERANCE);
                if (closeKey != 0)
                {
                    gapCounts[closeKey]++;
                }
                else
                {
                    gapCounts[gap] = 1;
                }
            }

            return gapCounts.Aggregate((l, r) => l.Value > r.Value ? l : r).Key;
        }

        private static double CalculateGap(Line line1, Line line2)
        {
            return LineUtility.ShortestDistanceVector(line1, line2).GetLength();
        }

        public static void SetGapsForAllCadDoors(Dictionary<string, double> gapsByWallLayer, Dictionary<string, List<CadDoor>> allCadDoorsByHostLayer)
        {
            foreach (var wallLayerEntry in allCadDoorsByHostLayer)
            {
                string hostLayerName = wallLayerEntry.Key;
                var hostedDoors = wallLayerEntry.Value;

                if (gapsByWallLayer.TryGetValue(hostLayerName, out double value))
                {
                    double gapWidth = value;
                    foreach (var door in hostedDoors)
                    {
                        door.Gap = gapWidth;
                    }
                }
            }
        }

        // This will return CadDoor objects organized by their host wall layer names
        // and must be called after SetGapsForAllCadDoors is called. because
        // the DoorLine and BeamLine properties need Gap to be set
        public static Dictionary<string, List<CadDoor>> GetFullySetUpCadDoorsByHostLayerName(Dictionary<string, List<CadDoor>> cadDoorsByHostLayerName)
        {
            Dictionary<string, List<CadDoor>> fullySetUpCadDoorsByHostLayerName = [];

            foreach (var hostLayerName in cadDoorsByHostLayerName.Keys)
            {
                List<CadDoor> fullySetUpLayerDoors = [];

                foreach (var hostedDoor in cadDoorsByHostLayerName[hostLayerName])
                {
                    // Calculate DoorLine and WallLines based on the gap
                    hostedDoor.CreateLines(hostedDoor.Gap);

                    // Add the fully set up CadDoor to the list
                    fullySetUpLayerDoors.Add(hostedDoor);
                }

                // Add the list of fully set up CadDoors to the dictionary
                fullySetUpCadDoorsByHostLayerName[hostLayerName] = fullySetUpLayerDoors;
            }

            return fullySetUpCadDoorsByHostLayerName;
        }

        // This method returns fully setup CadDoor objects organized by their own layer names
        public static Dictionary<string, List<CadDoor>> GetFullySetUpCadDoorsByOwnLayer(Dictionary<string, List<CadDoor>> fullySetUpCadDoorsByHostLayer)
        {
            var fullySetUpCadDoorsByOwnLayer = new Dictionary<string, List<CadDoor>>();

            foreach (var hostLayerName in fullySetUpCadDoorsByHostLayer.Keys)
            {
                var hostedDoors = fullySetUpCadDoorsByHostLayer[hostLayerName];

                foreach (var door in hostedDoors)
                {
                    // Calculate DoorLine and WallLines based on the gap
                    door.CreateLines(door.Gap);

                    // Add the fully set up CadDoor to the appropriate list
                    if (!fullySetUpCadDoorsByOwnLayer.TryGetValue(door.LayerName, out List<CadDoor>? value))
                    {
                        value = [];
                        fullySetUpCadDoorsByOwnLayer[door.LayerName] = value;
                    }

                    value.Add(door);
                }
            }

            return fullySetUpCadDoorsByOwnLayer;
        }
    }
}
