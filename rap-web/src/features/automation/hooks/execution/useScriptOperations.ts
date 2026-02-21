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
  setSelectedScriptState: (script: Script | null) => void
) => {
  const { showNotification } = useNotifications();

  const renameScript = useCallback(async (script: Script, newName: string) => {
    if (!script || !isAuthenticated) return { success: false, message: "Authentication required." };
    try {
      const response = await api.post("/api/rename-script", { oldPath: script.absolutePath, newName: newName });
      if (response.data.success) {
        showNotification(`Script renamed successfully.`, "success");
        if (selectedFolder) loadScriptsFromPath(selectedFolder, true);
        setSelectedScriptState(null);
        setCombinedScriptContent(null);
        return { success: true, message: "Script renamed successfully." };
      } else throw new Error(response.data.message);
    } catch (error: any) {
      showNotification(error.message || "Failed to rename script.", "error");
      return { success: false, message: error.message };
    }
  }, [isAuthenticated, selectedFolder, loadScriptsFromPath, showNotification, setCombinedScriptContent, setSelectedScriptState]);

  const buildTool = useCallback(async (script: Script) => {
    if (!script || !script.absolutePath) return { success: false, message: "Invalid path." };
    try {
      showNotification(`Forging automation unit...`, "info");
      const response = await api.post("/api/scripts/build-tool", { scriptPath: script.absolutePath });
      if (response.data.is_success) {
        showNotification(response.data.message, "success");
        if (selectedFolder) loadScriptsFromPath(selectedFolder, true);
        return { success: true, message: response.data.message };
      } else throw new Error(response.data.detail);
    } catch (error: any) {
      showNotification(error.message || "Failed to compile script.", "error");
      return { success: false, message: error.message };
    }
  }, [showNotification, selectedFolder, loadScriptsFromPath]);

  const editScript = useCallback(async (script: Script) => {
    if (!script || !isAuthenticated) return;
    try {
      const response = await fetch("http://localhost:8000/api/edit-script", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cloudToken}` },
        body: JSON.stringify({ scriptPath: script.absolutePath }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      showNotification(`Opening project in VS Code...`, "success");
    } catch (error) {
      console.error("[EditScript] Error:", error);
      showNotification("Failed to open script in VSCode.", "error");
    }
  }, [isAuthenticated, cloudToken, showNotification]);

  const fetchScriptContent = useCallback(async (script: Script) => {
    if (!script?.absolutePath) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(script.absolutePath)}`);
        return response.data.sourceCode;
      } catch (error) {
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300));
        else return null;
      }
    }
    return null;
  }, []);

  return {
    renameScript,
    buildTool,
    editScript,
    fetchScriptContent
  };
};
