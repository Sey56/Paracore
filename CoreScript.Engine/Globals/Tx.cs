using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using System.Globalization;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// WHAT ONE <c>Transact</c> ACTUALLY DID — the ids it touched, and whether it STUCK.
    /// <para>
    /// <b>Why this type exists.</b> <c>Transaction.Commit()</c> RETURNS a
    /// <c>TransactionStatus</c> and the engine used to discard it. Revit answers a refused
    /// edit by rolling the transaction back and returning <c>RolledBack</c> — it does NOT
    /// throw. So a script that created a Wall Opening into a wall join saw a clean return,
    /// believed it had built something, and then could not find the element ("I created the
    /// opening — where did it go?"). The failure was silent at every layer the agent could
    /// see.
    /// </para>
    /// <para>
    /// A report is the fix: the ids created, modified and deleted, plus an explicit
    /// <see cref="RolledBack"/> flag. It is both RETURNED (so a script can read it) and
    /// PRINTED (so it lands in the transcript even when the call is a bare statement).
    /// </para>
    /// <para>
    /// ⚠ <b>This is a SHARED (non-Pro) capability</b> — it uses only
    /// <c>Autodesk.Revit.DB</c> and is present in the free build and the Pro build alike.
    /// Do not introduce a Pro dependency here.
    /// </para>
    /// </summary>
    public sealed class TxReport
    {
        /// <summary>How many ids are listed in full before the line is truncated.</summary>
        private const int IdsShown = 12;

        private readonly List<ElementId> _created = [];
        private readonly List<ElementId> _modified = [];
        private readonly List<ElementId> _deleted = [];
        private readonly List<string> _innerTransactionNames = [];

        /// <summary>The transaction name as the script wrote it.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>What <c>Commit()</c> returned; <c>Uninitialized</c> when Commit was never reached.</summary>
        public TransactionStatus Status { get; set; } = TransactionStatus.Uninitialized;

        /// <summary>True only when <c>Commit()</c> returned <c>Committed</c>.</summary>
        public bool Committed { get; set; }

        /// <summary>True when the edit did NOT stick — the transaction was undone, so the model is unchanged by it.</summary>
        public bool RolledBack { get; set; }

        /// <summary>True when the transaction never ran (read-only mode).</summary>
        public bool Skipped { get; set; }

        /// <summary>Why it was skipped, when it was.</summary>
        public string SkipReason { get; set; } = string.Empty;

        /// <summary>The exception message when the action threw before Commit.</summary>
        public string Error { get; set; } = string.Empty;

        /// <summary>Ids of elements the transaction ADDED.</summary>
        public IReadOnlyList<ElementId> Created => _created;

        /// <summary>Ids of elements the transaction MODIFIED.</summary>
        public IReadOnlyList<ElementId> Modified => _modified;

        /// <summary>Ids of elements the transaction DELETED.</summary>
        public IReadOnlyList<ElementId> Deleted => _deleted;

        /// <summary>
        /// Every change event the handler received during this transaction.
        /// <para>
        /// ⚠ A DIAGNOSTIC COUNTER, not a quantity — it is what makes a zero believable. Zero
        /// on a rolled-back commit is EXPECTED (Revit raises no change event for an edit it
        /// refused), whereas zero on a COMMITTED transaction means the capture never saw the
        /// change, so every count above is unverified. Without the counter those two are
        /// indistinguishable.
        /// </para>
        /// </summary>
        public int EventsSeen { get; set; }

        /// <summary>Change events discarded because they were for another document.</summary>
        public int EventsOtherDocument { get; set; }

        /// <summary>The inner transaction names Revit reported, in order and WITH repeats.</summary>
        public IReadOnlyList<string> InnerTransactionNames => _innerTransactionNames;

        /// <summary>How many elements the transaction touched, in total.</summary>
        public int TotalChanged => _created.Count + _modified.Count + _deleted.Count;

        /// <summary>Record the ids this transaction touched. Called by <see cref="Tx"/> only.</summary>
        internal void RecordIds(IEnumerable<ElementId> created, IEnumerable<ElementId> modified,
                                IEnumerable<ElementId> deleted)
        {
            _created.AddRange(created);
            _modified.AddRange(modified);
            _deleted.AddRange(deleted);
        }

        /// <summary>Record the inner transaction names Revit reported. Called by <see cref="Tx"/> only.</summary>
        internal void RecordNames(IEnumerable<string> names)
        {
            _innerTransactionNames.AddRange(names);
        }

        /// <summary>
        /// A count as text. ⚠ The provider is not decoration: CA1305 exists because
        /// <c>int.ToString()</c> alone renders differently under a culture that groups
        /// thousands, and this report is read by a machine expecting plain digits.
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
            return string.Join(System.Environment.NewLine, lines);
        }

        /// <summary>
        /// The human-readable report. ONE line on success; the full block only when the edit
        /// did not stick, because that is the case an agent must not skim past.
        /// </summary>
        public string Render()
        {
            if (Skipped)
            {
                return "⚠ Transact \"" + Name + "\" — SKIPPED: " + SkipReason;
            }

            if (!string.IsNullOrEmpty(Error))
            {
                List<string> failed =
                [
                    "✗ Transact \"" + Name + "\" — FAILED before commit: " + Error,
                    "   ROLLED BACK — nothing from this transaction is in the model."
                        + "  created " + N(Created.Count)
                        + " · modified " + N(Modified.Count)
                        + " · deleted " + N(Deleted.Count),
                ];
                return Join(failed);
            }

            if (RolledBack)
            {
                List<string> undone =
                [
                    "⚠⚠ Transact \"" + Name + "\" — ROLLED BACK (Revit returned "
                        + Status.ToString() + ") — THE EDIT WAS UNDONE.",
                    "   created " + N(Created.Count)
                        + " · modified " + N(Modified.Count)
                        + " · deleted " + N(Deleted.Count)
                        + "   (change events seen " + N(EventsSeen) + ")",
                    "   ⚠ Nothing from this transaction is in the model. Do NOT assume the elements"
                        + " exist — re-read the model, then ADJUST the operation. Revit reports a"
                        + " refused edit this way instead of throwing, so this line is the only"
                        + " sign you get.",
                    "   ⚠ If Revit showed a dialog while this ran, its text is reported with this"
                        + " call's result — read it before retrying.",
                ];
                if (EventsOtherDocument > 0)
                {
                    undone.Add("   (note: " + N(EventsOtherDocument)
                               + " change event(s) were for ANOTHER document and were not counted)");
                }
                return Join(undone);
            }

            // ── COMMITTED ────────────────────────────────────────────────────────
            List<string> ok =
            [
                "✅ Transact \"" + Name + "\" — COMMITTED   created " + N(Created.Count)
                    + " · modified " + N(Modified.Count)
                    + " · deleted " + N(Deleted.Count),
            ];

            if (TotalChanged == 0)
            {
                // ⚠ A committed transaction that changed NOTHING is a real answer and is worth
                //   saying out loud: it separates "the filter matched nothing" from "the write
                //   silently failed".
                ok.Add("   (committed but changed nothing — the filter matched nothing, or the"
                       + " values were already set)");
            }
            else
            {
                if (Created.Count > 0) { ok.Add("   created  : " + Ids(Created)); }
                if (Modified.Count > 0) { ok.Add("   modified : " + Ids(Modified)); }
                if (Deleted.Count > 0) { ok.Add("   deleted  : " + Ids(Deleted)); }
            }

            if (TotalChanged > 0 && EventsSeen == 0)
            {
                // ⚠⚠ GUARDED BY TotalChanged (found live 2026-10-27). A committed transaction that
                //   changed NOTHING cannot raise a change event, so warning about the capture in
                //   that case is a false alarm — and a false alarm about the MEASUREMENT is worse
                //   than no message, because it makes the caller distrust a correct "changed
                //   nothing" answer. Reproduced: a bulk .Delete() whose filter matched no element
                //   printed "the capture is not working ... UNVERIFIED" while reporting, correctly,
                //   that nothing had changed.
                //   ⚠ ScriptApi.Batch.cs already guards the same warning with EventCaptureUsed;
                //   this branch was the one place the rule was missing. A rule in N places must be
                //   changed in N places.
                ok.Add("   ⚠ the transaction COMMITTED but NO change event was received — the"
                       + " capture is not working, so treat the counts above as UNVERIFIED.");
            }
            if (EventsOtherDocument > 0)
            {
                ok.Add("   (note: " + N(EventsOtherDocument)
                       + " change event(s) were for ANOTHER document and were not counted)");
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
    /// Runs a block of edits in one Revit transaction and reports WHAT IT DID.
    /// <para>
    /// ⚠ Read the <see cref="TxReport"/>: Revit answers a refused edit by rolling the
    /// transaction back and returning a status rather than throwing, so
    /// <see cref="TxReport.RolledBack"/> is the only signal that the write did not land.
    /// </para>
    /// </summary>
    public static class Tx
    {
        private static readonly string _logPath = Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "TxDebugLog.txt");

        /// <summary>
        /// Runs <paramref name="action"/> in a transaction and returns what it did. Kept for
        /// backward compatibility; the parameterless overload is preferred.
        /// </summary>
        /// <param name="doc">The document to modify.</param>
        /// <param name="transactionName">The name shown in Revit's Undo menu.</param>
        /// <param name="action">The edits, given the document.</param>
        public static TxReport Transact(Document doc, string transactionName, Action<Document> action)
        {
            return ExecuteTransaction(doc, transactionName, () => action(doc));
        }

        /// <summary>
        /// Runs <paramref name="action"/> in a transaction and returns what it did.
        /// </summary>
        /// <param name="doc">The document to modify.</param>
        /// <param name="transactionName">The name shown in Revit's Undo menu.</param>
        /// <param name="action">The edits.</param>
        public static TxReport Transact(Document doc, string transactionName, Action action)
        {
            return ExecuteTransaction(doc, transactionName, action);
        }

        /// <summary>
        /// Print the report without ever letting the REPORT be the thing that fails.
        /// <para>
        /// ⚠ <c>ScriptApi.Println</c> resolves the ambient script context and THROWS when there
        /// is none (a watchdog tick, a context built for a parameter-options pass). A report is
        /// a diagnostic, and a diagnostic must never be able to break the write it describes —
        /// so the failure is swallowed HERE and nowhere else.
        /// </para>
        /// </summary>
        private static void SafePrint(string message)
        {
            try { ScriptApi.Println(message); }
            catch { /* no script context — the file log below still holds the record */ }
        }

        private static void Log(string message)
        {
            try { File.AppendAllText(_logPath, message + System.Environment.NewLine); }
            catch { /* the log is a convenience; never let it break a write */ }
        }

        private static TxReport ExecuteTransaction(Document doc, string transactionName, Action action)
        {
            TxReport report = new() { Name = transactionName };

            if (doc == null)
            {
                Log("Document is null in Transact");
                throw new InvalidOperationException("Document is null. Cannot start a transaction.");
            }

            // ── WHAT CHANGED ─────────────────────────────────────────────────────
            // ⚠ DocumentChanged is an APPLICATION-level event — the Revit API exposes no
            //   per-Document variant, so the handler must filter by document itself.
            //
            // ⚠⚠ THE FILTER IS `Equals`, NEVER `ReferenceEquals`. Revit hands back a DIFFERENT
            //   managed Document wrapper for the SAME open file depending on the access path
            //   (measured on Revit 2025, 2026-10-06: ReferenceEquals False, Equals True,
            //   identical GetHashCode and PathName). Document overrides Equals/GetHashCode, so
            //   Equals IS Revit's identity contract for this type. The same defect was already
            //   found and fixed once in CodeRunner's dry run, where it made `would_modify` read
            //   0 for a run that renamed 90 elements.
            HashSet<ElementId> added = [];
            HashSet<ElementId> modified = [];
            HashSet<ElementId> deleted = [];
            List<string> innerNames = [];
            int eventsSeen = 0;
            int eventsOtherDocument = 0;

            EventHandler<DocumentChangedEventArgs>? handler = null;
            Application? app = null;
            try
            {
                app = doc.Application;
                if (app != null)
                {
                    handler = (_, args) =>
                    {
                        eventsSeen++;
                        if (!Equals(args.GetDocument(), doc))
                        {
                            eventsOtherDocument++;
                            return;
                        }
                        // ⚠ `HashSet.Add` RETURNS bool — discarded deliberately: the set IS the
                        //   record, and a duplicate id from Revit is not an error.
                        foreach (ElementId id in args.GetAddedElementIds()) { _ = added.Add(id); }
                        foreach (ElementId id in args.GetModifiedElementIds()) { _ = modified.Add(id); }
                        foreach (ElementId id in args.GetDeletedElementIds()) { _ = deleted.Add(id); }
                        // ⚠ A List, not a HashSet: the count of a REPEATED name is the signal (a
                        //   per-element write with no enclosing Transact opens one transaction
                        //   per element, every one of them identically named).
                        foreach (string n in args.GetTransactionNames())
                        {
                            if (!string.IsNullOrEmpty(n)) { innerNames.Add(n); }
                        }
                    };
                    app.DocumentChanged += handler;
                }
            }
            catch (Exception ex)
            {
                // A capture that cannot be installed must not stop the write — but it MUST be
                // visible, because every count below is then unverified.
                handler = null;
                Log($"Could not subscribe to DocumentChanged: {ex.Message}");
            }

            using Transaction transaction = new(doc, transactionName);
            try
            {
                Log($"Starting transaction: {transactionName}");
                // ⚠ Start() RETURNS a TransactionStatus too. It is discarded HERE ON PURPOSE
                //   (the explicit `_ =` is how that intent is stated) — if the start is refused
                //   the action below throws, and THAT is what the catch block reports.
                _ = transaction.Start();
                action(); // Execute the script's action
                Log($"Committing transaction: {transactionName}");
                report.Status = transaction.Commit();

                // ⚠⚠ THE WHOLE POINT. Commit does NOT throw when Revit refuses the edit — it
                //    rolls the transaction back and says so in the RETURN VALUE, which the
                //    engine used to discard. A silent rollback is a silent failure.
                report.Committed = report.Status == TransactionStatus.Committed;
                report.RolledBack = !report.Committed;
                Log(report.Committed
                    ? $"Transaction committed successfully: {transactionName}"
                    : $"Transaction did NOT commit: {transactionName} returned {report.Status}");
            }
            catch (Exception ex)
            {
                report.Error = ex.Message;
                Log($"Exception in transaction: {ex.Message}");
                if (transaction.GetStatus() == TransactionStatus.Started)
                {
                    Log($"Rolling back transaction: {transactionName}");
                    // ⚠ RollBack() also returns a TransactionStatus; discarded deliberately —
                    //   we are already inside the failure path and report the original exception.
                    _ = transaction.RollBack();
                }
                report.Status = transaction.GetStatus();
                report.RolledBack = true;
                throw; // Re-throw the exception to be handled by the CodeRunner
            }
            finally
            {
                if (app != null && handler != null)
                {
                    try { app.DocumentChanged -= handler; }
                    catch { /* unsubscribing must never mask the outcome */ }
                }

                report.RecordIds(added, modified, deleted);
                report.RecordNames(innerNames);
                report.EventsSeen = eventsSeen;
                report.EventsOtherDocument = eventsOtherDocument;

                string rendered = report.Render();
                SafePrint(rendered);
                Log(rendered.Replace(System.Environment.NewLine, " | ", StringComparison.Ordinal));
            }

            return report;
        }
    }
}
