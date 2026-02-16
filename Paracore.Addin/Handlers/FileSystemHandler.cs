using CoreScript;
using CoreScript.Engine.Logging;
using Paracore.Addin.Helpers;
using Paracore.Addin.App;
using System;
using System.IO;
using System.Threading.Tasks;
using System.Text.RegularExpressions;

namespace Paracore.Addin.Handlers
{
    public class FileSystemHandler
    {
        private readonly ILogger _logger;

        public FileSystemHandler(ILogger logger)
        {
            _logger = logger;
        }

        public RenameScriptResponse RenameScript(RenameScriptRequest request)
        {
            var response = new RenameScriptResponse();
            try
            {
                string oldPath = request.OldPath;
                string newName = request.NewName?.Trim() ?? "";

                if (string.IsNullOrWhiteSpace(newName))
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = "New name cannot be empty.";
                    return response;
                }

                char[] invalidChars = Path.GetInvalidFileNameChars();
                if (newName.IndexOfAny(invalidChars) >= 0)
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = "New name contains invalid characters.";
                    return response;
                }

                bool isDirectory = Directory.Exists(oldPath);
                bool isFile = File.Exists(oldPath);

                if (!isDirectory && !isFile)
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = $"Source script not found at path: {oldPath}";
                    return response;
                }

                string parentDir = Path.GetDirectoryName(oldPath) ?? "";
                string extension = Path.GetExtension(oldPath);
                
                // Construct new path preserving extension if it's a file
                string newPath = isDirectory 
                    ? Path.Combine(parentDir, newName)
                    : Path.Combine(parentDir, newName + extension);

                if ((isDirectory && Directory.Exists(newPath)) || (isFile && File.Exists(newPath)))
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = $"A script with the name '{newName}' already exists.";
                    return response;
                }

                if (isDirectory) Directory.Move(oldPath, newPath);
                else File.Move(oldPath, newPath);

                // V3.1: Project-Aware Renaming
                // If we renamed a directory, also rename the internal project files
                if (isDirectory)
                {
                    try
                    {
                        string oldNameOnly = Path.GetFileName(oldPath);
                        string newProjectDir = newPath;

                        // 1. Rename .csproj and .sln in the root
                        foreach (var file in Directory.GetFiles(newProjectDir))
                        {
                            string fileName = Path.GetFileName(file);
                            string ext = Path.GetExtension(file).ToLower();

                            if ((ext == ".csproj" || ext == ".sln") && 
                                Path.GetFileNameWithoutExtension(fileName).Equals(oldNameOnly, StringComparison.OrdinalIgnoreCase))
                            {
                                string newFileName = Path.Combine(newProjectDir, newName + ext);
                                if (!File.Exists(newFileName))
                                {
                                    File.Move(file, newFileName);
                                    _logger.Log($"[RenameScript] Renamed project file: {fileName} -> {newName + ext}", LogLevel.Info);

                                    // Update .sln content to point to the new .csproj name
                                    if (ext == ".sln")
                                    {
                                        try
                                        {
                                            string slnContent = File.ReadAllText(newFileName);
                                            string oldProjectRef = $"\"{oldNameOnly}.csproj\"";
                                            string newProjectRef = $"\"{newName}.csproj\"";
                                            
                                            // Simple case-insensitive replacement for the project reference
                                            string updatedContent = slnContent.Replace(oldProjectRef, newProjectRef);
                                            
                                            // Also replace the project name label in the solution
                                            string oldProjectLabel = $"Project(\"{{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}}\") = \"{oldNameOnly}\"";
                                            string newProjectLabel = $"Project(\"{{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}}\") = \"{newName}\"";
                                            updatedContent = updatedContent.Replace(oldProjectLabel, newProjectLabel);

                                            if (slnContent != updatedContent)
                                            {
                                                File.WriteAllText(newFileName, updatedContent);
                                                _logger.Log($"[RenameScript] Updated .sln content references.", LogLevel.Info);
                                            }
                                        }
                                        catch (Exception slnEx)
                                        {
                                            _logger.Log($"[RenameScript] Could not update .sln content: {slnEx.Message}", LogLevel.Warning);
                                        }
                                    }
                                }
                            }
                        }

                        // 2. Rename the primary .cs file in Scripts/
                        string scriptsPath = Path.Combine(newProjectDir, "Scripts");
                        if (Directory.Exists(scriptsPath))
                        {
                            foreach (var file in Directory.GetFiles(scriptsPath, "*.cs"))
                            {
                                string fileName = Path.GetFileName(file);
                                if (Path.GetFileNameWithoutExtension(fileName).Equals(oldNameOnly, StringComparison.OrdinalIgnoreCase))
                                {
                                    string newCsFile = Path.Combine(scriptsPath, newName + ".cs");
                                    if (!File.Exists(newCsFile))
                                    {
                                        File.Move(file, newCsFile);
                                        _logger.Log($"[RenameScript] Renamed entry script: {fileName} -> {newName}.cs", LogLevel.Info);

                                        // Update metadata DisplayName if it matches the old name
                                        try
                                        {
                                            string content = File.ReadAllText(newCsFile);
                                            string pattern = $@"DisplayName\s*:\s*{System.Text.RegularExpressions.Regex.Escape(oldNameOnly)}";
                                            string replacement = $"DisplayName: {newName}";
                                            
                                            if (System.Text.RegularExpressions.Regex.IsMatch(content, pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                                            {
                                                string updatedContent = System.Text.RegularExpressions.Regex.Replace(content, pattern, replacement, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                                                File.WriteAllText(newCsFile, updatedContent);
                                                _logger.Log($"[RenameScript] Updated DisplayName in metadata via Regex.", LogLevel.Info);
                                            }
                                        }
                                        catch (Exception metaEx)
                                        {
                                            _logger.Log($"[RenameScript] Could not update metadata DisplayName: {metaEx.Message}", LogLevel.Warning);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch (Exception innerEx)
                    {
                        _logger.LogError($"[RenameScript] Failed to rename internal project files: {innerEx.Message}");
                        // We don't fail the whole operation if internal renames fail, 
                        // as the main folder rename succeeded.
                    }
                }

                _logger.Log($"[RenameScript] Renamed '{(isDirectory ? "folder" : "file")}' '{oldPath}' to '{newPath}'", LogLevel.Info);
                response.IsSuccess = true;
                response.NewPath = newPath;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[FileSystemHandler] RenameScript failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }
            return response;
        }

        public CreateWorkspaceResponse CreateAndOpenWorkspace(CreateWorkspaceRequest request)
        {
            var response = new CreateWorkspaceResponse();
            try
            {
                // V3 Architecture: Everything is an in-place Project Folder
                string projectPath = WorkspaceManager.ScaffoldAndOpenProject(request.ScriptPath);
                response.WorkspacePath = projectPath;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[FileSystemHandler] Error in CreateAndOpenWorkspace: {ex.Message}");
                response.ErrorMessage = $"Failed to open project in VSCode: {ex.Message}";
            }
            return response;
        }

        public StopSyncSessionResponse StopSyncSession(StopSyncSessionRequest request)
        {
            // V3: Synchronization is no longer managed. 
            // Return success immediately to satisfy the gRPC contract.
            return new StopSyncSessionResponse { IsSuccess = true };
        }
    }
}
