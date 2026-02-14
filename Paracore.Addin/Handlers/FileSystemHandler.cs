using CoreScript;
using CoreScript.Engine.Logging;
using Paracore.Addin.Helpers;
using Paracore.Addin.App;
using System;
using System.IO;
using System.Threading.Tasks;

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
                string projectPath = EphemeralWorkspaceManager.ScaffoldAndOpenProject(request.ScriptPath);
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
