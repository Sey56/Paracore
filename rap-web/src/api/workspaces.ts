import axios from 'axios';
import api from './axios';



export interface CloneWorkspacePayload {
  repo_url: string;
  local_path: string;
  pat?: string;
}

export interface CloneWorkspaceResponse {
  message: string;
  cloned_path: string;
  workspace_id: string;
}


export interface CommitChangesPayload {
  workspace_path: string;
  message: string;
}

export interface SyncWorkspacePayload {
  path: string;
}

/**
 * Calls the backend to clone a Git repository into a new workspace.
 * @param payload - The repository URL and the local path for cloning.
 * @returns The response from the API.
 */
export const cloneWorkspace = async (payload: CloneWorkspacePayload): Promise<CloneWorkspaceResponse> => {
  try {
    const response = await api.post<CloneWorkspaceResponse>('/api/workspaces/clone', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to clone workspace:", error);
    throw error;
  }
};

/**
 * Calls the backend to get the Git status of a workspace.
 * @param workspacePath - The absolute path to the workspace.
 * @returns The Git status data.
 */
export const getWorkspaceStatus = async (workspacePath: string) => {
  try {
    const response = await api.get(`/api/workspaces/status?workspace_path=${encodeURIComponent(workspacePath)}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get workspace status:", error);
    throw error;
  }
};

/**
 * Calls the backend to get a list of C# script files (.cs) within a given workspace path.
 * @param workspacePath - The absolute path to the workspace.
 * @returns A list of absolute paths to script files.
 */
export const getWorkspaceScripts = async (workspacePath: string): Promise<string[]> => {
  try {
    const response = await api.get(`/api/workspaces/scripts?workspace_path=${encodeURIComponent(workspacePath)}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get workspace scripts:", error);
    throw error;
  }
};

/**
 * Calls the backend to commit changes in a workspace.
 * @param payload - The workspace path and commit message.
 * @returns The response from the API.
 */
export const commitChanges = async (payload: CommitChangesPayload) => {
  try {
    const response = await api.post('/api/workspaces/commit', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to commit changes:", error);
    throw error;
  }
};

/**
 * Calls the backend to sync a workspace (pull and push).
 * @param payload - The workspace path.
 * @returns The response from the API.
 */
export const syncWorkspace = async (payload: SyncWorkspacePayload) => {
  try {
    const response = await api.post('/api/workspaces/sync', { workspace: payload });
    return response.data;
  } catch (error) {
    console.error("Failed to sync workspace:", error);
    throw error;
  }
};

/**
 * Calls the backend to get the last commit log for a specific script file.
 * @param scriptPath - The absolute path to the script file.
 * @returns The Git log data.
 */
export const getScriptLog = async (scriptPath: string) => {
  try {
    const response = await api.get(`/api/scripts/log?script_path=${encodeURIComponent(scriptPath)}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get script log:", error);
    throw error;
  }
};



