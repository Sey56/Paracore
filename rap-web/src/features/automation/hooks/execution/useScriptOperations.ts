import { useCallback } from 'react';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Script } from '@/types/scriptModel';

export const useScriptOperations = (
  isAuthenticated: boolean,
  cloudToken: string | null,
  selectedFolder: string | null,
  loadScriptsFromPath: (path: string, silent?: boolean) => Promise<Script[] | undefined>,
  setCombinedScriptContent: (content: string | null) => void,
  setSelectedScriptState: (script: Script | null) => void,
  updateScriptModificationTime?: (scriptId: string) => void,
  editScriptFromContext?: (script: Script, force?: boolean) => Promise<boolean>
) => {
  const { showNotification } = useNotifications();

  const renameScript = useCallback(async (script: Script, newName: string) => {
    if (!script || !isAuthenticated) return { success: false, message: "Authentication required." };
    try {
      const response = await api.post("/api/rename-script", { oldPath: script.absolutePath, newName: newName });
      if (response.data.is_success) {
        showNotification(`Script renamed successfully.`, "success");
        
        // V5 ROBUST: We return the new path immediately. 
        // We do NOT refresh the list here; we let the Provider coordinate the atomic handoff.
        const newPath = response.data.new_path || response.data.newPath;
        return { success: true, message: "Script renamed successfully.", newPath };
      } else throw new Error(response.data.error_message);
    } catch (error: unknown) {
      showNotification((error as Error).message || "Failed to rename script.", "error");
      return { success: false, message: (error as Error).message };
    }
  }, [isAuthenticated, showNotification]);

  const buildTool = useCallback(async (script: Script) => {
    if (!script || !script.absolutePath) return { success: false, message: "Invalid path." };
    try {
      showNotification(`Forging automation unit...`, "info");
      const response = await api.post("/api/scripts/build-tool", { scriptPath: script.absolutePath });
      if (response.data.is_success) {
        showNotification(response.data.message, "success");
        if (selectedFolder) loadScriptsFromPath(selectedFolder, true);
        if (updateScriptModificationTime) updateScriptModificationTime(script.id);
        return { success: true, message: response.data.message };
      } else throw new Error(response.data.detail);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || "Failed to compile script.";
      showNotification(errorMsg, "error");
      return { success: false, message: errorMsg };
    }
  }, [showNotification, selectedFolder, loadScriptsFromPath, updateScriptModificationTime]);

  const editScript = useCallback(async (script: Script, force: boolean = false) => {
    if (!script || !isAuthenticated) return;
    try {
      // Use the centralized implementation if available
      if (editScriptFromContext) {
        return await editScriptFromContext(script, force);
      }
      
      // Fallback (should not be reached if context is used correctly)
      await api.post("/api/edit-script", { scriptPath: script.absolutePath, force_scaffold: force });
      showNotification(force ? "Scaffolding regenerated. Opening..." : "Opening project in VS Code...", "success");
    } catch (error: unknown) {
      console.error("[EditScript] Error:", error);
      const err = error as { response?: { data?: { detail?: string } }, message: string };
      showNotification(err.response?.data?.detail || err.message || "Failed to open script in VSCode.", "error");
    }
  }, [isAuthenticated, editScriptFromContext, showNotification]);

  const fetchScriptContent = useCallback(async (script: Script) => {
    if (!script?.absolutePath) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(script.absolutePath)}`);
        const content = response.data.sourceCode;
        if (content !== undefined) {
          setCombinedScriptContent(content);
        }
        return content;
      } catch (error) {
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300));
        else return null;
      }
    }
    return null;
  }, [setCombinedScriptContent]);

  return {
    renameScript,
    buildTool,
    editScript,
    fetchScriptContent
  };
};
