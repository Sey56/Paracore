using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Collection-level UI commands — Select, Zoom, Isolate, Hide, Unhide, Delete.
    /// </summary>
    public static partial class CollectionExtensions
    {
        /// <summary>
        /// Deletes all elements in the collection in a single transaction.
        /// Skips Pinned elements and Curtain Panels.
        /// </summary>
        public static IEnumerable<T> Delete<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (!list.Any()) { ExecutionGlobals.TrackPipeline(0); return elements; }

            var doc = list.First().Document;
            void Action()
            {
                foreach (var e in list)
                {
                    if (e == null || !e.IsValidObject || e.Id == ElementId.InvalidElementId) continue;
                    if (e.Pinned) continue;
                    if (e is Panel) continue;

                    if (e is FamilyInstance fi)
                    {
                        if (fi.Host is Wall hostWall && hostWall.WallType.Kind == WallKind.Curtain)
                            continue;
                    }

                    try { doc.Delete(e.Id); } catch { }
                }
            }
            try
            {
                if (doc.IsModifiable) Action();
                else Tx.Transact(doc, "Delete Elements", Action);
                ExecutionGlobals.TrackPipeline(-3);
            }
            catch { ExecutionGlobals.TrackPipeline(-4); throw; }
            return elements;
        }

        /// <summary>
        /// Selects the collection in the Revit UI and zooms to them.
        /// </summary>
        public static IEnumerable<T> Select<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var uidoc = new UIApplication(doc.Application).ActiveUIDocument;
                if (uidoc != null) uidoc.Selection.SetElementIds(list.Select(e => e.Id).ToList());
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Zooms the active view to fit the collection.
        /// </summary>
        public static IEnumerable<T> Zoom<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var uidoc = new UIApplication(doc.Application).ActiveUIDocument;
                if (uidoc != null) uidoc.ShowElements(list.Select(e => e.Id).ToList());
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Temporarily isolates the collection in the active view.
        /// </summary>
        public static IEnumerable<T> Isolate<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var doc = list.First().Document;
                var view = doc.ActiveView;
                if (view != null && view.CanEnableTemporaryViewPropertiesMode())
                {
                    void Action() => view.IsolateElementsTemporary(list.Select(e => e.Id).ToList());
                    try
                    {
                        if (doc.IsModifiable) Action();
                        else Tx.Transact(doc, "Isolate Elements", Action);
                        ExecutionGlobals.TrackPipeline(-3);
                    }
                    catch { ExecutionGlobals.TrackPipeline(-4); throw; }
                }
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Hides the collection in the active view.
        /// </summary>
        public static IEnumerable<T> Hide<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var view = list.First().Document.ActiveView;
                if (view != null)
                {
                    var hideable = list.Where(e => e.CanBeHidden(view)).Select(e => e.Id).ToList();
                    if (hideable.Any())
                    {
                        var doc = view.Document;
                        void Action() => view.HideElements(hideable);
                        try
                        {
                            if (doc.IsModifiable) Action();
                            else Tx.Transact(doc, "Hide Elements", Action);
                            ExecutionGlobals.TrackPipeline(-3);
                        }
                        catch { ExecutionGlobals.TrackPipeline(-4); throw; }
                    }
                }
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }

        /// <summary>
        /// Unhides the collection in the active view.
        /// </summary>
        public static IEnumerable<T> Unhide<T>(this IEnumerable<T> elements)
            where T : Element
        {
            var list = elements.ToList();
            if (list.Any())
            {
                var view = list.First().Document.ActiveView;
                if (view != null)
                {
                    var doc = view.Document;
                    void Action() => view.UnhideElements(list.Select(e => e.Id).ToList());
                    try
                    {
                        if (doc.IsModifiable) Action();
                        else Tx.Transact(doc, "Unhide Elements", Action);
                        ExecutionGlobals.TrackPipeline(-3);
                    }
                    catch { ExecutionGlobals.TrackPipeline(-4); throw; }
                }
            }
            ExecutionGlobals.TrackPipeline(list.Count);
            return list;
        }
    }
}
