using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using SH_Tools.LineUtils;

namespace SH_Tools.Utilities
{
    public static class WallOffsetAndBoreUtils
    {
        // Adjust Wall top offsets to upper slabs
        public static bool AdjustWallTopOffsetsToSlabs(Element wallElement, Document document, Level currentLevel)
        {
            Level? levelAbove = GetLevelAbove(document, currentLevel);
            if (levelAbove == null) return false;

            Solid? wallSolid = GetSolid(wallElement);
            if (wallSolid != null)
            {
                // Get all floor elements at the level above
                FilteredElementCollector floorCollector = new(document);
                List<Floor> floorsAtLevelAbove = floorCollector.OfClass(typeof(Floor))
                    .WherePasses(new ElementLevelFilter(levelAbove.Id))
                    .Cast<Floor>()
                    .ToList();

                if (floorsAtLevelAbove.Count == 0) return false;

                foreach (Floor floor in floorsAtLevelAbove)
                {
                    Solid? floorSolid = GetSolid(floor);
                    if (floorSolid != null)
                    {
                        Solid? intersectionSolid = BooleanOperationsUtils.ExecuteBooleanOperation(wallSolid, floorSolid, BooleanOperationsType.Intersect);
                        if (intersectionSolid?.Volume > 0.0001)
                        {
                            // Adjust the wallElement's top offset based on the floor's thickness
                            Parameter wallTopOffset = wallElement.get_Parameter(BuiltInParameter.WALL_TOP_OFFSET);
                            if (wallTopOffset != null)
                            {
                                double floorThickness = floor.get_Parameter(BuiltInParameter.FLOOR_ATTR_THICKNESS_PARAM).AsDouble();
                                wallTopOffset.Set(-floorThickness);
                            }
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        public static bool AdjustWallTopOffsetsToBeams(Element wallElement, Document document, Level currentLevel)
        {
            Level? levelAbove = GetLevelAbove(document, currentLevel);
            if (levelAbove == null) return false;

            Solid? wallSolid = GetSolid(wallElement);
            if (wallSolid != null)
            {
                // Get all beam elements at the level above
                FilteredElementCollector beamCollector = new(document);
                List<Element> beamsAtLevelAbove = beamCollector.OfCategory(BuiltInCategory.OST_StructuralFraming)
                    .WhereElementIsNotElementType()
                    .Where(bm => bm.get_Parameter(BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM).AsElementId() == levelAbove.Id)
                    .ToList();

                if (beamsAtLevelAbove.Count == 0) return false;

                foreach (Element beamInstance in beamsAtLevelAbove)
                {
                    Solid? beamSolid = GetSolid(beamInstance);
                    if (beamSolid != null)
                    {
                        Solid? intersectionSolid = BooleanOperationsUtils.ExecuteBooleanOperation(wallSolid, beamSolid, BooleanOperationsType.Intersect);
                        if (intersectionSolid?.Volume > 0.0001)
                        {
                            // Get the location curve of the wallElement and beam
                            Line? wallLocationCL = FindLocationCurveAsLine(wallElement);
                            Line? beamLocationCL = FindLocationCurveAsLine(beamInstance);

                            if (wallLocationCL != null && beamLocationCL != null)
                            {
                                if (LineUtility.AreParallel(wallLocationCL, beamLocationCL))
                                {
                                    // Adjust the wallElement's top offset based on the beam's depth/height
                                    Parameter wallTopOffset = wallElement.get_Parameter(BuiltInParameter.WALL_TOP_OFFSET);
                                    FamilySymbol beamType = (beamInstance as FamilyInstance)!.Symbol;
                                    Parameter beamHeightParam = beamType.LookupParameter("h");

                                    if (wallTopOffset != null && beamHeightParam != null)
                                    {
                                        double beamDepth = beamHeightParam.AsDouble();
                                        wallTopOffset.Set(-beamDepth);
                                    }
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            return false;
        }


        public static bool BoreWalls(Element wallElement, Document document, Level currentLevel)
        {
            Level? levelAbove = GetLevelAbove(document, currentLevel);
            if (levelAbove == null) return false;

            Solid? wallSolid = GetSolid(wallElement);
            if (wallSolid != null)
            {
                FilteredElementCollector beamCollector = new(document);
                List<Element> beamsAtLevelAbove = beamCollector.OfCategory(BuiltInCategory.OST_StructuralFraming)
                    .WhereElementIsNotElementType()
                    .Where(bm => bm.get_Parameter(BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM).AsElementId() == levelAbove.Id)
                    .ToList();

                if (beamsAtLevelAbove.Count == 0) return false;

                bool openingsCreated = false;

                foreach (Element beamInstance in beamsAtLevelAbove)
                {
                    Solid? beamSolid = GetSolid(beamInstance);
                    if (beamSolid != null)
                    {
                        Solid? intersectionSolid = BooleanOperationsUtils.ExecuteBooleanOperation(wallSolid, beamSolid, BooleanOperationsType.Intersect);
                        if (intersectionSolid?.Volume > 0.0001)
                        {
                            Line? wallLocationCL = FindLocationCurveAsLine(wallElement);
                            Line? beamLocationCL = FindLocationCurveAsLine(beamInstance);

                            if (wallLocationCL != null && beamLocationCL != null)
                            {
                                if (LineUtility.ArePerpendicular(wallLocationCL, beamLocationCL))
                                {
                                    EdgeArray? edgeArray = intersectionSolid?.Edges;
                                    List<XYZ> allEndpoints = new List<XYZ>();

                                    if (edgeArray != null)
                                    {
                                        foreach (Edge edge in edgeArray)
                                        {
                                            Curve curve = edge.AsCurve();
                                            allEndpoints.Add(curve.GetEndPoint(0));
                                            allEndpoints.Add(curve.GetEndPoint(1));
                                        }
                                    }

                                    XYZ? corner1 = null;
                                    XYZ? corner2 = null;
                                    double maxDistance = 0;

                                    for (int i = 0; i < allEndpoints.Count; i++)
                                    {
                                        for (int j = i + 1; j < allEndpoints.Count; j++)
                                        {
                                            double distance = allEndpoints[i].DistanceTo(allEndpoints[j]);
                                            if (distance > maxDistance)
                                            {
                                                maxDistance = distance;
                                                corner1 = allEndpoints[i];
                                                corner2 = allEndpoints[j];
                                            }
                                        }
                                    }
                                    Opening? createdOpening = null;
                                    if (wallElement is Wall wall && corner1 != null && corner2 != null)
                                    {
                                        // Create the opening
                                        createdOpening = document.Create.NewOpening(wall, corner1, corner2);
                                        openingsCreated = true;

                                        if (createdOpening != null)
                                        {
                                            createdOpening.Pinned = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                return openingsCreated;
            }
            return false;
        }

        // Find the level above the given level
        public static Level? GetLevelAbove(Document document, Level currentLevel)
        {
            // Implementation to get the level one level above the given level
            FilteredElementCollector levelCollector = new(document);
            List<Level> levels = [..levelCollector.OfClass(typeof(Level))
                .Cast<Level>()
                .OrderBy(l => l.Elevation)];

            int currentIndex = levels.FindIndex(l => l.Id == currentLevel.Id);
            if (currentIndex >= 0 && currentIndex < levels.Count - 1)
            {
                return levels[currentIndex + 1];
            }

            return null;
        }

        // Get the solid in the element
        private static Solid? GetSolid(Element element)
        {
            Solid? result = null;
            Options geomOptions = new()
            {
                ComputeReferences = true,
                IncludeNonVisibleObjects = true
            };
            GeometryElement geometryElement = element.get_Geometry(geomOptions);

            foreach (GeometryObject geomObj in geometryElement)
            {
                if (geomObj is Solid solid && solid.Volume > 0)
                {
                    result = solid;
                }
                else if (geomObj is GeometryInstance geomInst)
                {
                    GeometryElement instGeomElem = geomInst.GetInstanceGeometry();
                    result = instGeomElem.FirstOrDefault(item => item is Solid insSolid && insSolid.Volume > 0) as Solid;
                }
            }
            return result;
        }

        // Location curve for walls and beams
        private static Line? FindLocationCurveAsLine(Element element)
        {
            if (element.Location is LocationCurve locationCurve)
            {
                return locationCurve.Curve as Line;
            }

            return null;
        }
    }
}
