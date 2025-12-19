using CoreScript.Engine.Logging;
using RServer.Addin.App;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;

namespace RServer.Addin.Helpers
{
    public static class EphemeralWorkspaceManager
    {

        private static readonly string WorkspaceRoot = Path.Combine(Path.GetTempPath(), "rap_workspace");
        private static readonly Dictionary<string, FileSystemWatcher> ActiveWatchers = new Dictionary<string, FileSystemWatcher>();

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

                if (RServerApp.ActiveWorkspaces.TryGetValue(scriptPath, out string existing) && Directory.Exists(existing))
                {
                    FileLogger.Log($"Reusing existing workspace for {scriptPath}: {existing}");
                    OpenScriptInVsCode(existing, scriptPath, scriptType, scriptPath);
                    return existing;
                }

                if (Directory.Exists(workspacePath))
                {
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
                    string destScript = Path.Combine(scriptsPath, fileName); // Changed path
                    File.Copy(scriptPath, destScript, true);
                    scriptFileNames.Add(Path.Combine("Scripts", fileName)); // Add relative path
                    primaryScriptPathInWorkspace = destScript;
                    FileLogger.Log($"Copied single script to workspace: {destScript}");
                }
                else
                {
                    foreach (var file in Directory.GetFiles(scriptPath, "*.cs", SearchOption.TopDirectoryOnly))
                    {
                        string fileName = Path.GetFileName(file);
                        string destScript = Path.Combine(scriptsPath, fileName); // Changed path
                        File.Copy(file, destScript, true);
                        scriptFileNames.Add(Path.Combine("Scripts", fileName)); // Add relative path
                        FileLogger.Log($"Copied multi-file script to workspace: {destScript}");
                    }
                    primaryScriptPathInWorkspace = scriptsPath; // The folder containing the scripts
                }

                // Correctly pass the list of script names
                WriteCsproj(workspacePath, workspaceName, scriptFileNames);
                WriteGlobalJson(workspacePath);
                WriteGlobalsCs(workspacePath);
                WriteEditorConfig(workspacePath);

                RServerApp.RegisterWorkspace(scriptPath, workspacePath);

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
                    // For multi-file scripts, scriptToOpenPath is the original folder path
                    string originalFolderPath = originalScriptPath;

                    string scriptsPath = Path.Combine(workspaceFolder, "Scripts");
                    foreach (var fileInWorkspace in Directory.GetFiles(scriptsPath, "*.cs", SearchOption.TopDirectoryOnly))
                    {
                        if (Path.GetFileName(fileInWorkspace).Equals("Globals.cs", StringComparison.OrdinalIgnoreCase)) continue;

                        string originalFilePath = Path.Combine(originalFolderPath, Path.GetFileName(fileInWorkspace));

                        StartFileWatcher(fileInWorkspace, originalFilePath);
                    }
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

        private static void StartFileWatcher(string sourcePath, string targetPath)
        {
            try
            {
                FileLogger.Log($"Starting file watcher: {sourcePath} -> {targetPath}");

                if (ActiveWatchers.TryGetValue(sourcePath, out var existingWatcher))
                {
                    existingWatcher.Dispose();
                    ActiveWatchers.Remove(sourcePath);
                }

                var watcher = new FileSystemWatcher(Path.GetDirectoryName(sourcePath))
                {
                    Filter = Path.GetFileName(sourcePath),
                    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size,
                    EnableRaisingEvents = true,
                    IncludeSubdirectories = false
                };

                watcher.Changed += (s, e) => SyncOnChange(sourcePath, targetPath);
                ActiveWatchers[sourcePath] = watcher;
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"StartFileWatcher: {ex.Message}");
            }
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
            string revitPath = RServerApp.RevitInstallPath;
            string enginePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Autodesk", "Revit", "Addins", RServerApp.RevitVersion, "RServer", "CoreScript.Engine.dll");

            var compileItems = string.Join("\n", scriptFileNames.Select(file => $"    <Compile Include=\"{file}\" />"));

            // Corrected raw string literal with proper indentation
            string csprojContent =
                $$"""
                <Project Sdk="Microsoft.NET.Sdk">
                  <PropertyGroup>
                    <TargetFramework>net8.0-windows</TargetFramework>
                    <ImplicitUsings>enable</ImplicitUsings>
                    <Nullable>enable</Nullable>
                    <OutputType>Exe</OutputType>
                    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
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
                    <Compile Include="Globals.cs" />
                    {{compileItems}}
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
                "        \"version\": \"8.0.414\"\n" +
                "    }\n" +
                "}");
        }

        private static void WriteGlobalsCs(string folderPath)
        {
            File.WriteAllText(Path.Combine(folderPath, "Globals.cs"),
                "// This file enables IntelliSense for custom globals.\n" +
                "global using CoreScript.Engine.Globals;\n" +
                "global using static CoreScript.Engine.Globals.DesignTimeGlobals;");
        }

        private static void WriteEditorConfig(string folderPath)
        {
            File.WriteAllText(Path.Combine(folderPath, ".editorconfig"),
                "[*.{cs,vb}]\n" +
                "dotnet_diagnostic.CA1050.severity = none");
        }
    }
}