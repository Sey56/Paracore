using Autodesk.Revit.DB;
using System;
using System.IO;

namespace RScript.Engine.Globals
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
            File.AppendAllText(_logPath, $"Starting transaction: {transactionName} at {DateTime.Now}\n");

            if (doc == null)
            {
                File.AppendAllText(_logPath, "Document is null in Transact\n");
                throw new InvalidOperationException("Document is null. Cannot start a transaction.");
            }

            using var transaction = new Transaction(doc, transactionName);
            try
            {
                File.AppendAllText(_logPath, $"Starting transaction: {transactionName}\n");
                transaction.Start();
                action(); // Execute the action, which will use the global Doc
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
                throw;
            }
        }
    }
}