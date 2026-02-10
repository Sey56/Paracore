using Autodesk.Revit.DB;
using System;

namespace Paracore.Addin.Helpers
{
    public class UniversalSelectionFilter : Autodesk.Revit.UI.Selection.ISelectionFilter
    {
        private readonly ElementId? _categoryId;
        private readonly Type? _classType;

        public UniversalSelectionFilter(ElementId? categoryId, Type? classType)
        {
            _categoryId = categoryId;
            _classType = classType;
        }

        public bool AllowElement(Element elem)
        {
            // Priority 1: Check Class Type (Robust)
            if (_classType != null)
            {
                return _classType.IsAssignableFrom(elem.GetType());
            }

            // Priority 2: Check Category ID
            if (_categoryId != null)
            {
                return elem.Category != null && elem.Category.Id.Value == _categoryId.Value;
            }

            return true;
        }

        public bool AllowReference(Reference reference, XYZ position)
        {
            return false;
        }
    }
}
