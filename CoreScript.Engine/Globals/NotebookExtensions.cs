using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace CoreScript.Engine.Globals
{
    public static class NotebookExtensions
    {
        /// <summary>
        /// Exports a collection of objects to a JSON file and auto-generates a Jupyter Notebook ready for Pandas analysis.
        /// Opens the generated notebook automatically in VS Code.
        /// </summary>
        public static IEnumerable<T> ToNotebook<T>(this IEnumerable<T> elements, string notebookName = "Paracore_Analysis")
        {
            try
            {
                var list = elements.ToList();
                ExecutionGlobals.TrackPipeline(list.Count);
                if (!list.Any())
                {
                    ScriptApi.Println($"[INFO] The collection is empty. Notebook '{notebookName}' was not created.");
                    return list;
                }
                
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string scratchDir = Path.Combine(appData, "paracore-data", "notebooks", "scratch");
                if (!Directory.Exists(scratchDir))
                {
                    Directory.CreateDirectory(scratchDir);
                }

                // ⚠ The data file MUST be per-call. It used to be a fixed "data.json", so every
                // notebook ever generated read the SAME file — reopening an older notebook later
                // silently loaded the newest data. notebookName is caller-supplied, so sanitize it
                // before it reaches a path (it also names the .ipynb).
                var safeName = string.Join("_", notebookName.Split(Path.GetInvalidFileNameChars(),
                    StringSplitOptions.RemoveEmptyEntries)).Trim();
                if (string.IsNullOrEmpty(safeName))
                {
                    safeName = "Paracore_Analysis";
                }

                string dataFile = Path.Combine(scratchDir, $"{safeName}_data.json");
                string notebookFile = Path.Combine(scratchDir, $"{safeName}.ipynb");

                // 1. Serialize Data
                // Serialize any collection (anonymous types, specific objects) to JSON
                string json = JsonSerializer.Serialize(list, ExecutionGlobals.SerializerOptions);
                File.WriteAllText(dataFile, json);

                // 2. Generate Notebook JSON Schema
                var notebookContent = new
                {
                    nbformat = 4,
                    nbformat_minor = 2,
                    metadata = new { }, 
                    cells = new object[]
                    {
                        new
                        {
                            cell_type = "markdown",
                            metadata = new { },
                            source = new[] { $"# 📊 {notebookName}\n", $"*Exported from Paracore on {DateTime.Now}*\n", $"\n", $"**Total Records:** {list.Count}" }
                        },
                        new
                        {
                            cell_type = "code",
                            execution_count = (int?)null,
                            metadata = new { },
                            outputs = new object[] { },
                            source = new[] { "import pandas as pd\n", "import json\n", "\n", $"# Load the Paracore data into a Pandas DataFrame\n", $"df = pd.read_json(r'{dataFile.Replace("\\", "\\\\")}')\n", "df.head()" }
                        },
                        new
                        {
                            cell_type = "markdown",
                            metadata = new { },
                            source = new[] { "### 🤖 AI Analysis Start\n", "You can use VS Code Copilot or add your own analysis code below." }
                        },
                        new
                        {
                            cell_type = "code",
                            execution_count = (int?)null,
                            metadata = new { },
                            outputs = new object[] { },
                            source = new[] { "# e.g. df.groupby('Level')['Area'].sum().plot(kind='bar')\n" }
                        }
                    }
                };

                string nbJson = JsonSerializer.Serialize(notebookContent, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(notebookFile, nbJson);

                // 3. Auto-Open in VS Code
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "code",
                    Arguments = $"\"{notebookFile}\"",
                    UseShellExecute = true,
                    CreateNoWindow = true
                };
                Process.Start(psi);
                
                ScriptApi.Println($"✅ Successfully exported {list.Count} records to Notebook: {notebookName}");
            }
            catch (Exception ex)
            {
                ScriptApi.Println($"❌ Failed to generate Notebook: {ex.Message}");
            }
            
            return elements;
        }
    }
}
