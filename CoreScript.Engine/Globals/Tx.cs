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

            var changedElementIds = new List<ElementId>();
            var deletedElementIds = new List<ElementId>();

            // Define the event handler
            void DocumentChangedHandler(object sender, DocumentChangedEventArgs e)
            {
                // Collect IDs of newly created and modified elements
                changedElementIds.AddRange(e.GetAddedElementIds());
                changedElementIds.AddRange(e.GetModifiedElementIds());
                deletedElementIds.AddRange(e.GetDeletedElementIds());
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

                // After the transaction is complete, process the changed elements
                var globals = ExecutionGlobals.Current.Value;
                if (globals != null)
                {
                    var payloads = new List<string>();

                    if (changedElementIds.Any())
                    {
                        // Group elements by category
                        var elementsByCategory = new Dictionary<string, List<long>>();
                        
                        // Use a HashSet to avoid duplicates if an element was both added and modified
                        var uniqueIds = new HashSet<ElementId>(changedElementIds);

                        foreach (var id in uniqueIds)
                        {
                            if (id == ElementId.InvalidElementId) continue;

                            try 
                            {
                                var element = doc.GetElement(id);
                                if (element != null && element.Category != null)
                                {
                                    string categoryName = element.Category.Name;
                                    if (!elementsByCategory.ContainsKey(categoryName))
                                    {
                                        elementsByCategory[categoryName] = new List<long>();
                                    }
                                    elementsByCategory[categoryName].Add(id.Value);
                                }
                                else if (element != null)
                                {
                                     // Handle elements without category if needed, or skip
                                     string categoryName = "Unknown";
                                     if (!elementsByCategory.ContainsKey(categoryName))
                                    {
                                        elementsByCategory[categoryName] = new List<long>();
                                    }
                                    elementsByCategory[categoryName].Add(id.Value);
                                }
                            }
                            catch
                            {
                                // Ignore elements that can't be retrieved (e.g. deleted)
                            }
                        }

                        if (elementsByCategory.Any())
                        {
                            var jsonParts = new List<string>();
                            foreach (var kvp in elementsByCategory)
                            {
                                var ids = string.Join(",", kvp.Value);
                                jsonParts.Add($"\"{kvp.Key}\": [{ids}]");
                            }
                            string categoriesJson = "{" + string.Join(", ", jsonParts) + "}";

                            string payload = $"{{ \"paracore_output_type\": \"working_set_elements\", \"operation\": \"add\", \"elements_by_category\": {categoriesJson} }}";
                            payloads.Add(payload);
                        }
                    }
                    
                    if (deletedElementIds.Any())
                    {
                         // Handle deletions
                         var uniqueDeletedIds = new HashSet<long>(deletedElementIds.Select(id => id.Value));
                         var idsCsv = string.Join(",", uniqueDeletedIds);
                         
                         // We send operation: "remove" and "element_ids": [...]
                         string payload = $"{{ \"paracore_output_type\": \"working_set_elements\", \"operation\": \"remove\", \"element_ids\": [{idsCsv}] }}";
                         payloads.Add(payload);
                    }

                    if (payloads.Any())
                    {
                        globals.SetInternalData(string.Join("\n", payloads));
                    }
                }
            }
        }
    }
}
