using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// ONE STAGE CHECKPOINT — the model as it stood when <c>Mark</c> was called.
    /// <para>
    /// The staged workflow is *build a stage → look at it → keep it or undo it*, and
    /// <c>Batch</c> already answers "undo it" for elements a stage CREATED. This type covers the
    /// other half: a stage that MOVED, RE-TYPED or otherwise EDITED elements that already existed.
    /// Those are not undoable by a stamp, because a stamp only marks what a stage made.
    /// </para>
    /// </summary>
    public sealed class Checkpoint
    {
        /// <summary>The name given to <c>Mark</c>.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>The document the checkpoint belongs to — a checkpoint is per-file.</summary>
        public string DocumentKey { get; set; } = string.Empty;

        /// <summary>Creation order, 1-based. Used to order the <c>Checkpoints()</c> list.</summary>
        public int Index { get; set; }

        /// <summary>Wall-clock time the mark was taken, for reading a session back.</summary>
        public string At { get; set; } = string.Empty;

        /// <summary>How many elements existed at the mark.</summary>
        public int Elements { get; set; }

        /// <summary>How many parameter values were captured — the restore set's size.</summary>
        public int Values { get; set; }

        /// <summary>What the caller said this mark precedes, if anything.</summary>
        public string Note { get; set; } = string.Empty;

        /// <summary>One line per checkpoint, so a script can <c>Println</c> the list.</summary>
        public override string ToString()
        {
            return "#" + Index.ToString(CultureInfo.InvariantCulture) + "  " + Name
                + "  (" + Elements.ToString(CultureInfo.InvariantCulture) + " elements, "
                + Values.ToString(CultureInfo.InvariantCulture) + " values"
                + (string.IsNullOrEmpty(Note) ? string.Empty : ", " + Note) + ")";
        }
    }

    /// <summary>
    /// ⚠⚠ STAGE CHECKPOINTS — <c>Mark</c> / <c>RollbackTo</c>, the undo primitive the staged
    /// modelling workflow was missing.
    /// <para>
    /// <b>Why this exists.</b> The mandated build order is stage → verify with a picture → next
    /// stage, and the whole point of verifying is being able to ACT on what you see. Until now the
    /// only undo was <c>DeleteBatch</c> — which removes what a batch created and can say nothing
    /// about a stage that moved a wall or re-typed a window. A wrong stage could only be cleaned up
    /// by deleting elements one id at a time, from memory.
    /// </para>
    /// <para>
    /// <b>How it works.</b> <c>Mark</c> snapshots the document: every element id, plus every
    /// WRITABLE parameter's value. <c>RollbackTo</c> then deletes the elements that did not exist at
    /// the mark and writes back the values that changed. It is a snapshot restore, not a Revit undo
    /// — so it survives any number of intervening transactions, and it works across a committed
    /// <c>Batch</c>, which a transaction group cannot.
    /// </para>
    /// <para>
    /// ⚠ <b>Not the same tool as <c>Batch</c>.</b> <c>Batch</c> is the all-or-nothing unit for ONE
    /// stage and is what makes a stage deletable later by its stamp. A checkpoint is a
    /// whole-document bookmark, and <c>RollbackTo</c> is destructive — it needs <c>confirm: true</c>
    /// for the same reason <c>DeleteBatch</c> does.
    /// </para>
    /// </summary>
    public static partial class ScriptApi
    {
        private static readonly Dictionary<string, CheckpointEntry> _checkpoints =
            new(StringComparer.OrdinalIgnoreCase);

        private static int _checkpointSequence;

        /// <summary>One checkpoint's public summary plus its captured parameter values.</summary>
        private sealed class CheckpointEntry
        {
            public Checkpoint Info { get; } = new();

            /// <summary>elementId → parameter name → encoded value.</summary>
            public Dictionary<long, Dictionary<string, string>> Values { get; } = new();
        }

        /// <summary>
        /// Snapshots the document under <paramref name="name"/>, so a later <c>RollbackTo</c> can
        /// return the model to exactly this state.
        /// <para>Example: <c>Mark("stage-3-rooms", "before rooms and tags")</c></para>
        /// <para>
        /// ⚠ Takes no transaction and changes nothing — a mark is a READ. That is deliberate: the
        /// workflow needs a checkpoint before a stage whose correctness is unknown, and a mark that
        /// itself edited the model would be the first thing to go wrong.
        /// </para>
        /// </summary>
        /// <param name="name">The name to roll back to. Re-using a name REPLACES that checkpoint.</param>
        /// <param name="note">Optional free text — what this mark precedes.</param>
        public static Checkpoint Mark(string name, string note = "")
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("A checkpoint needs a name — it is what RollbackTo aims at.",
                    nameof(name));
            }
            if (Doc == null)
            {
                throw new InvalidOperationException("Document is null. Cannot take a checkpoint.");
            }

            string wanted = name.Trim();
            var entry = new CheckpointEntry();
            CaptureInto(entry.Values);

            entry.Info.Name = wanted;
            entry.Info.DocumentKey = DocumentKey(Doc);
            entry.Info.Index = ++_checkpointSequence;
            entry.Info.At = DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
            entry.Info.Elements = entry.Values.Count;
            entry.Info.Values = entry.Values.Sum(kv => kv.Value.Count);
            entry.Info.Note = note ?? string.Empty;

            _checkpoints[entry.Info.DocumentKey + "|" + wanted] = entry;

            SafePrint(
                "📍 Mark \"" + wanted + "\" — "
                + entry.Info.Elements.ToString(CultureInfo.InvariantCulture) + " elements, "
                + entry.Info.Values.ToString(CultureInfo.InvariantCulture) + " parameter values captured."
                + " RollbackTo(\"" + wanted + "\") restores this state.");
            return entry.Info;
        }

        /// <summary>Every checkpoint taken in the ACTIVE document, oldest first.</summary>
        public static IReadOnlyList<Checkpoint> Checkpoints()
        {
            string key = Doc == null ? string.Empty : DocumentKey(Doc);
            return _checkpoints.Values
                .Where(entry => entry.Info.DocumentKey == key)
                .Select(entry => entry.Info)
                .OrderBy(info => info.Index)
                .ToList();
        }

        /// <summary>
        /// Forgets a checkpoint. ⚠ Changes NOTHING in the model — it only drops the bookmark.
        /// </summary>
        /// <param name="name">The checkpoint to forget.</param>
        /// <returns>True when a checkpoint of that name existed.</returns>
        public static bool DropCheckpoint(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || Doc == null) { return false; }

            string key = DocumentKey(Doc) + "|" + name.Trim();
            bool removed = _checkpoints.Remove(key);
            if (removed)
            {
                SafePrint("📍 Dropped checkpoint \"" + name.Trim() + "\" (the model is untouched).");
            }
            return removed;
        }

        /// <summary>
        /// Returns the model to a checkpoint: deletes every element created since the mark and
        /// writes back every parameter value that changed.
        /// <para>
        /// ⚠⚠ DESTRUCTIVE, so the default is the safe one: called with the name alone this is a DRY
        /// RUN that reports what it WOULD change. Pass <c>confirm: true</c> to mean it — the same
        /// contract as <c>DeleteBatch</c>.
        /// </para>
        /// <para>
        /// ⚠ The RESTORE happens before the DELETE. Deleting a wall takes its hosted doors with it,
        /// and a cascade must not run before the values it would otherwise preserve are back.
        /// </para>
        /// </summary>
        /// <param name="name">The checkpoint to return to.</param>
        /// <param name="confirm">When <c>false</c> (the default) nothing is changed.</param>
        public static BatchReport RollbackTo(string name, bool confirm = false)
        {
            var report = new BatchReport
            {
                BatchId = "checkpoint:" + (name ?? string.Empty),
                Name = "Rollback to \"" + (name ?? string.Empty) + "\"",
            };

            if (string.IsNullOrWhiteSpace(name) || Doc == null)
            {
                report.Skipped = true;
                report.SkipReason = Doc == null
                    ? "there is no active document."
                    : "no checkpoint name was given.";
                SafePrint(report.Render());
                return report;
            }

            string wanted = name.Trim();
            string key = DocumentKey(Doc) + "|" + wanted;
            if (!_checkpoints.TryGetValue(key, out CheckpointEntry? entry) || entry == null)
            {
                report.Skipped = true;
                report.SkipReason = "no checkpoint named \"" + wanted + "\" in this document."
                    + " Call Checkpoints() to see what exists.";
                SafePrint(report.Render());
                return report;
            }

            // ── WHAT CHANGED SINCE THE MARK ──────────────────────────────────────
            var created = new List<ElementId>();
            var modified = new List<ElementId>();

            // ⚠⚠ THE DIFF MUST SCAN THE SAME SET THE CAPTURE DID — two reasons, and the second is
            //   the one that matters:
            //     1. A bare collector cannot be iterated at all (Revit 2023+), so this threw
            //        "The collector does not have a filter applied" — the SAME defect as CaptureInto,
            //        in a second place. Fixing only the capture left RollbackTo dead, which is why
            //        the first live test still failed.
            //     2. Anything the diff scans that is NOT in `entry.Values` is reported as CREATED.
            //        If this pass covered a narrower set than the capture, every element it skipped
            //        would be misreported as new — a wrong answer that looks like a working feature.
            //   Both passes therefore use the identical LogicalOr across the element/type split.
            using (var collector = new FilteredElementCollector(Doc)
                .WherePasses(new LogicalOrFilter(
                    new ElementIsElementTypeFilter(false),
                    new ElementIsElementTypeFilter(true))))
            {
                foreach (Element element in collector)
                {
                    if (!entry.Values.TryGetValue(element.Id.Value, out Dictionary<string, string>? bag)
                        || bag == null)
                    {
                        created.Add(element.Id);
                        continue;
                    }
                    if (Differs(element, bag)) { modified.Add(element.Id); }
                }
            }

            int missing = entry.Values.Keys.Count(id => Doc.GetElement(new ElementId(id)) == null);

            if (created.Count == 0 && modified.Count == 0)
            {
                report.Skipped = true;
                report.SkipReason = "nothing has changed since the mark — the model already matches"
                    + " \"" + wanted + "\"."
                    + (missing > 0
                        ? " (" + missing.ToString(CultureInfo.InvariantCulture)
                          + " element(s) recorded at the mark are gone, but nothing was added or edited.)"
                        : string.Empty);
                SafePrint(report.Render());
                return report;
            }

            if (!confirm)
            {
                report.Skipped = true;
                report.SkipReason = "confirm=false — rollback would DELETE "
                    + created.Count.ToString(CultureInfo.InvariantCulture)
                    + " element(s) created since the mark and RESTORE "
                    + modified.Count.ToString(CultureInfo.InvariantCulture)
                    + " modified element(s). Nothing was changed; re-run with confirm: true to do it.";
                SafePrint(report.Render());
                return report;
            }

            // ── THE ROLLBACK ─────────────────────────────────────────────────────
            int restored = 0;
            var removed = new List<ElementId>();

            void Work()
            {
                // ⚠ RESTORE FIRST. Doc.Delete cascades (a wall takes its doors), and a cascade that
                //   ran first would remove elements the restore is about to write to.
                foreach (ElementId id in modified)
                {
                    Element? element = Doc.GetElement(id);
                    if (element == null) { continue; }
                    if (RestoreElement(element, entry.Values[id.Value])) { restored++; }
                }

                if (created.Count > 0) { removed.AddRange(Doc.Delete(created)); }
            }

            TxReport tx;
            if (Doc.IsModifiable) { Work(); tx = new TxReport { Name = "Rollback", Committed = true }; }
            else { tx = Tx.Transact(Doc, "Paracore: rollback to " + wanted, Work); }

            if (!tx.Committed)
            {
                report.RolledBack = true;
                report.Error = string.IsNullOrEmpty(tx.Error) ? "Revit refused the transaction." : tx.Error;
            }
            else
            {
                report.Committed = true;
            }

            report.RecordIds(Array.Empty<ElementId>(), modified, removed);
            report.Note = restored.ToString(CultureInfo.InvariantCulture) + " element(s) restored · "
                + removed.Count.ToString(CultureInfo.InvariantCulture) + " created element(s) deleted"
                + (missing > 0
                    ? " · " + missing.ToString(CultureInfo.InvariantCulture) + " already gone"
                    : string.Empty)
                + (removed.Count < created.Count
                    ? "  ⚠ " + created.Count.ToString(CultureInfo.InvariantCulture)
                      + " were created but only " + removed.Count.ToString(CultureInfo.InvariantCulture)
                      + " were deleted — re-read the model to see what survived."
                    : string.Empty);

            SafePrint(report.Render());
            return report;
        }

        /// <summary>The active document's identity — a checkpoint is per-file, never global.</summary>
        private static string DocumentKey(Document doc)
        {
            try
            {
                if (!string.IsNullOrEmpty(doc.PathName)) { return doc.PathName; }
                return doc.Title ?? string.Empty;
            }
            catch { return string.Empty; }
        }

        /// <summary>
        /// The key a captured value is stored under.
        /// <para>
        /// ⚠⚠ THE PARAMETER ID, NOT THE NAME — A NAME IS NOT UNIQUE. Measured on the test model
        /// (2026-10-27): a View carries TWO writable parameters named <c>View Template</c>
        /// (ids −1005199 = "None" and −1005176 = "&lt;None&gt;"), and a Railing carries THREE named
        /// <c>Type</c> (ids −1150333, −1150329 = "&lt;None&gt;", −1150327 = "Rectangular - 50x50mm").
        /// A name-keyed bag collapses those to ONE entry: the capture keeps the LAST duplicate while
        /// the diff/restore compares the FIRST. The consequences were both observed:
        ///   • a NO-OP RollbackTo still reported 14 elements "modified" — a permanent false diff;
        ///   • worse, restoring the surviving entry would write the wrong duplicate's value, because
        ///     those values genuinely differ ('None' vs '&lt;None&gt;').
        /// The id distinguishes them, so it is the key.
        /// </para>
        /// </summary>
        private static string ParamKey(Parameter p)
        {
            ElementId? id = p.Id;
            if (id == null || id == ElementId.InvalidElementId)
                return "n:" + (p.Definition?.Name ?? string.Empty);

            return "p:" + id.Value.ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Snapshots every writable parameter value in the document.
        /// <para>
        /// ⚠ TYPE parameters are captured on the TYPE, not once per instance: a type parameter read
        /// through an instance reports the element type as its owner, and capturing it on both would
        /// store the same fact N times and restore it N times.
        /// </para>
        /// </summary>
        private static void CaptureInto(Dictionary<long, Dictionary<string, string>> into)
        {
            // ⚠⚠ A COLLECTOR WITH NO FILTER CANNOT BE ITERATED (Revit 2023+). This was a bare
            //   `new FilteredElementCollector(Doc)`, so Mark() threw
            //   "The collector does not have a filter applied" on EVERY call. Checkpoints were
            //   therefore entirely dead — not degraded — and RollbackTo then reported "no
            //   checkpoint named …" because none had ever been captured.
            //   A LogicalOr across BOTH sides of the element/type split keeps the capture
            //   COMPLETE (a type's parameters are exactly what a re-typed stage changes) while
            //   satisfying the filter rule.
            using var collector = new FilteredElementCollector(Doc)
                .WherePasses(new LogicalOrFilter(
                    new ElementIsElementTypeFilter(false),
                    new ElementIsElementTypeFilter(true)));
            foreach (Element element in collector)
            {
                var bag = new Dictionary<string, string>(StringComparer.Ordinal);
                try
                {
                    foreach (Parameter p in element.Parameters)
                    {
                        if (p == null || p.IsReadOnly) { continue; }
                        if (p.Element is ElementType && element is not ElementType) { continue; }
                        if (p.Definition == null || string.IsNullOrEmpty(p.Definition.Name)) { continue; }

                        string? encoded = Encode(p);
                        if (encoded != null) { bag[ParamKey(p)] = encoded; }
                    }
                }
                catch { /* an element whose parameters cannot be read simply snapshots empty */ }

                into[element.Id.Value] = bag;
            }
        }

        /// <summary>True when any parameter captured at the mark no longer holds its value.</summary>
        private static bool Differs(Element element, Dictionary<string, string> bag)
        {
            try
            {
                foreach (Parameter p in element.Parameters)
                {
                    // ⚠ THE SAME GATES AS CaptureInto AND RestoreElement. This method used to apply
                    //   NEITHER, so it compared parameters the capture had deliberately skipped —
                    //   read-only ones and a type's parameters projected onto an instance. Any such
                    //   parameter sharing a name with a captured one produced a false "differs", and
                    //   `now == null` below reports a diff too. Three functions over one bag must
                    //   agree on which parameters the bag can contain.
                    if (p == null || p.IsReadOnly) { continue; }
                    if (p.Element is ElementType && element is not ElementType) { continue; }
                    if (p.Definition == null || string.IsNullOrEmpty(p.Definition.Name)) { continue; }

                    if (!bag.TryGetValue(ParamKey(p), out string? encoded) || encoded == null) { continue; }

                    string? now = Encode(p);
                    if (now == null || !string.Equals(now, encoded, StringComparison.Ordinal)) { return true; }
                }
            }
            catch { return false; }
            return false;
        }

        /// <summary>Writes the captured values back. Returns true when anything was restored.</summary>
        private static bool RestoreElement(Element element, Dictionary<string, string> bag)
        {
            bool any = false;
            try
            {
                foreach (Parameter p in element.Parameters)
                {
                    if (p == null || p.IsReadOnly) { continue; }
                    if (p.Element is ElementType && element is not ElementType) { continue; }
                    if (p.Definition == null || string.IsNullOrEmpty(p.Definition.Name)) { continue; }

                    if (!bag.TryGetValue(ParamKey(p), out string? encoded) || encoded == null) { continue; }

                    string? now = Encode(p);
                    if (string.Equals(now, encoded, StringComparison.Ordinal)) { continue; }

                    if (ApplyEncoded(p, encoded)) { any = true; }
                }
            }
            catch { /* a parameter that refuses its old value must not abort the rest */ }
            return any;
        }

        /// <summary>
        /// A parameter value as a self-describing string — the storage type is the first character,
        /// so a restore knows how to write it back without consulting the parameter again.
        /// Returns null for a value that cannot be round-tripped (unset, or an unsupported type).
        /// </summary>
        private static string? Encode(Parameter p)
        {
            try
            {
                if (!p.HasValue) { return null; }

                switch (p.StorageType)
                {
                    case StorageType.Double:
                        return "d" + p.AsDouble().ToString("R", CultureInfo.InvariantCulture);
                    case StorageType.Integer:
                        return "i" + p.AsInteger().ToString(CultureInfo.InvariantCulture);
                    case StorageType.String:
                        return "s" + (p.AsString() ?? string.Empty);
                    case StorageType.ElementId:
                    {
                        ElementId id = p.AsElementId();
                        return "e" + (id == null
                            ? "-1"
                            : id.Value.ToString(CultureInfo.InvariantCulture));
                    }
                    default:
                        return null;
                }
            }
            catch { return null; }
        }

        /// <summary>Writes an encoded value back onto a parameter. Never throws.</summary>
        private static bool ApplyEncoded(Parameter p, string encoded)
        {
            if (p.IsReadOnly || string.IsNullOrEmpty(encoded)) { return false; }

            char kind = encoded[0];
            string body = encoded.Substring(1);
            try
            {
                switch (kind)
                {
                    case 'd':
                        return p.Set(double.Parse(body, CultureInfo.InvariantCulture));
                    case 'i':
                        return p.Set(int.Parse(body, CultureInfo.InvariantCulture));
                    case 's':
                        return p.Set(body);
                    case 'e':
                        return p.Set(new ElementId(long.Parse(body, CultureInfo.InvariantCulture)));
                    default:
                        return false;
                }
            }
            catch { return false; }
        }
    }
}
