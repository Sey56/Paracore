using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System.Collections.ObjectModel;

namespace SH_Tools.Services
{
    public static class TopLevelService
    {
        public static Level GetLevelAbove(Level baseLevel, ObservableCollection<Level> levelElements, UIApplication uiApp)
        {
            try
            {
                // Get all levels from the levelElements
                List<Level> levels = [.. levelElements
                    .OfType<Level>()
                    .OrderBy(l => l.Elevation)];

                // Find the index of the base level in the sorted list
                int baseIndex = levels.IndexOf(baseLevel);

                // If the base level is the highest level, create a new level above it
                if (baseIndex == levels.Count - 1)
                {
                    double elevationDifference = baseLevel.Elevation - levels[baseIndex - 1].Elevation;

                    // Determine if levels are indexed
                    bool areLevelsIndexed = levels.All(l => int.TryParse(l.Name.Replace("Level ", ""), out _));

                    // Find the highest existing suffix number for the base level name
                    int highestSuffix = levels
                        .Where(l => l.Name.StartsWith(baseLevel.Name))
                        .Select(l =>
                        {
                            string suffix = l.Name.Replace(baseLevel.Name, "").Trim('[', ']');
                            return int.TryParse(suffix, out int number) ? number : 0;
                        })
                        .Max();

                    // Create a new level
                    Level newLevel;
                    using (Transaction t = new(uiApp.ActiveUIDocument.Document, "Create Level"))
                    {
                        t.Start();
                        double newElevation = baseLevel.Elevation + elevationDifference; // Set the elevation for the new level
                        newLevel = Level.Create(uiApp.ActiveUIDocument.Document, newElevation);

                        if (areLevelsIndexed)
                        {
                            // Find the highest level number
                            int highestLevelNumber = levels
                                .Select(l => int.TryParse(l.Name.Replace("Level ", ""), out int number) ? number : 0)
                                .Max();
                            newLevel.Name = $"Level {highestLevelNumber + 1}"; // Set the name for the new level
                        }
                        else
                        {
                            // Check if the base level name already has a suffix
                            string baseName = baseLevel.Name;
                            if (baseName.EndsWith(']'))
                            {
                                int lastIndex = baseName.LastIndexOf('[');
                                if (lastIndex != -1)
                                {
                                    baseName = baseName[..lastIndex];
                                }
                            }
                            newLevel.Name = $"{baseName}[{(highestSuffix + 1).ToString("D3")}]"; // Set the name for the new level
                        }

                        // Ensure the new level name is unique
                        if (levels.Any(l => l.Name == newLevel.Name))
                        {
                            throw new InvalidOperationException("A level with the same name already exists.");
                        }

                        t.Commit();
                    }

                    // Add the new level to the levelElements
                    levelElements.Add(newLevel);

                    return newLevel;
                }

                // Otherwise, return the next level in the list
                return levels[baseIndex + 1];
            }
            catch (Exception ex)
            {
                // Handle any errors that occur during the level creation process
                TaskDialog.Show("Error", $"An error occurred while creating the level: {ex.Message}");
                return baseLevel; // Return the base level as a default value
            }
        }
    }
}
