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
  workspace_id: number;
}


export interface CommitChangesPayload {
  workspace_path: string;
  message: string;
}

export interface SyncWorkspacePayload {
  path: string;
}

export interface BranchListResponse {
  current_branch: string;
  branches: string[];
}

export interface CheckoutBranchPayload {
  workspace_path: string;
  branch_name: string;
}

export interface CreateBranchPayload {
  workspace_path: string;
  branch_name: string;
}

export interface RegisterWorkspacePayload {
  team_id: number;
  name: string;
  repo_url: string;
}

export interface RegisteredWorkspace {
  id: number;
  team_id: number;
  name: string;
  repo_url: string;
}

/**
 * Calls the backend to get a list of branches for a workspace.
 * @param workspacePath - The absolute path to the workspace.
 * @returns The list of branches.
 */
export const getWorkspaceBranches = async (workspacePath: string): Promise<BranchListResponse> => {
  try {
    const response = await api.get(`/api/workspaces/branches?workspace_path=${encodeURIComponent(workspacePath)}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get workspace branches:", error);
    throw error;
  }
};

/**
 * Calls the backend to checkout a specific branch in a workspace.
 * @param payload - The workspace path and the branch name to checkout.
 * @returns The response from the API.
 */
export const checkoutBranch = async (payload: CheckoutBranchPayload) => {
  try {
    const response = await api.post('/api/workspaces/checkout', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to checkout branch:", error);
    throw error;
  }
};

/**
 * Calls the backend to create a new branch and check it out in a workspace.
 * @param payload - The workspace path and the new branch name.
 * @returns The response from the API.
 */
export const createBranch = async (payload: CreateBranchPayload) => {
  try {
    const response = await api.post('/api/workspaces/create-branch', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to create branch:", error);
    throw error;
  }
};

/**
 * Calls the backend to pull changes from the remote repository.
 * @param payload - The workspace path.
 * @returns The response from the API.
 */
export const pullChanges = async (payload: SyncWorkspacePayload) => {
  try {
    const response = await api.post('/api/workspaces/pull', { workspace: payload });
    return response.data;
  } catch (error) {
    console.error("Failed to pull changes:", error);
    throw error;
  }
};

/**
 * Calls the backend to push changes to the remote repository.
 * @param payload - The workspace path.
 * @returns The response from the API.
 */
export const pushChanges = async (payload: SyncWorkspacePayload) => {
  try {
    const response = await api.post('/api/workspaces/push', { workspace: payload });
    return response.data;
  } catch (error) {
    console.error("Failed to push changes:", error);
    throw error;
  }
};

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
export const getWorkspaceStatus = async (workspacePath: string, fetch: boolean = false) => { // Added comment to force re-evaluation
  try {
    const response = await api.get(`/api/workspaces/status?workspace_path=${encodeURIComponent(workspacePath)}&fetch=${fetch}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get workspace status:", error);
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

/**
 * Calls the backend to register a new workspace for a team.
 * @param payload - The team ID, workspace name, and repository URL.
 * @returns The newly registered workspace data.
 */
export const registerWorkspace = async (payload: RegisterWorkspacePayload): Promise<RegisteredWorkspace> => {
  try {
    const response = await api.post<RegisteredWorkspace>('/api/workspaces/register', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to register workspace:", error);
    throw error;
  }
};

/**
 * Calls the backend to delete a local workspace clone from the filesystem.
 * @param workspacePath - The absolute path of the workspace to delete.
 */
export const deleteLocalWorkspace = async (workspacePath: string): Promise<void> => {
  try {
    await api.delete('/api/workspaces/local', { data: { path: workspacePath } });
  } catch (error) {
    console.error("Failed to delete local workspace:", error);
    throw error;
  }
};

import { Membership } from '@/types'; // Import Membership

export interface UserProfileSyncPayload {
  user_id: number;
  email: string;
  memberships: Membership[];
  activeTeam: number | null;
  activeRole: string | null;
}

/**
 * Calls the backend to sync the user's profile information to the local database.
 * @param payload - The user's profile data.
 */
export const syncUserProfile = async (payload: UserProfileSyncPayload): Promise<void> => {
  try {
    await api.post('/api/user/profile/sync', payload);
  } catch (error) {
    console.error("Failed to sync user profile:", error);
    throw error;
  }
};