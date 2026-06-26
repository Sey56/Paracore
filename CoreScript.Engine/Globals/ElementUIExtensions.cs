using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Single-element UI commands — Select, Zoom, Isolate, Delete, Hide, Unhide.
    /// </summary>
    public static partial class ElementExtensions
    {
        public static Element Select(this Element e)
        {
            if (e == null) return e;
            var uidoc = new UIApplication(e.Document.Application).ActiveUIDocument;
            if (uidoc != null) uidoc.Selection.SetElementIds(new List<ElementId> { e.Id });
            return e;
        }

        public static Element Zoom(this Element e)
        {
            if (e == null) return e;
            var uidoc = new UIApplication(e.Document.Application).ActiveUIDocument;
            if (uidoc != null) uidoc.ShowElements(e);
            return e;
        }

        public static Element Isolate(this Element e)
        {
            if (e == null) return e;
            var view = e.Document.ActiveView;
            if (view != null && view.CanEnableTemporaryViewPropertiesMode())
            {
                void Action() => view.IsolateElementTemporary(e.Id);
                if (e.Document.IsModifiable) Action();
                else Tx.Transact(e.Document, "Isolate Element", Action);
            }
            return e;
        }

        public static Element Delete(this Element e)
        {
            if (e == null || !e.IsValidObject) return e;
            void Action() { if (e.IsValidObject) e.Document.Delete(e.Id); }
            if (e.Document.IsModifiable) Action();
            else Tx.Transact(e.Document, "Delete Element", Action);
            return e;
        }

        public static Element Hide(this Element e)
        {
            var view = e.Document.ActiveView;
            if (view != null && e.CanBeHidden(view))
            {
                void Action() => view.HideElements(new List<ElementId> { e.Id });
                if (e.Document.IsModifiable) Action();
                else Tx.Transact(e.Document, "Hide Element", Action);
            }
            return e;
        }

        public static Element Unhide(this Element e)
        {
            var view = e.Document.ActiveView;
            if (view != null)
            {
                void Action() => view.UnhideElements(new List<ElementId> { e.Id });
                if (e.Document.IsModifiable) Action();
                else Tx.Transact(e.Document, "Unhide Element", Action);
            }
            return e;
        }
    }
}
