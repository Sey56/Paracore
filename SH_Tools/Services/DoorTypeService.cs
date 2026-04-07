using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using SH_Tools.Contracts;
using System.Collections.ObjectModel;

namespace SH_Tools.Services
{
    public class DoorTypeService : IElementTypeService<Element>
    {
        public ObservableCollection<Element> Elements { get; set; }
        public UIApplication UIApp { get; }

        private static DoorTypeService? _instance;
        public static DoorTypeService Instance
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

        private DoorTypeService(UIApplication uiApp)
        {
            UIApp = uiApp;
            Elements = []; // Initialize Elements here
            PopulateElementModels(UIApp.ActiveUIDocument.Document);

            // Subscribe to the DocumentChanged event
            UIApp.Application.DocumentChanged += OnDocumentChanged;
        }

        public static DoorTypeService GetInstance(UIApplication uiApp)
        {
            return _instance ?? (_instance = new DoorTypeService(uiApp));
        }

        // Make FamilySymbol ObservableCollection from the filtered FamilySymbol objects
        public void PopulateElementModels(Document document)
        {
            var doorTypes = new FilteredElementCollector(document)
                .OfCategory(BuiltInCategory.OST_Doors).OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>().ToList();

            Elements.Clear();
            foreach (var doorType in doorTypes)
            {
                Elements.Add(doorType);
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
