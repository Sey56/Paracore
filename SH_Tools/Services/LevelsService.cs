using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using SH_Tools.Contracts;
using System.Collections.ObjectModel;

namespace SH_Tools.Services
{
    public class LevelsService : IElementTypeService<Element>
    {
        public ObservableCollection<Element> Elements { get; set; }
        public UIApplication UIApp { get; }

        private static LevelsService? _instance;
        public static LevelsService Instance
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

        private LevelsService(UIApplication uiApp)
        {
            UIApp = uiApp;
            Elements = [];
            PopulateElementModels(UIApp.ActiveUIDocument.Document);

            // Subscribe to the DocumentChanged event
            UIApp.Application.DocumentChanged += OnDocumentChanged;
        }

        public static LevelsService GetInstance(UIApplication uiApp)
        {
            return _instance ??= new LevelsService(uiApp);
        }

        // Make Level ObservableCollection from the filtered Level objects
        public void PopulateElementModels(Document document)
        {
            var levels = new FilteredElementCollector(document)
                .OfClass(typeof(Level))
                .Cast<Level>()
                .ToList();

            Elements.Clear();
            foreach (var level in levels)
            {
                Elements.Add(level);
            }
        }

        // Handle the DocumentChanged event
        private void OnDocumentChanged(object? sender, DocumentChangedEventArgs e)
        {
            Document doc = e.GetDocument();

            foreach (ElementId addedElemId in e.GetAddedElementIds())
            {
                if (doc.GetElement(addedElemId) is Level level && !Elements.Any(e => e.Id == level.Id))
                {
                    Elements.Add(level);
                }
            }

            foreach (ElementId deletedElemId in e.GetDeletedElementIds())
            {
                var deletedLevel = Elements.FirstOrDefault(e => e.Id == deletedElemId);
                if (deletedLevel != null)
                {
                    Elements.Remove(deletedLevel);
                }
            }
        }
    }
}
