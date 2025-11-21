using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    public static class Tx
    {
        private static readonly string _logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "TxDebugLog.txt");

        // Overload that takes Action<Document> for backward compatibility, though it's less recommended.
        public static void Transact(Document doc, string transactionName, Action<Document> action)
        {
            ExecuteTransaction(doc, transactionName, () => action(doc));
        }

        // New, preferred overload that takes a parameterless Action.
        public static void Transact(Document doc, string transactionName, Action action)
        {
            ExecuteTransaction(doc, transactionName, action);
        }

        private static void ExecuteTransaction(Document doc, string transactionName, Action action)
        {
            if (doc == null)
            {
                File.AppendAllText(_logPath, "Document is null in Transact\n");
                throw new InvalidOperationException("Document is null. Cannot start a transaction.");
            }

            var createdElementIds = new List<ElementId>();

            // Define the event handler
            void DocumentChangedHandler(object sender, DocumentChangedEventArgs e)
            {
                // Collect IDs of newly created elements
                createdElementIds.AddRange(e.GetAddedElementIds());
            }

            // Subscribe to the event
            doc.Application.DocumentChanged += DocumentChangedHandler;

            using var transaction = new Transaction(doc, transactionName);
            try
            {
                File.AppendAllText(_logPath, $"Starting transaction: {transactionName}\n");
                transaction.Start();
                action(); // Execute the script's action
                File.AppendAllText(_logPath, $"Committing transaction: {transactionName}\n");
                transaction.Commit();
                File.AppendAllText(_logPath, $"Transaction committed successfully: {transactionName}\n");
            }
            catch (Exception ex)
            {
                File.AppendAllText(_logPath, $"Exception in transaction: {ex.Message}\n");
                if (transaction.GetStatus() == TransactionStatus.Started)
                {
                    File.AppendAllText(_logPath, $"Rolling back transaction: {transactionName}\n");
                    transaction.RollBack();
                }
                throw; // Re-throw the exception to be handled by the CodeRunner
            }
            finally
            {
                // CRITICAL: Always unsubscribe from the event
                doc.Application.DocumentChanged -= DocumentChangedHandler;

                // After the transaction is complete, process the created elements
                if (createdElementIds.Any())
                {
                    var globals = ExecutionGlobals.Current.Value;
                    if (globals != null)
                    {
                        string idsJson = string.Join(",", createdElementIds.Select(id => id.Value));
                        string payload = $"{{ \"paracore_output_type\": \"working_set_elements\", \"operation\": \"add\", \"element_ids\": [{idsJson}] }}";
                        globals.SetInternalData(payload);
                    }
                }
            }
        }
    }
}