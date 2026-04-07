using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using SH_Tools.Contracts;
using System.Collections.ObjectModel;

namespace SH_Tools.Services
{
    public class BeamTypeService : IElementTypeService<Element>
    {
        public ObservableCollection<Element> Elements { get; set; }
        public UIApplication UIApp { get; }

        private static BeamTypeService? _instance;
        public static BeamTypeService Instance
        {
            get
            {
                if (_instance == null)
                {
                    throw new Exception("Instance not initialized. Call Initialize() first.");
                }
                return _instance;
            }
        }

        private BeamTypeService(UIApplication uiApp)
        {
            UIApp = uiApp;
            Elements = []; // Initialize Elements here
            PopulateElementModels(UIApp.ActiveUIDocument.Document);

        }

        public static BeamTypeService GetInstance(UIApplication uiApp)
        {
            return _instance ??= new BeamTypeService(uiApp);
        }

        // Make FamilySymbol ObservableCollection from the filtered FamilySymbol objects
        public void PopulateElementModels(Document document)
        {
            var beamTypes = new FilteredElementCollector(document)
                .OfCategory(BuiltInCategory.OST_StructuralFraming).OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>().ToList();

            Elements.Clear();
            foreach (var beamType in beamTypes)
            {
                Elements.Add(beamType);
            }
        }

        // Event handler for DocumentChanged event
        public void OnDocumentChanged(object? sender, DocumentChangedEventArgs e)
        {
            var addedElementIds = e.GetAddedElementIds();
            var deletedElementIds = e.GetDeletedElementIds();

            if (addedElementIds != null && addedElementIds.Count != 0)
            {
                foreach (var addedElementId in addedElementIds)
                {
                    if (UIApp.ActiveUIDocument.Document.GetElement(addedElementId) is Level addedLevel)
                    {
                        Elements.Add(addedLevel);
                    }
                }
            }

            if (deletedElementIds != null && deletedElementIds.Count != 0)
            {
                foreach (var deletedElementId in deletedElementIds)
                {
                    var levelToRemove = Elements.FirstOrDefault(level => level.Id == deletedElementId);
                    if (levelToRemove != null)
                    {
                        Elements.Remove(levelToRemove);
                    }
                }
            }
        }
    }
}
