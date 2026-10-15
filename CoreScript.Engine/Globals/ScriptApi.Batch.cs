using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.DB.ExtensibleStorage;
using System.Globalization;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// WHAT ONE BUILD STAGE DID — the ids it created, how many of them carry the batch
    /// stamp, and whether the stage stayed in the model.
    /// <para>
    /// <b>Why this type exists.</b> A build is stages: levels, then slabs, then walls, then
    /// openings. "Redo the walls" has to be possible without redoing the levels, and the only
    /// way to aim a delete is to know WHICH elements a stage made. That is what the stamp is
    /// for, and this report is what proves the stamp actually attached.
    /// </para>
    /// <para>
    /// ⚠ The count <see cref="Stamped"/> is the load-bearing one: a batch that committed but
    /// stamped nothing cannot be found or deleted later, so the build looks done and the undo
    /// is impossible. It is printed for exactly the reason <see cref="TxReport.EventsSeen"/>
    /// exists — a number that makes a zero believable.
    /// </para>
    /// </summary>
    public sealed class BatchReport
    {
        /// <summary>How many ids are listed in full before a line is truncated.</summary>
        private const int IdsShown = 12;

        private readonly List<ElementId> _created = [];
        private readonly List<ElementId> _modified = [];
        private readonly List<ElementId> _deleted = [];

        /// <summary>The spec's version this stage was built from — the batch id.</summary>
        public string BatchId { get; set; } = string.Empty;

        /// <summary>The TransactionGroup name as the script wrote it.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>True only when every transaction in the group committed.</summary>
        public bool Committed { get; set; }

        /// <summary>True when the stage was undone — the model is unchanged by it.</summary>
        public bool RolledBack { get; set; }

        /// <summary>The exception message when the stage threw before it could finish.</summary>
        public string Error { get; set; } = string.Empty;

        /// <summary>
        /// True when the stage NEVER RAN — a dry-run preview, or a delete refused for want of
        /// confirmation.
        /// <para>
        /// ⚠ This is a THIRD state, not a synonym for <see cref="RolledBack"/>. A rolled-back
        /// stage DID run and was undone; a skipped one did not run at all, so nothing in the
        /// model was touched either way. Collapsing the two would make "I chose not to" look
        /// like "it went wrong".
        /// </para>
        /// </summary>
        public bool Skipped { get; set; }

        /// <summary>Why the stage never ran, when it did not.</summary>
        public string SkipReason { get; set; } = string.Empty;

        /// <summary>Ids the stage ADDED, across every transaction in the group.</summary>
        public IReadOnlyList<ElementId> Created => _created;

        /// <summary>Ids the stage MODIFIED, across every transaction in the group.</summary>
        public IReadOnlyList<ElementId> Modified => _modified;

        /// <summary>Ids the stage DELETED, across every transaction in the group.</summary>
        public IReadOnlyList<ElementId> Deleted => _deleted;

        /// <summary>
        /// How many created elements now carry the batch stamp.
        /// <para>
        /// ⚠ NOT a decoration: this is the number that says the stage is deletable. A batch with
        /// <see cref="Committed"/> true and <see cref="Stamped"/> zero is a batch that cannot be
        /// undone, and the caller must be told rather than left to discover it later.
        /// </para>
        /// </summary>
        public int Stamped { get; set; }

        /// <summary>
        /// Every change event the handler received during this stage.
        /// <para>
        /// ⚠ A DIAGNOSTIC COUNTER, not a quantity — it is what makes a zero believable. Zero on
        /// a ROLLED-BACK stage is EXPECTED (Revit raises no change event for an edit it refused),
        /// whereas zero on a COMMITTED stage that was supposed to create things means the
        /// capture never saw the change, so every count above is unverified. Without the counter
        /// those two are indistinguishable, and the second one reads exactly like "the stage
        /// built nothing" — which is the single most dangerous thing this report could say.
        /// </para>
        /// </summary>
        public int EventsSeen { get; set; }

        /// <summary>Change events discarded because they were for another document.</summary>
        public int EventsOtherDocument { get; set; }

        /// <summary>
        /// One extra sentence for the success line — what the operation actually did.
        /// <para>
        /// ⚠ Needed because a report can be re-used by an operation that is not a build stage:
        /// <c>RollbackTo</c> returns one of these, and "created 0 · modified 12 · deleted 7" does
        /// not say that twelve elements were put BACK and seven were removed. Empty renders nothing.
        /// </para>
        /// </summary>
        public string Note { get; set; } = string.Empty;

        /// <summary>
        /// True when the ids above were gathered by a <c>DocumentChanged</c> capture.
        /// <para>
        /// ⚠ ONLY then does <see cref="EventsSeen"/> mean anything, and only then does a zero
        /// warn. <c>DeleteBatch</c> reports the ids Revit HANDED BACK from <c>Doc.Delete</c> —
        /// a direct answer from the API, which is stronger evidence than an event — so it must
        /// never be told its capture is broken. A warning that fires on a healthy call teaches
        /// the reader to skip the next one, and the next one may be real.
        /// </para>
        /// </summary>
        public bool EventCaptureUsed { get; set; }

        /// <summary>Record the ids this stage touched. Called by <see cref="ScriptApi"/> only.</summary>
        internal void RecordIds(IEnumerable<ElementId> created, IEnumerable<ElementId> modified,
                                IEnumerable<ElementId> deleted)
        {
            _created.AddRange(created);
            _modified.AddRange(modified);
            _deleted.AddRange(deleted);
        }

        /// <summary>
        /// A count as text. ⚠ The provider is not decoration: CA1305 exists because
        /// <c>int.ToString()</c> alone renders differently under a culture that groups thousands,
        /// and this report is read by a machine expecting plain digits.
        /// </summary>
        private static string N(int value)
        {
            return value.ToString(CultureInfo.InvariantCulture);
        }

        private static string Ids(IReadOnlyList<ElementId> ids)
        {
            if (ids.Count == 0) { return "(none)"; }

            string shown = string.Join(", ", ids.Take(IdsShown).Select(i => i.ToString()));
            return ids.Count <= IdsShown
                ? shown
                : shown + " … (+" + N(ids.Count - IdsShown) + " more)";
        }

        private static string Join(IReadOnlyList<string> lines)
        {
            return string.Join(Environment.NewLine, lines);
        }

        /// <summary>
        /// The human-readable report. ONE line on success; the full block when the stage was
        /// undone or the stamp did not attach, because those are the cases an agent must not
        /// skim past.
        /// </summary>
        public string Render()
        {
            if (Skipped)
            {
                return "⚠ Batch \"" + BatchId + "\" — DID NOT RUN: " + SkipReason;
            }

            if (!string.IsNullOrEmpty(Error))
            {
                return Join(
                [
                    "✗ Batch \"" + BatchId + "\" — FAILED before it could finish: " + Error,
                    "   ROLLED BACK — the TransactionGroup was rolled back, so nothing from this"
                        + " stage is in the model.",
                    "   created " + N(Created.Count) + " · modified " + N(Modified.Count)
                        + " · deleted " + N(Deleted.Count) + " · stamped " + N(Stamped),
                ]);
            }

            if (RolledBack)
            {
                return Join(
                [
                    "⚠⚠ Batch \"" + BatchId + "\" — ROLLED BACK — THE STAGE WAS UNDONE.",
                    "   created " + N(Created.Count) + " · modified " + N(Modified.Count)
                        + " · deleted " + N(Deleted.Count) + " · stamped " + N(Stamped),
                    "   ⚠ Nothing from this stage is in the model. Re-read it, then ADJUST the"
                        + " operation — do not assume the elements exist.",
                ]);
            }

            // ── COMMITTED ────────────────────────────────────────────────────────
            List<string> ok =
            [
                "✅ Batch \"" + BatchId + "\" — COMMITTED   created " + N(Created.Count)
                    + " · modified " + N(Modified.Count)
                    + " · deleted " + N(Deleted.Count)
                    + "   stamped " + N(Stamped),
            ];

            if (!string.IsNullOrEmpty(Note)) { ok.Add("   " + Note); }

            if (Created.Count > 0) { ok.Add("   created  : " + Ids(Created)); }
            if (Modified.Count > 0) { ok.Add("   modified : " + Ids(Modified)); }
            if (Deleted.Count > 0) { ok.Add("   deleted  : " + Ids(Deleted)); }

            if (EventCaptureUsed && EventsSeen == 0)
            {
                // ⚠⚠ THE COUNTER'S WHOLE REASON TO EXIST. A committed stage that produced NO
                //   change event has NOT been measured — the counts above may be right, but
                //   nothing has verified them, and the stamp below is then aiming at a list that
                //   may be empty for a reason that has nothing to do with the build.
                //
                // ⚠ GUARDED BY `EventCaptureUsed`: DeleteBatch's ids come from Doc.Delete's
                //   RETURN, not from this capture, so its EventsSeen is legitimately zero and
                //   must stay silent. (Found live: the unguarded warning printed on a healthy
                //   delete of two walls.)
                ok.Add("   ⚠ the stage COMMITTED but NO change event was received — the capture"
                       + " is not working, so treat the counts above as UNVERIFIED.");
            }
            if (EventsOtherDocument > 0)
            {
                ok.Add("   (note: " + N(EventsOtherDocument)
                       + " change event(s) were for ANOTHER document and were not counted)");
            }

            if (Created.Count > 0 && Stamped == 0)
            {
                // ⚠⚠ THE ONE CASE THAT MUST SHOUT. The stage committed, the elements are in the
                //   model, and NOTHING carries the batch id — so `list_batch` will never find them
                //   and `delete_batch` can never undo them. Saying so here is the difference
                //   between "the stamp is not there" and "the stamp is not there and nobody
                //   found out until the next build".
                ok.Add("   ⚠⚠ COMMITTED BUT STAMPED NOTHING — these elements can never be"
                       + " deleted by batch. Re-run the stage, or patch the stamp with a"
                       + " follow-up StampBatch call.");
            }

            return Join(ok);
        }

        /// <summary>The report as one string — what a script reads when it reads this value.</summary>
        public override string ToString()
        {
            return Render();
        }
    }

    /// <summary>
    /// ONE ELEMENT FOUND BY A BATCH — the identity a delete aims at.
    /// <para>
    /// Returned as objects rather than bare <see cref="Autodesk.Revit.DB.ElementId"/>s because
    /// deleting a batch is
    /// a destructive decision: "12 walls on level 2" is something an agent can sanity-check
    /// against the spec, while "12 ElementIds" is not, and the same list feeds <c>.Table()</c>,
    /// a confirmation prompt and a JSON reply unchanged.
    /// </para>
    /// </summary>
    public sealed class BatchElement
    {
        /// <summary>The element's id in this document.</summary>
        public ElementId Id { get; set; } = ElementId.InvalidElementId;

        /// <summary>The category name, e.g. <c>Walls</c>. <c>(none)</c> when Revit reports none.</summary>
        public string Category { get; set; } = string.Empty;

        /// <summary>The element's own name — family/type for a family instance.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>One line per element, so a script can <c>Println</c> the whole batch.</summary>
        public override string ToString()
        {
            return Id + "  " + Category + "  " + Name;
        }
    }

    /// <summary>
    /// BATCHES — build one stage inside a <see cref="Autodesk.Revit.DB.TransactionGroup"/>, STAMP everything it
    /// created, and later undo exactly that stage by its stamp.
    /// <para>
    /// <b>Why a batch and not another transaction.</b> A build is stages: levels, then slabs,
    /// then walls, then openings. "Redo the walls" has to be possible without redoing the
    /// levels, and the only way to aim a delete at one stage is to know which elements that
    /// stage made. A <see cref="Autodesk.Revit.DB.TransactionGroup"/> gives the all-or-nothing unit; the stamp
    /// gives the address. Without both, the only undo Revit offers is the whole build.
    /// </para>
    /// <para>
    /// ⚠ <b>This is a SHARED (non-Pro) capability</b> — it uses only
    /// <c>Autodesk.Revit.DB</c>, is present in the free build and the Pro build alike, and
    /// carries no dependency on a Pro service.
    /// </para>
    /// </summary>
    public static partial class ScriptApi
    {
        /// <summary>
        /// The schema GUID of the batch stamp.
        /// <para>
        /// ⚠⚠ FROZEN. A stamp is only findable by the GUID it was written with, so changing this
        /// value orphans every batch already stamped in every saved model. Treat it as a
        /// persisted key: the concept may be renamed, the key may not move.
        /// </para>
        /// </summary>
        private static readonly Guid BatchSchemaGuid = new("d7836180-e031-4c2a-967a-5a297317a9a2");

        /// <summary>The field name inside the stamp entity.</summary>
        private const string BatchFieldName = "BatchId";

        /// <summary>The schema name Revit shows in its schema list.</summary>
        private const string BatchSchemaName = "ParacoreBuildBatch";

        private static readonly string BatchLogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "paracore-data", "logs", "BatchDebugLog.txt");

        /// <summary>
        /// Runs one build stage in a transaction group and reports what it made.
        /// <para>
        /// The <paramref name="batchId"/> is the SPEC's version — <c>ESB-v3</c>, not a timestamp
        /// and not a clock. That is what makes "rebuild batch ESB-v3" and "diff spec v3 against
        /// the model" the same operation.
        /// </para>
        /// </summary>
        /// <param name="batchId">The stamp written onto every element this stage creates.</param>
        /// <param name="body">The stage. Open transactions inside it with
        /// <see cref="Tx.Transact(Document, string, Action)"/>; the group already owns them.</param>
        public static BatchReport Batch(string batchId, Action body)
        {
            return RunBatch(batchId, batchId, body);
        }

        /// <summary>
        /// Runs one build stage, handing the body the document it is building into.
        /// </summary>
        public static BatchReport Batch(string batchId, Action<Document> body)
        {
            return RunBatch(batchId, batchId, () => body(Doc));
        }

        /// <summary>
        /// Runs one build stage under a SEPARATE group name — the text Revit shows in its Undo
        /// menu, which is read by a human and is not the stamp.
        /// </summary>
        public static BatchReport Batch(string batchId, string stageName, Action body)
        {
            return RunBatch(batchId, stageName, body);
        }

        private static BatchReport RunBatch(string batchId, string stageName, Action body)
        {
            BatchReport report = new() { BatchId = batchId, Name = stageName };

            if (string.IsNullOrWhiteSpace(batchId))
            {
                throw new ArgumentException(
                    "A batch needs an id — it is the stamp that makes the batch findable and"
                        + " deletable, so a blank one would build a stage that can never be undone.",
                    nameof(batchId));
            }

            if (Doc == null)
            {
                throw new InvalidOperationException(
                    "Document is null. Cannot start a batch.");
            }

            // ── WHAT THE STAGE TOUCHED ─────────────────────────────────────────
            // ⚠ `Equals`, NEVER `ReferenceEquals` — see the same comment in
            //   Tx.ExecuteTransaction. Revit hands back a DIFFERENT managed Document wrapper
            //   for the SAME open file depending on the access path, so ReferenceEquals would
            //   silently drop every event for the document being built.
            HashSet<ElementId> added = [];
            HashSet<ElementId> modified = [];
            HashSet<ElementId> deleted = [];
            int eventsSeen = 0;
            int eventsOtherDocument = 0;

            EventHandler<DocumentChangedEventArgs>? handler = null;
            Application? app = null;
            try
            {
                app = Doc.Application;
                if (app != null)
                {
                    handler = (_, args) =>
                    {
                        eventsSeen++;
                        if (!Equals(args.GetDocument(), Doc))
                        {
                            eventsOtherDocument++;
                            return;
                        }
                        // ⚠ `HashSet.Add` RETURNS bool — discarded deliberately: the set IS the
                        //   record, and a duplicate id from Revit is not an error.
                        foreach (ElementId id in args.GetAddedElementIds()) { _ = added.Add(id); }
                        foreach (ElementId id in args.GetModifiedElementIds()) { _ = modified.Add(id); }
                        foreach (ElementId id in args.GetDeletedElementIds()) { _ = deleted.Add(id); }
                    };
                    app.DocumentChanged += handler;
                }
            }
            catch (Exception ex)
            {
                // A capture that cannot be installed must not stop the build — but it MUST be
                // visible, because the stamp below would then be aimed at nothing.
                handler = null;
                BatchLog($"Could not subscribe to DocumentChanged: {ex.Message}");
            }

            using TransactionGroup group = new(Doc, stageName);
            try
            {
                _ = group.Start();
                body();

                // ── STAMP, INSIDE THE GROUP, BEFORE IT COMMITS ────────────────
                // ⚠⚠ THE ORDER IS LOAD-BEARING. Stamped AFTER Commit() the stamp would live in
                //   its own transaction OUTSIDE the group: rolling the group back would leave
                //   stamps pointing at elements that no longer exist, and the stamp could not
                //   be removed by the group's own rollback. Inside the group the stamp is part
                //   of the stage, so the stage's undo removes the stamp with its elements.
                //
                // ⚠ `added` is complete here only because `body()` has RETURNED: ids arrive on
                //   DocumentChanged, which fires when each inner transaction commits.
                _ = StampBatch(batchId, added);

                report.Committed = group.Commit() == TransactionStatus.Committed;
                report.RolledBack = !report.Committed;
            }
            catch (Exception ex)
            {
                report.Error = ex.Message;
                BatchLog($"Exception in batch \"{batchId}\": {ex.Message}");
                if (group.HasStarted() && !group.HasEnded())
                {
                    _ = group.RollBack();
                }
                report.Committed = false;
                report.RolledBack = true;

                // ⚠ RE-THROWN, on purpose. A stage that threw has NOT been built, and a script
                //   that carried on to "now build the roof" would be building on a foundation
                //   it does not know is missing. Same contract as Tx: the report is printed in
                //   the finally below BEFORE the exception leaves.
                throw;
            }
            finally
            {
                if (app != null && handler != null)
                {
                    try { app.DocumentChanged -= handler; }
                    catch { /* unsubscribing must never mask the outcome */ }
                }

                report.RecordIds(added, modified, deleted);

                // ⚠ Recorded even though nothing below reads them: they are what lets
                //   <see cref="BatchReport.EventsSeen"/> tell "the stage built nothing" apart
                //   from "the capture never fired", and those two look identical in the counts.
                report.EventsSeen = eventsSeen;
                report.EventsOtherDocument = eventsOtherDocument;
                // ⚠ True ONLY here. This is the one report whose ids come out of the capture,
                //   so this is the only place `EventsSeen` has any meaning — and the only place
                //   a zero is allowed to warn.
                report.EventCaptureUsed = true;

                // ── THE STAMP IS PROVEN, NOT ASSUMED ─────────────────────────
                // ⚠⚠ StampBatch counted what it WROTE; this re-reads after the group has
                //   COMMITTED, which is the only moment the write is durable. A batch that
                //   committed and stamped nothing can never be deleted, so the number that says
                //   so must come from the MODEL rather than from the attempt.
                int verified = 0;
                if (report.Committed)
                {
                    foreach (ElementId id in added)
                    {
                        if (GetBatchId(id) == batchId) { verified++; }
                    }
                }
                report.Stamped = verified;

                string rendered = report.Render();
                SafePrint(rendered);
                BatchLog(rendered.Replace(Environment.NewLine, " | ", StringComparison.Ordinal));
            }

            return report;
        }

        /// <summary>
        /// Writes the batch stamp onto elements and returns how many are PROVABLY stamped.
        /// <para>
        /// <b>Why an int and not nothing.</b> The stamp is the only thing that makes a batch
        /// deletable, so a stamp that silently failed is worse than no batch feature at all.
        /// Returning the verified count puts the load-bearing number in the caller's hand — and
        /// <see cref="BatchReport.Stamped"/> is read back from the model after the group has
        /// committed, not taken from this return value.
        /// </para>
        /// <para>
        /// ⚠ Call this OUTSIDE any transaction you opened yourself, or the count is only as
        /// durable as that transaction. When a transaction is already open the engine uses it
        /// rather than nesting a second one (Revit refuses a nested Transaction).
        /// </para>
        /// </summary>
        /// <param name="batchId">The stamp value to write.</param>
        /// <param name="ids">The elements to stamp.</param>
        /// <returns>How many of <paramref name="ids"/> were read back carrying
        /// <paramref name="batchId"/>.</returns>
        public static int StampBatch(string batchId, IEnumerable<ElementId> ids)
        {
            if (string.IsNullOrWhiteSpace(batchId) || Doc == null) { return 0; }

            List<ElementId> targets = ids.Distinct().ToList();
            if (targets.Count == 0) { return 0; }

            // ⚠ Created UNCONDITIONALLY so it can be `using`-disposed (CA2000). Constructing a
            //   Transaction does not touch the model — only Start() does — so creating one that
            //   is never started is free, whereas a conditionally-created disposable cannot be
            //   disposed without risking a double-release.
            bool ownsTransaction = !Doc.IsModifiable;
            using Transaction transaction = new(Doc, "Paracore: stamp batch " + batchId);
            HashSet<ElementId> written = [];

            try
            {
                if (ownsTransaction) { _ = transaction.Start(); }

                Schema? schema = EnsureBatchSchema();
                if (schema == null)
                {
                    BatchLog($"StampBatch: schema {BatchSchemaGuid} could not be created;"
                             + " nothing was stamped.");
                    return 0;   // ⚠ the finally still ends the open transaction below
                }

                foreach (ElementId id in targets)
                {
                    Element? element = Doc.GetElement(id);
                    if (element == null) { continue; }
                    try
                    {
                        using Entity entity = new(schema);
                        entity.Set(BatchFieldName, batchId);
                        element.SetEntity(entity);
                        _ = written.Add(id);
                    }
                    catch (Exception ex)
                    {
                        // ⚠ ONE element refusing the stamp must not abandon the other 200 —
                        //   but it must not be silent either, or a half-stamped batch would be
                        //   indistinguishable from a stamped one.
                        BatchLog($"Stamp failed on {id}: {ex.Message}");
                    }
                }

                if (transaction.GetStatus() == TransactionStatus.Started)
                {
                    _ = transaction.Commit();
                }
            }
            catch (Exception ex)
            {
                BatchLog($"StampBatch failed for \"{batchId}\": {ex.Message}");
                if (transaction.GetStatus() == TransactionStatus.Started)
                {
                    _ = transaction.RollBack();
                }
                return 0;
            }
            finally
            {
                // ⚠ A transaction is NEVER left started — including on the early return above.
                //   A dangling open transaction freezes the document for everything that runs
                //   next, which is a far louder failure than the one being handled here.
                if (transaction.GetStatus() == TransactionStatus.Started)
                {
                    _ = transaction.RollBack();
                }
            }

            // ── READ BACK ────────────────────────────────────────────────────────
            int stamped = 0;
            foreach (ElementId id in written)
            {
                if (GetBatchId(id) == batchId) { stamped++; }
            }
            return stamped;
        }

        /// <summary>
        /// The stamp's schema, creating it in this document on first use.
        /// <para>
        /// ⚠ NOT CACHED STATICALLY. <see cref="Schema.Lookup(Guid)"/> is an application-level
        /// lookup that resolves against the document being edited, so a Schema captured while
        /// document A was active is not a valid handle for document B. Re-looking-up is cheap; a
        /// stale handle fails only after the user switches files, which is the worst moment to
        /// find out.
        /// </para>
        /// <para>
        /// ⚠ Must be called with a transaction OPEN — <c>SchemaBuilder.Finish()</c> registers
        /// the schema IN the document, which is a write.
        /// </para>
        /// </summary>
        private static Schema? EnsureBatchSchema()
        {
            Schema? existing = Schema.Lookup(BatchSchemaGuid);
            if (existing != null) { return existing; }

            using SchemaBuilder builder = new(BatchSchemaGuid);
            _ = builder.SetSchemaName(BatchSchemaName);
            _ = builder.SetReadAccessLevel(AccessLevel.Public);
            _ = builder.SetWriteAccessLevel(AccessLevel.Public);
            _ = builder.AddSimpleField(BatchFieldName, typeof(string));
            return builder.Finish();
        }

        /// <summary>
        /// The batch stamp an element carries, or <c>""</c> when it carries none.
        /// <para>
        /// ⚠ Never throws. This is called once per element during a batch scan, and a scan that
        /// threw on the first un-stamped element would find nothing at all.
        /// </para>
        /// </summary>
        public static string GetBatchId(Element element)
        {
            if (element == null) { return string.Empty; }

            Schema? schema = Schema.Lookup(BatchSchemaGuid);
            return schema == null ? string.Empty : ReadBatchId(element, schema);
        }

        /// <summary>Convenience overload for an id.</summary>
        public static string GetBatchId(ElementId id)
        {
            Element? element = Doc?.GetElement(id);
            return element == null ? string.Empty : GetBatchId(element);
        }

        /// <summary>
        /// Reads the stamp given a schema that was ALREADY looked up — the per-element scan must
        /// not re-resolve the schema N times.
        /// </summary>
        private static string ReadBatchId(Element element, Schema schema)
        {
            try
            {
                Entity entity = element.GetEntity(schema);
                if (!entity.IsValid()) { return string.Empty; }
                string? value = entity.Get<string>(BatchFieldName);
                return value ?? string.Empty;
            }
            catch
            {
                // A missing, unreadable or half-written entity is an EMPTY batch id. An agent
                // reading "" re-stamps; an agent reading an exception has no next move.
                return string.Empty;
            }
        }

        /// <summary>
        /// Every element in the active document carrying this batch stamp.
        /// <para>
        /// ⚠ This walks the model. ExtensibleStorage offers no index by field value, so finding a
        /// batch is a single full pass over the document's elements. On a very large model expect
        /// a pause; that is the cost of a stamp that needs no project setup.
        /// </para>
        /// <para>
        /// ⚠ A batch is per-DOCUMENT, not per-application: the stamp lives in the model file, so
        /// a batch made in one file is invisible in another.
        /// </para>
        /// </summary>
        public static IReadOnlyList<BatchElement> ListBatch(string batchId)
        {
            List<BatchElement> hits = [];
            if (string.IsNullOrWhiteSpace(batchId) || Doc == null) { return hits; }

            // ⚠ NO STAMP, NO BATCH. If the schema was never created in this document then no
            //   element here can carry a stamp, and scanning the whole model would answer "none"
            //   after a long pause for no new information.
            Schema? schema = Schema.Lookup(BatchSchemaGuid);
            if (schema == null) { return hits; }

            ICollection<ElementId> candidates;
            try
            {
                // ⚠ FilteredElementCollector HERE, not in a script. The ban on the collector in
                //   scripts is about scripts reaching into the model for themselves; the engine
                //   owns this scan, and a batch has to be findable without asking the script to
                //   walk every element on its own.
                using FilteredElementCollector collector = new(Doc);
                candidates = collector.WhereElementIsNotElementType().ToElementIds();
            }
            catch (Exception ex)
            {
                BatchLog($"ListBatch scan failed: {ex.Message}");
                return hits;
            }

            foreach (ElementId id in candidates)
            {
                Element? element = Doc.GetElement(id);
                if (element == null) { continue; }
                if (ReadBatchId(element, schema) != batchId) { continue; }

                hits.Add(new BatchElement
                {
                    Id = id,
                    Category = element.Category?.Name ?? "(none)",
                    Name = element.Name ?? string.Empty,
                });
            }

            return hits;
        }

        /// <summary>
        /// Deletes every element carrying this batch stamp.
        /// <para>
        /// ⚠⚠ A DELETE NEEDS A SEPARATE, EXPLICIT CONFIRMATION, and the default is the safe one:
        /// calling with the id alone is a DRY RUN that reports how much it would remove. An agent
        /// that means it must pass <c>confirm: true</c>. A tagged batch makes a delete *safer*,
        /// never automatic.
        /// </para>
        /// <para>
        /// ⚠ Unlike <see cref="Batch(string, Action)"/>, this does NOT throw on failure — it
        /// returns a report whose <see cref="BatchReport.Error"/> carries the message. The
        /// caller of a destructive query needs the ids it was about to lose more than it needs
        /// an exception, and the MCP layer needs a structured answer for a JSON reply.
        /// </para>
        /// </summary>
        /// <param name="batchId">The stamp to delete by.</param>
        /// <param name="confirm">When <c>false</c> (the default) nothing is deleted.</param>
        public static BatchReport DeleteBatch(string batchId, bool confirm = false)
        {
            BatchReport report = new()
            {
                BatchId = batchId,
                Name = "Delete batch " + batchId,
            };

            if (string.IsNullOrWhiteSpace(batchId))
            {
                report.Skipped = true;
                report.SkipReason = "no batch id was given.";
                SafePrint(report.Render());
                return report;
            }

            IReadOnlyList<BatchElement> hits = ListBatch(batchId);

            if (hits.Count == 0)
            {
                report.Skipped = true;
                report.SkipReason = "nothing in this document carries the batch stamp \""
                                    + batchId + "\".";
                SafePrint(report.Render());
                return report;
            }

            if (!confirm)
            {
                report.Skipped = true;
                report.SkipReason = "confirm=false — " + hits.Count.ToString(CultureInfo.InvariantCulture)
                    + " element(s) carry batch \"" + batchId + "\". Nothing was deleted;"
                    + " re-run with confirm: true to delete them.";
                SafePrint(report.Render());
                return report;
            }

            HashSet<ElementId> requested = [.. hits.Select(h => h.Id)];
            List<ElementId> removed = [];

            using (Transaction transaction = new(Doc, "Paracore: delete batch " + batchId))
            {
                try
                {
                    _ = transaction.Start();

                    // ⚠ `Doc.Delete` RETURNS the ids it ACTUALLY removed. Requesting N and being
                    //   handed N back is not the same as N deletions — a pinned element, a
                    //   hosted element or one Revit refuses for a reason of its own survives,
                    //   and the returned set is the only place that is said.
                    ICollection<ElementId> actuallyDeleted = Doc.Delete(requested);
                    TransactionStatus status = transaction.Commit();

                    if (status == TransactionStatus.Committed)
                    {
                        report.Committed = true;
                        report.RolledBack = false;
                        removed.AddRange(actuallyDeleted);
                    }
                    else
                    {
                        // Revit answers a refused delete by rolling back, not by throwing —
                        //   exactly the trap TxReport was built for.
                        report.Committed = false;
                        report.RolledBack = true;
                    }
                }
                catch (Exception ex)
                {
                    report.Error = ex.Message;
                    report.RolledBack = true;
                    if (transaction.GetStatus() == TransactionStatus.Started)
                    {
                        _ = transaction.RollBack();
                    }
                }
            }

            report.RecordIds([], [], removed);

            if (removed.Count != requested.Count)
            {
                // ⚠ A delete that removed LESS than it found is not an error and must not read
                //   like one — but it must not be silent either, or the next build would assume
                //   the batch was gone.
                SafePrint("   ⚠ Batch \"" + batchId + "\" — " + requested.Count.ToString(CultureInfo.InvariantCulture)
                          + " carried the stamp, " + removed.Count.ToString(CultureInfo.InvariantCulture)
                          + " were deleted. Run ListBatch again to see what survived.");
            }

            SafePrint(report.Render());
            return report;
        }

        /// <summary>
        /// Print a report without ever letting the REPORT be the thing that fails.
        /// <para>
        /// ⚠ <c>Println</c> resolves the ambient script context and THROWS when there is none (a
        /// watchdog tick, or a parameter-options pass). A report is a diagnostic, and a
        /// diagnostic must never be able to break the write it describes — so the failure is
        /// swallowed HERE and nowhere else, and the file log still holds the record.
        /// </para>
        /// </summary>
        private static void SafePrint(string message)
        {
            try { Println(message); }
            catch { /* no script context — the file log below still holds the record */ }
        }

        private static void BatchLog(string message)
        {
            try { File.AppendAllText(BatchLogPath, message + Environment.NewLine); }
            catch { /* the log is a convenience; never let it break a write */ }
        }
    }
}
