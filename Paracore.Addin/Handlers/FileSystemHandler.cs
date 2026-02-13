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

                string directory = Path.GetDirectoryName(oldPath) ?? "";
                string newPath = isDirectory 
                    ? Path.Combine(directory, newName) 
                    : Path.Combine(directory, newName + ".cs");

                if ((isDirectory && Directory.Exists(newPath)) || (isFile && File.Exists(newPath)))
                {
                    response.IsSuccess = false;
                    response.ErrorMessage = $"A {(isDirectory ? "folder" : "script")} with the name '{newName}' already exists.";
                    return response;
                }

                if (ParacoreApp.ActiveWorkspaces.TryGetValue(oldPath, out string? workspacePath))
                {
                    _logger.Log($"[RenameScript] Cleaning up workspace for old path: {oldPath}", LogLevel.Info);
                    ParacoreApp.ActiveWorkspaces.Remove(oldPath);
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
                string workspacePath = EphemeralWorkspaceManager.CreateAndOpenWorkspace(request.ScriptPath, request.ScriptType);
                response.WorkspacePath = workspacePath;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[FileSystemHandler] Error in CreateAndOpenWorkspace: {ex.Message}");
                response.ErrorMessage = $"Failed to create and open workspace: {ex.Message}";
            }
            return response;
        }

        public StopSyncSessionResponse StopSyncSession(StopSyncSessionRequest request)
        {
            var response = new StopSyncSessionResponse();
            try
            {
                bool success = EphemeralWorkspaceManager.StopSyncSession(request.ScriptPath);
                response.IsSuccess = success;
                if (!success) response.ErrorMessage = "No active sync session found for this script.";
            }
            catch (Exception ex)
            {
                _logger.LogError($"[FileSystemHandler] Error in StopSyncSession: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }
            return response;
        }
    }
}
