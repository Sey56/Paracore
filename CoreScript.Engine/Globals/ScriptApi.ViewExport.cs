using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Image export — render a Revit view to a raster file so a script, or an AI agent
    /// driving the REPL, can LOOK at what it built.
    /// <para>
    /// ⚠ <b>This is a SHARED (non-Pro) capability.</b> It uses only
    /// <see cref="Autodesk.Revit.DB"/> — no Pro-only service — so it is present in the free
    /// build and the Pro build alike. Do not introduce a Pro dependency here; a free
    /// capability folded into a Pro file cannot be synced later (MASTER_SYSTEM_SPEC.md §4).
    /// </para>
    /// </summary>
    public static partial class ScriptApi
    {
        /// <summary>
        /// Exports a view to an image file and returns the path that was <b>actually written</b>.
        /// <para>
        /// <b>Why it returns a path instead of nothing:</b> Revit does not write the file you ask
        /// for. It appends the view identity to the base name and may switch the extension —
        /// a 3D or shaded view is written as <c>.jpg</c> regardless of the requested
        /// <see cref="ImageFileType"/>. Asking for <c>C:\tmp\shot</c> on the default 3D view
        /// produces <c>C:\tmp\shot - 3D View - {3D}.jpg</c>. The real file is therefore located
        /// by <b>prefix</b>, newest match, and its path is what this returns.
        /// </para>
        /// <para>
        /// No transaction is required <i>by the caller</i> — an export does not modify the model.
        /// (This method does open one internally when it suppresses annotation, and rolls it back
        /// before returning, so the caller sees no change and no undo entry.) If you create
        /// geometry and then export in the same script, the transaction commit has already
        /// regenerated the view, so no explicit <c>Doc.Regenerate()</c> is needed.
        /// </para>
        /// <para>
        /// ⚠⚠ <b>Annotation is hidden for the duration of the export.</b> Revit's image export
        /// does <b>not</b> clip annotation to the view — a level's datum line and head, a grid
        /// bubble, an elevation or section mark are all drawn wherever they sit, even far outside
        /// the model. Because the export fits the <b>whole</b> extent (annotation included) to the
        /// page, those items shrink the subject: a plan with elevation markers off to the side
        /// renders the building into a fraction of the frame. Hiding the <b>whole</b>
        /// `CategoryType.Annotation` set is the fix, and it has to be the whole set —
        /// hiding only levels and grids was measured to make the aspect error <i>worse</i>, because
        /// the item reaching outside was an elevation mark. See
        /// <see cref="HideAnnotationCategories"/> for the measured proof.
        /// </para>
        /// </summary>
        /// <param name="path">
        /// Target file path. Supply it <b>without</b> an extension (Revit chooses one), e.g.
        /// <c>@"C:\tmp\elevation"</c>. The directory is created if it does not exist.
        /// </param>
        /// <param name="viewName">
        /// Name of the view to export. <c>null</c> (the default) exports the active view.
        /// </param>
        /// <param name="pixelSize">Longest-edge pixel size. Default 1200.</param>
        /// <param name="hideAnnotation">
        /// When <c>true</c> (the default), every annotation category is hidden on the view for the
        /// duration of the export and restored afterwards, so the picture frames the <b>model</b>
        /// rather than the annotation around it. Pass <c>false</c> only when you specifically want
        /// the level/grid tags in the image.
        /// </param>
        /// <returns>The full path of the image file that was written.</returns>
        /// <exception cref="System.ArgumentException">The path is null or blank.</exception>
        /// <exception cref="System.InvalidOperationException">
        /// The named view does not exist, is a view template, or Revit reported success but
        /// wrote no file.
        /// </exception>
        /// <example>
        /// <code>
        /// // Active view, default size, annotation suppressed
        /// var shot = ExportImage(@"C:\tmp\current");
        /// Println($"wrote {shot}");
        ///
        /// // A named view
        /// var elev = ExportImage(@"C:\tmp\north-elev", "North Elevation", 2000);
        /// </code>
        /// </example>
        public static string ExportImage(string path, string? viewName = null, int pixelSize = 1200,
                                         bool hideAnnotation = true)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("ExportImage: a target path is required.", nameof(path));
            }

            var view = string.IsNullOrWhiteSpace(viewName)
                ? Doc.ActiveView
                : new FilteredElementCollector(Doc)
                    .OfClass(typeof(View))
                    .Cast<View>()
                    .FirstOrDefault(v => !v.IsTemplate &&
                                         v.Name.Equals(viewName, StringComparison.OrdinalIgnoreCase));

            if (view == null)
            {
                // ⚠⚠ SHOW THE TYPE, AND DEDUPE (2026-10-27). Revit allows two views to share a
                //   name across view TYPES — measured on TestModel.rvt: "Level 1" exists as both
                //   a FloorPlan and a CeilingPlan, and "Level 2" likewise. A name-only list
                //   therefore printed "Level 1" twice, which reads as a bug in this message when
                //   it is a fact about the model. The type is what tells them apart; Distinct()
                //   then collapses rows that are genuinely identical.
                //   ⚠ Still ambiguous: ExportImage resolves a name with FirstOrDefault, so with
                //   two views called "Level 1" it exports whichever comes first. Listing the type
                //   is what lets the caller notice.
                //
                // ⚠⚠ TWO MORE DEFECTS FIXED HERE 2026-10-28 (release review). The list was every
                //   non-template View, capped at ten:
                //     • it offered views that CANNOT be exported. Measured on TestModel.rvt,
                //       "Project View (ProjectBrowser)" and "System Browser (SystemBrowser)" were
                //       both listed — neither is a drawable view, so following the hint fails;
                //     • the cap of ten silently DROPPED "{3D}" — the very view the caller had
                //       just exported successfully — because ten other views sorted ahead of it.
                //       A truncated hint that does not SAY it is truncated reads as "your view is
                //       not in this document".
                //   ⇒ offer only drawable views, put the ACTIVE view first, and name what is not
                //   shown instead of dropping it in silence.
                static bool Exportable(View v)
                {
                    if (v == null || v.IsTemplate) return false;
                    switch (v.ViewType)
                    {
                        // `View` subclasses with no drawable geometry — ImageExportOptions
                        // cannot render them, so they must never appear as a suggestion.
                        case ViewType.ProjectBrowser:
                        case ViewType.SystemBrowser:
                        case ViewType.Internal:
                        case ViewType.Undefined:
                            return false;
                        default:
                            return true;
                    }
                }

                var activeId = Doc.ActiveView?.Id;
                var ordered = new FilteredElementCollector(Doc)
                    .OfClass(typeof(View))
                    .Cast<View>()
                    .Where(Exportable)
                    .OrderBy(v => activeId != null && v.Id == activeId ? 0 : 1)
                    .ThenBy(v => v.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                const int showMax = 24;
                var shown = ordered.Take(showMax)
                                   .Select(v => v.Name + " (" + v.ViewType + ")")
                                   .Distinct()
                                   .ToList();
                // ⚠ Count against what was actually CONSIDERED, not against `shown.Count` —
                //   Distinct() can drop rows, and deriving `hidden` from the deduped list would
                //   then report more views missing than there are.
                var hidden = ordered.Count - Math.Min(ordered.Count, showMax);

                var hint = shown.Count > 0
                    ? $" Exportable views include: {string.Join(", ", shown)}."
                        + (hidden > 0 ? $" … and {hidden} more not shown." : "")
                        + " Pass the name only — the part before the parenthesis."
                    : " This document has no exportable views.";

                throw new InvalidOperationException(
                    $"ExportImage: no view named '{viewName}' in this document.{hint}");
            }

            if (view.IsTemplate)
            {
                throw new InvalidOperationException(
                    $"ExportImage: '{view.Name}' is a view template and cannot be exported.");
            }

            var directory = Path.GetDirectoryName(path);
            if (string.IsNullOrEmpty(directory))
            {
                directory = Directory.GetCurrentDirectory();
            }
            Directory.CreateDirectory(directory);

            // ⚠⚠ REVIT STRIPS AN EXTENSION YOU PASS AND APPENDS ITS OWN.
            //   Ask for `C:\tmp\shot.png` and Revit writes `shot - 3D View - {3D}.png` — the base
            //   it used is `shot`, NOT `shot.png`. The lookup further down searches by PREFIX, so
            //   `shot.png*` matched nothing, this method threw "Revit reported success but wrote
            //   no file", and the caller was left BLIND with a perfectly good image on disk.
            //   That is the one failure an agent cannot diagnose: it is told the export failed
            //   when the picture exists — measured 2026-10-27, `pc-export-test.png` was on disk
            //   while the call reported no file.
            //   Fix: normalise to the STEM ourselves, so the path handed to Revit and the prefix
            //   searched for are the same string, whatever extension the caller typed.
            var baseName = Path.GetFileName(path);
            var stem = Path.GetFileNameWithoutExtension(baseName);
            if (string.IsNullOrEmpty(stem)) stem = baseName;
            var extensionless = Path.GetFileNameWithoutExtension(baseName);
            if (string.IsNullOrEmpty(extensionless)) extensionless = stem;

            var exportPath = Path.Combine(directory, stem);

            var options = new ImageExportOptions
            {
                FilePath = exportPath,
                ZoomType = ZoomFitType.FitToPage,
                FitDirection = FitDirectionType.Horizontal,
                PixelSize = pixelSize,
                ImageResolution = ImageResolution.DPI_150,
                HLRandWFViewsFileType = ImageFileType.PNG,
                ExportRange = ExportRange.SetOfViews,
            };
            options.SetViewsAndSheets(new List<ElementId> { view.Id });

            // ⚠⚠ SUPPRESS ANNOTATION, EXPORT, RESTORE — the picture must be the MODEL.
            // A TransactionGroup is used rather than a pair of transactions so the rollback
            // restores every category's visibility in ONE step and leaves NO undo entry: the
            // user's view is exactly as they left it. The group is closed in `finally`, so a
            // failed export cannot strand the view with its annotation hidden.
            TransactionGroup? annotationGroup = null;
            var annotationSuppressed = false;
            try
            {
                if (hideAnnotation && SupportsCategoryVisibility(view))
                {
                    annotationGroup = new TransactionGroup(Doc, "ExportImage: suppress annotation");
                    annotationGroup.Start();

                    using (var hide = new Transaction(Doc, "Hide annotation for export"))
                    {
                        hide.Start();
                        HideAnnotationCategories(Doc, view);
                        // Commit regenerates the view, so no explicit Doc.Regenerate() is
                        // needed here — and Regenerate() outside a transaction is the trap
                        // that produced "Modification of the document is forbidden".
                        hide.Commit();
                    }
                    annotationSuppressed = true;
                }

                Doc.ExportImage(options);
            }
            finally
            {
                if (annotationSuppressed && annotationGroup != null)
                {
                    try { annotationGroup.RollBack(); } catch { /* restore is best-effort */ }
                }
            }

            // ⚠ Find by PREFIX, newest match. Revit appends " - <view name>" to the base and may
            // change the extension, so the exact path passed in is NOT the file that exists.
            // ⚠ TWO prefixes, because the stem we derived is not always the stem Revit used: a
            //   caller who passed `shot.v2` keeps that dot in `stem`, while Revit strips the whole
            //   extension. Searching both costs one extra directory scan and removes the last way
            //   this can report "no file" while the file sits right there.
            var prefixes = stem == extensionless ? new[] { stem } : new[] { stem, extensionless };

            var written = prefixes
                .SelectMany(prefix => Directory.GetFiles(directory, prefix + "*"))
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();

            if (written == null)
            {
                // ⚠ NEVER report "wrote no file" without saying what IS there. The whole cost of
                //   this bug was an agent told the export failed while the image existed.
                var present = Directory.GetFiles(directory)
                    .Select(f => Path.GetFileName(f))
                    .Where(n => n != null &&
                                n.StartsWith(extensionless, StringComparison.OrdinalIgnoreCase))
                    .Take(5)
                    .ToList();

                var found = present.Count > 0
                    ? " Files starting with that name DO exist: " + string.Join(", ", present) + "."
                    : string.Empty;

                throw new InvalidOperationException(
                    $"ExportImage: Revit reported success but wrote no file matching " +
                    $"'{stem}*' in '{directory}'.{found}");
            }

            return written;
        }

        /// <summary>
        /// True for the view kinds that carry a hideable annotation layer — plans, elevations,
        /// sections and 3D views. Sheets, schedules and legends are excluded: hiding their
        /// annotation would erase the drawing itself.
        /// </summary>
        private static bool SupportsCategoryVisibility(View view)
            => view is View3D || view is ViewPlan || view is ViewSection;

        /// <summary>
        /// Hides EVERY `CategoryType.Annotation` category in <paramref name="view"/>.
        ///
        /// ⚠⚠ WHY THE WHOLE SET, NOT A CHOSEN FEW. Revit's image export does not clip
        /// annotation to the view, so anything — a level head, a grid bubble, an elevation
        /// mark — that sits beyond the model is still rendered, and because the export fits
        /// the whole extent to the page it shrinks the subject.
        ///
        /// ⚠⚠ MEASURED, on a live Revit 2025 export of a section with a fixed
        /// 1.376 × 3.058 m crop (aspect 0.450), four exports of the SAME view:
        ///   nothing hidden ................ 1200 × 427   aspect 2.810
        ///   Levels + Grids hidden ......... 1200 × 314   aspect 3.822
        ///   ALL annotation hidden ......... 1200 × 2666  aspect 0.450  ← = the crop
        /// Hiding levels and grids ALONE made it worse — they were contributing height that
        /// the overflowing item's width was then fitted against. The overflowing item was an
        /// ELEVATION MARK. Nothing about a mark is special; any annotation can overflow.
        /// (Proven again across six previously-broken rows: 6 for 6, exact aspect.)
        ///
        /// ⚠ <c>SetCategoryHidden</c> takes a <b>CATEGORY's ElementId</b>, not the
        /// <c>BuiltInCategory</c> enum (CS1503). <c>Settings.Categories</c> yields the
        /// document's own ids, so nothing here encodes Revit's numbering by hand.
        ///
        /// ⚠ A category that does not support per-view visibility throws on the call, so each
        /// one is guarded; the count is returned so a caller can log it.
        /// </summary>
        private static int HideAnnotationCategories(Document doc, View view)
        {
            var hidden = 0;
            foreach (Category category in doc.Settings.Categories)
            {
                try
                {
                    if (category.CategoryType != CategoryType.Annotation) continue;
                    view.SetCategoryHidden(category.Id, true);
                    hidden++;
                }
                catch
                {
                    // A category with no per-view visibility control — skip it.
                }
            }
            return hidden;
        }
    }
}
