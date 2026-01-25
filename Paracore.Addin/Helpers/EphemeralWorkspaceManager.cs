using CoreScript.Engine.Logging;
using Paracore.Addin.App;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Paracore.Addin.Helpers
{
    public static class EphemeralWorkspaceManager
    {

        private static readonly string WorkspaceRoot = Path.Combine(Path.GetTempPath(), "rap_workspace");
        private static readonly Dictionary<string, FileSystemWatcher> ActiveWatchers = new Dictionary<string, FileSystemWatcher>();
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, CancellationTokenSource> _debounceTokens = new();

        public static event Action<string> ScriptChanged;

        public static string CreateAndOpenWorkspace(string scriptPath, string scriptType)
        {
            FileLogger.Log($"CreateAndOpenWorkspace requested for: {scriptPath} (Type: {scriptType})");
            try
            {
                Directory.CreateDirectory(WorkspaceRoot);

                string workspaceName = scriptType == "single-file"
                    ? Path.GetFileNameWithoutExtension(scriptPath)
                    : new DirectoryInfo(scriptPath).Name;

                string workspacePath = Path.Combine(WorkspaceRoot, workspaceName);

                if (ParacoreApp.ActiveWorkspaces.TryGetValue(scriptPath, out string existing) && Directory.Exists(existing))
                {
                    FileLogger.Log($"Reusing existing workspace for {scriptPath}: {existing}");
                    workspacePath = existing;
                }
                else if (Directory.Exists(workspacePath))
                {
                    // CRITICAL FIX: Stop watchers BEFORE deleting the directory to prevent
                    // the watcher from thinking the user deleted the files and syncing that deletion to source.
                    StopWatchersForWorkspace(workspacePath);

                    FileLogger.Log($"Deleting existing (stale) workspace directory: {workspacePath}");
                    try
                    {
                        Directory.Delete(workspacePath, true);
                    }
                    catch (Exception ex)
                    {
                        FileLogger.LogError($"DeleteWorkspace: {ex.Message}");
                        workspacePath = Path.Combine(WorkspaceRoot, $"{workspaceName}_{Path.GetRandomFileName()}");
                        FileLogger.Log($"Using new unique workspace path: {workspacePath}");
                    }
                }

                Directory.CreateDirectory(workspacePath);
                FileLogger.Log($"Created new workspace: {workspacePath}");

                // Create a "Scripts" subfolder
                string scriptsPath = Path.Combine(workspacePath, "Scripts");
                Directory.CreateDirectory(scriptsPath);
                FileLogger.Log($"Created 'Scripts' subfolder: {scriptsPath}");

                List<string> scriptFileNames = new List<string>();
                string primaryScriptPathInWorkspace = string.Empty;

                if (scriptType == "single-file")
                {
                    string fileName = Path.GetFileName(scriptPath);
                    string destScript = Path.Combine(scriptsPath, fileName);
                    
                    // Stop watching this file before we overwrite it to prevent loops
                    StopWatcher(destScript);

                    File.Copy(scriptPath, destScript, true);
                    primaryScriptPathInWorkspace = destScript;
                    FileLogger.Log($"Copied single script to workspace: {destScript}");
                }
                else
                {
                    foreach (var file in Directory.GetFiles(scriptPath, "*.cs", SearchOption.TopDirectoryOnly))
                    {
                        string fileName = Path.GetFileName(file);
                        string destScript = Path.Combine(scriptsPath, fileName);
                        
                        // Stop watching this file before we overwrite it
                        StopWatcher(destScript);

                        File.Copy(file, destScript, true);
                        FileLogger.Log($"Copied multi-file script to workspace: {destScript}");
                    }
                    primaryScriptPathInWorkspace = scriptsPath; // The folder containing the scripts
                }

                // Correctly pass the list of script names
                WriteCsproj(workspacePath, workspaceName, scriptFileNames);
                WriteGlobalJson(workspacePath);
                WriteGlobalsCs(workspacePath);
                WriteEditorConfig(workspacePath);
                WriteCopilotInstructions(workspacePath, scriptType);

                ParacoreApp.RegisterWorkspace(scriptPath, workspacePath);

                OpenScriptInVsCode(workspacePath, primaryScriptPathInWorkspace, scriptType, scriptPath);

                return workspacePath;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"CreateAndOpenWorkspace: {ex.Message}");
                throw;
            }
        }

        private static void OpenScriptInVsCode(string workspaceFolder, string scriptToOpenPath, string scriptType, string originalScriptPath)
        {
            FileLogger.Log($"Opening VS Code for workspace: {workspaceFolder}");
            try
            {
                if (scriptType == "single-file")
                {
                    // scriptToOpenPath is the path in the workspace
                    StartFileWatcher(scriptToOpenPath, originalScriptPath);
                }
                else
                {
                    // For multi-file scripts, we watch the entire Scripts directory
                    string originalFolderPath = originalScriptPath;
                    string scriptsPath = Path.Combine(workspaceFolder, "Scripts");

                    StartDirectoryWatcher(scriptsPath, originalFolderPath);
                }

                string arguments = scriptType == "single-file"
    ? string.Format("{0}", workspaceFolder) // Only open the workspace folder
    : string.Format("{0}", workspaceFolder);

                FileLogger.Log($"Launching VS Code with arguments: {arguments}");
                FileLogger.Log($"Full VS Code launch command: cmd.exe /c code {arguments}");
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c code {arguments}",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"OpenScriptInVsCode: {ex.Message}");
                Process.Start("explorer.exe", workspaceFolder);
            }
        }

        private static void StartDirectoryWatcher(string workspaceScriptsPath, string originalFolderPath)
        {
            try
            {
                FileLogger.Log($"Starting directory watcher: {workspaceScriptsPath} -> {originalFolderPath}");

                string watcherKey = $"{workspaceScriptsPath}_DirWatcher";
                StopWatcher(watcherKey); 

                var watcher = new FileSystemWatcher(workspaceScriptsPath)
                {
                    Filter = "*.cs",
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                    EnableRaisingEvents = true,
                    IncludeSubdirectories = false
                };

                watcher.Created += (s, e) => HandleFileCreated(e.FullPath, originalFolderPath);
                watcher.Deleted += (s, e) => HandleFileDeleted(e.FullPath, originalFolderPath);
                watcher.Renamed += (s, e) => HandleFileRenamed(e.OldFullPath, e.FullPath, originalFolderPath);
                watcher.Changed += (s, e) => {
                    string targetPath = Path.Combine(originalFolderPath, e.Name);
                    DebounceSync(e.FullPath, targetPath);
                };
                
                lock (ActiveWatchers)
                {
                    ActiveWatchers[watcherKey] = watcher;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"StartDirectoryWatcher: {ex.Message}");
            }
        }

        private static void HandleFileCreated(string newFilePath, string originalFolderPath)
        {
            try
            {
                string fileName = Path.GetFileName(newFilePath);
                string originalFilePath = Path.Combine(originalFolderPath, fileName);
                
                FileLogger.Log($"New file detected in workspace: {fileName}. Syncing to source...");

                Task.Delay(200).ContinueWith(_ => 
                {
                     try 
                     {
                        if (File.Exists(newFilePath))
                        {
                            File.Copy(newFilePath, originalFilePath, true);
                            FileLogger.Log($"Created new file in source: {originalFilePath}");
                            ScriptChanged?.Invoke(originalFilePath);
                        }
                     }
                     catch (Exception ex) { FileLogger.LogError($"HandleFileCreated Sync Failed: {ex.Message}"); }
                 });
            }
            catch (Exception ex) { FileLogger.LogError($"HandleFileCreated: {ex.Message}"); }
        }

        private static void HandleFileDeleted(string deletedFilePath, string originalFolderPath)
        {
            try
            {
                string fileName = Path.GetFileName(deletedFilePath);
                string originalFilePath = Path.Combine(originalFolderPath, fileName);
                
                FileLogger.Log($"File deletion detected in workspace: {fileName}. Deleting from source...");

                if (File.Exists(originalFilePath))
                {
                    File.Delete(originalFilePath);
                    FileLogger.Log($"Deleted file from source: {originalFilePath}");
                    ScriptChanged?.Invoke(originalFilePath);
                }
            }
            catch (Exception ex) { FileLogger.LogError($"HandleFileDeleted: {ex.Message}"); }
        }

        private static void HandleFileRenamed(string oldPath, string newPath, string originalFolderPath)
        {
            try
            {
                string oldName = Path.GetFileName(oldPath);
                string newName = Path.GetFileName(newPath);
                
                string oldOriginalPath = Path.Combine(originalFolderPath, oldName);
                string newOriginalPath = Path.Combine(originalFolderPath, newName);

                FileLogger.Log($"File rename detected in workspace: {oldName} -> {newName}. Renaming in source...");

                if (File.Exists(oldOriginalPath))
                {
                    if (File.Exists(newOriginalPath)) File.Delete(newOriginalPath);
                    File.Move(oldOriginalPath, newOriginalPath);
                    FileLogger.Log($"Renamed file in source: {oldOriginalPath} -> {newOriginalPath}");
                    ScriptChanged?.Invoke(newOriginalPath);
                }
                else
                {
                    if (File.Exists(newPath))
                    {
                        File.Copy(newPath, newOriginalPath, true);
                        FileLogger.Log($"Copied renamed file to source (old source didn't exist): {newOriginalPath}");
                        ScriptChanged?.Invoke(newOriginalPath);
                    }
                }
            }
            catch (Exception ex) { FileLogger.LogError($"HandleFileRenamed: {ex.Message}"); }
        }

        private static void StopWatchersForWorkspace(string workspacePath)
        {
            var keysToRemove = new List<string>();
            lock (ActiveWatchers)
            {
                foreach (var key in ActiveWatchers.Keys)
                {
                    if (key.StartsWith(workspacePath, StringComparison.OrdinalIgnoreCase))
                    {
                        keysToRemove.Add(key);
                    }
                }
            }

            foreach (var key in keysToRemove)
            {
                FileLogger.Log($"Stopping watcher for stale workspace: {key}");
                StopWatcher(key);
            }
        }

        private static void StopWatcher(string sourcePath)
        {
            lock (ActiveWatchers)
            {
                if (ActiveWatchers.TryGetValue(sourcePath, out var watcher))
                {
                    try
                    {
                        watcher.EnableRaisingEvents = false;
                        watcher.Dispose();
                    }
                    catch { }
                    ActiveWatchers.Remove(sourcePath);
                }
            }
        }

        private static void StartFileWatcher(string sourcePath, string targetPath)
        {
            try
            {
                FileLogger.Log($"Starting file watcher: {sourcePath} -> {targetPath}");

                // Stop existing first
                StopWatcher(sourcePath);

                var watcher = new FileSystemWatcher(Path.GetDirectoryName(sourcePath))
                {
                    Filter = Path.GetFileName(sourcePath),
                    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.FileName | NotifyFilters.CreationTime,
                    EnableRaisingEvents = true,
                    IncludeSubdirectories = false
                };

                watcher.Changed += (s, e) => DebounceSync(sourcePath, targetPath);
                watcher.Renamed += (s, e) => DebounceSync(sourcePath, targetPath);
                watcher.Created += (s, e) => DebounceSync(sourcePath, targetPath); // Capture atomic saves (delete+create)
                watcher.Error += (s, e) => FileLogger.LogError($"FileWatcher Error: {e.GetException().Message}");
                
                lock (ActiveWatchers)
                {
                    ActiveWatchers[sourcePath] = watcher;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"StartFileWatcher: {ex.Message}");
            }
        }

        private static void DebounceSync(string sourcePath, string targetPath)
        {
            if (_debounceTokens.TryGetValue(sourcePath, out var existingTokenSource))
            {
                try { existingTokenSource.Cancel(); existingTokenSource.Dispose(); } catch { }
            }

            var newTokenSource = new CancellationTokenSource();
            _debounceTokens[sourcePath] = newTokenSource;

            Task.Delay(50, newTokenSource.Token).ContinueWith(t =>
            {
                if (t.IsCanceled) return;
                
                _debounceTokens.TryRemove(sourcePath, out _);
                try { newTokenSource.Dispose(); } catch { }

                SyncOnChange(sourcePath, targetPath);
            });
        }

        private static void SyncOnChange(string sourcePath, string targetPath)
        {
            try
            {
                for (int i = 0; i < 5; i++)
                {
                    try
                    {
                        if (File.Exists(sourcePath))
                        {
                            // VSCode sometimes writes an empty file first, but our 200ms debounce handles that.
                            // We MUST allow 0-byte files for intentional clearing.
                            
                            File.Copy(sourcePath, targetPath, true);
                            FileLogger.Log($"Synced changes to: {targetPath}");
                            ScriptChanged?.Invoke(targetPath);
                            return;
                        }
                    }
                    catch (IOException)
                    {
                        Thread.Sleep(300);
                    }
                }
                FileLogger.Log($"Failed to sync file after multiple retries: {sourcePath}");
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"SyncOnChange: {ex.Message}");
            }
        }

        public static void Cleanup()
        {
            FileLogger.Log("Cleaning up all ephemeral workspace file watchers.");
            foreach (var watcher in ActiveWatchers.Values)
            {
                watcher.Dispose();
            }
            ActiveWatchers.Clear();
        }

        private static void WriteCsproj(string folderPath, string projectName, List<string> scriptFileNames)
        {
            string revitPath = ParacoreApp.RevitInstallPath;
            
            // Fix: Use the actual location of the running assembly to find the referenced Engine DLL.
            // This ensures we point to the correct DLL whether running from AppData, Program Files, or bin/Debug.
            string addinDirectory = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
            string enginePath = Path.Combine(addinDirectory, "CoreScript.Engine.dll");

            // Collect all Roslyn-related DLLs from the same directory to ensure they are available for IntelliSense
            var roslynDlls = Directory.GetFiles(addinDirectory, "Microsoft.CodeAnalysis*.dll");
            var roslynReferences = string.Join("\n", roslynDlls.Select(path => 
                $"    <Reference Include=\"{Path.GetFileNameWithoutExtension(path)}\">\n" +
                $"      <HintPath>{path}</HintPath>\n" +
                $"      <Private>false</Private>\n" +
                $"    </Reference>"));

            // Corrected raw string literal with proper indentation
            string csprojContent =
                $$"""
                <Project Sdk="Microsoft.NET.Sdk">
                  <PropertyGroup>
                    <TargetFramework>net8.0-windows</TargetFramework>
                    <LangVersion>latest</LangVersion>
                    <ImplicitUsings>enable</ImplicitUsings>
                    <Nullable>enable</Nullable>
                    <OutputType>Library</OutputType>
                    <RunAnalyzersDuringBuild>true</RunAnalyzersDuringBuild>
                    <RunAnalyzers>true</RunAnalyzers>
                  </PropertyGroup>
                  <ItemGroup>
                    <Reference Include="RevitAPI">
                      <HintPath>{{revitPath}}\RevitAPI.dll</HintPath>
                      <Private>false</Private>
                    </Reference>
                    <Reference Include="RevitAPIUI">
                      <HintPath>{{revitPath}}\RevitAPIUI.dll</HintPath>
                      <Private>false</Private>
                    </Reference>
                    <Reference Include="CoreScript.Engine">
                      <HintPath>{{enginePath}}</HintPath>
                      <Private>false</Private>
                    </Reference>
                    {{roslynReferences.Replace("\n", "\n                    ")}}
                  </ItemGroup>
                  <ItemGroup>
                    <PackageReference Include="SixLabors.ImageSharp" Version="3.1.5" />
                    <PackageReference Include="RestSharp" Version="113.1.0" />
                    <PackageReference Include="MiniExcel" Version="1.31.2" />
                    <PackageReference Include="MathNet.Numerics" Version="5.0.0" />
                  </ItemGroup>
                </Project>
                """;

            File.WriteAllText(Path.Combine(folderPath, $"{projectName}.csproj"), csprojContent);
        }


        private static void WriteGlobalJson(string folderPath)
        {
            File.WriteAllText(Path.Combine(folderPath, "global.json"),
                "{\n" +
                "    \"sdk\": {\n" +
                "        \"rollForward\": \"latestFeature\"\n" +
                "    }\n" +
                "}");
        }

        private static void WriteGlobalsCs(string folderPath)
        {
            File.WriteAllText(Path.Combine(folderPath, "Globals.cs"),
                "// This file enables IntelliSense for custom globals and implicit imports.\n" +
                "global using System;\n" +
                "global using System.Collections.Generic;\n" +
                "global using System.Linq;\n" +
                "global using System.Text.Json;\n" +
                "global using Microsoft.CSharp;\n" +
                "global using Autodesk.Revit.DB;\n" +
                "global using Autodesk.Revit.DB.Architecture;\n" +
                "global using Autodesk.Revit.DB.Structure;\n" +
                "global using Autodesk.Revit.UI;\n" +
                "global using CoreScript.Engine.Globals;\n" +
                "global using static CoreScript.Engine.Globals.DesignTimeGlobals;\n" +
                "global using SixLabors.ImageSharp;\n" +
                "global using SixLabors.ImageSharp.Processing;\n" +
                "global using SixLabors.ImageSharp.PixelFormats;\n" +
                "global using RestSharp;\n" +
                "global using MiniExcelLibs;\n" +
                "global using MathNet.Numerics;\n" +
                "global using MathNet.Numerics.LinearAlgebra;\n" +
                "global using MathNet.Numerics.Statistics;");
        }

        private static void WriteEditorConfig(string folderPath)
        {
            File.WriteAllText(Path.Combine(folderPath, ".editorconfig"),
                "[*.{cs,vb}]\n" +
                "dotnet_diagnostic.CA1050.severity = none\n" +
                "dotnet_diagnostic.CS8019.severity = warning");
        }

        private static void WriteCopilotInstructions(string folderPath, string scriptType)
        {
            try
            {
                string githubFolder = Path.Combine(folderPath, ".github");
                Directory.CreateDirectory(githubFolder);
                
                string contextHeader = scriptType == "single-file" 
                    ? "# Current Script Type: SINGLE-FILE\n# Keep ALL logic, helpers, and the Params class in THIS ONE .cs file.\n# PARAMETER GROUPING: use #region GroupName directives to organize parameters.\n\n" 
                    : "# Current Script Type: MULTI-FILE FOLDER\n# Modularization is OPTIONAL. Entry point is auto-detected by Roslyn.\n# If simple, keep everything in the entry file. If complex, create Utils.cs, Params.cs, etc.\n# PARAMETER GROUPING: use #region GroupName directives to organize parameters.\n\n";

                File.WriteAllText(Path.Combine(githubFolder, "copilot-instructions.md"), contextHeader + AiInstructions.CopilotInstructions);
                FileLogger.Log($"Written Copilot instructions with {scriptType} context to: {githubFolder}");
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"WriteCopilotInstructions: {ex.Message}");
            }
        }
    }
}
