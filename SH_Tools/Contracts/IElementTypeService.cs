using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using System.Collections.ObjectModel;

namespace SH_Tools.Contracts
{
    public interface IElementTypeService<T>
    {
        ObservableCollection<T> Elements { get; set; }

        void PopulateElementModels(Document document);

    }
}

