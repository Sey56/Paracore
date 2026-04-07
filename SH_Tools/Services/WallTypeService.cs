using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using SH_Tools.Contracts;
using System.Collections.ObjectModel;

namespace SH_Tools.Services
{
    public class WallTypeService : IElementTypeService<Element>
    {
        public ObservableCollection<Element> Elements { get; set; } // Make set accessor public
        public UIApplication UIApp { get; }

        private static WallTypeService? _instance;
        public static WallTypeService Instance
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

        private WallTypeService(UIApplication uiApp)
        {
            UIApp = uiApp;
            Elements = []; // Initialize Elements here
            PopulateElementModels(UIApp.ActiveUIDocument.Document);

            // Subscribe to the DocumentChanged event
            UIApp.Application.DocumentChanged += OnDocumentChanged;
        }

        public static WallTypeService GetInstance(UIApplication uiApp)
        {
            return _instance ??= new WallTypeService(uiApp);
        }

        // Make WallTypeModel ObservableCollection from the filtered WallType objects
        public void PopulateElementModels(Document document)
        {
            var wallTypes = new FilteredElementCollector(document)
                .OfCategory(BuiltInCategory.OST_Walls).OfClass(typeof(WallType))
                .Cast<WallType>().ToList();

            Elements.Clear();
            foreach (var wallType in wallTypes)
            {
                Elements.Add(wallType);
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