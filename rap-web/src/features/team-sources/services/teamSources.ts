import axios from 'axios';
import api from '@/api/axios';
import { Membership } from '@/types';

export interface CloneSourcePayload {
  repo_url: string;
  local_path: string;
  pat?: string;
}

export interface CloneSourceResponse {
  message: string;
  cloned_path: string;
  source_id: number;
}


export interface CommitChangesPayload {
  source_path: string;
  message: string;
}

export interface SyncSourcePayload {
  path: string;
}

export interface BranchListResponse {
  current_branch: string;
  branches: string[];
}

export interface CheckoutBranchPayload {
  source_path: string;
  branch_name: string;
}

export interface CreateBranchPayload {
  source_path: string;
  branch_name: string;
}

export interface RegisterSourcePayload {
  team_id: number;
  name: string;
  repo_url: string;
}

export interface RegisteredSource {
  id: number;
  team_id: number;
  name: string;
  repo_url: string;
}

/**
 * Calls the backend to get a list of branches for a script source.
 */
export const getSourceBranches = async (sourcePath: string): Promise<BranchListResponse> => {
  try {
    const response = await api.get(`/api/team-sources/branches?source_path=${encodeURIComponent(sourcePath)}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get branches:", error);
    throw error;
  }
};

/**
 * Calls the backend to checkout a specific branch in a script source.
 */
export const checkoutBranch = async (payload: CheckoutBranchPayload) => {
  try {
    const response = await api.post('/api/team-sources/checkout', {
        source_path: payload.source_path,
        branch_name: payload.branch_name
    });
    return response.data;
  } catch (error) {
    console.error("Failed to checkout branch:", error);
    throw error;
  }
};

/**
 * Calls the backend to create a new branch and check it out in a script source.
 */
export const createBranch = async (payload: CreateBranchPayload) => {
  try {
    const response = await api.post('/api/team-sources/create-branch', {
        source_path: payload.source_path,
        branch_name: payload.branch_name
    });
    return response.data;
  } catch (error) {
    console.error("Failed to create branch:", error);
    throw error;
  }
};

/**
 * Calls the backend to pull changes from the remote repository.
 */
export const pullChanges = async (payload: SyncSourcePayload) => {
  try {
    const response = await api.post('/api/team-sources/pull', { path: payload.path });
    return response.data;
  } catch (error) {
    console.error("Failed to pull changes:", error);
    throw error;
  }
};

/**
 * Calls the backend to push changes to the remote repository.
 */
export const pushChanges = async (payload: SyncSourcePayload) => {
  try {
    const response = await api.post('/api/team-sources/push', { path: payload.path });
    return response.data;
  } catch (error) {
    console.error("Failed to push changes:", error);
    throw error;
  }
};

/**
 * Calls the backend to clone a Git repository into a new script source.
 */
export const cloneSource = async (payload: CloneSourcePayload): Promise<CloneSourceResponse> => {
  try {
    const response = await api.post<CloneSourceResponse>('/api/team-sources/clone', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to clone script source:", error);
    throw error;
  }
};

/**
 * Calls the backend to get the Git status of a script source.
 */
export const getSourceStatus = async (sourcePath: string, fetch: boolean = false) => {
  try {
    const response = await api.get(`/api/team-sources/status?source_path=${encodeURIComponent(sourcePath)}&fetch=${fetch}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get status:", error);
    throw error;
  }
};

/**
 * Calls the backend to commit changes in a script source.
 */
export const commitChanges = async (payload: CommitChangesPayload) => {
  try {
    const response = await api.post('/api/team-sources/commit', {
        source_path: payload.source_path,
        message: payload.message
    });
    return response.data;
  } catch (error) {
    console.error("Failed to commit changes:", error);
    throw error;
  }
};

/**
 * Calls the backend to sync a script source (pull and push).
 */
export const syncSource = async (payload: SyncSourcePayload) => {
  try {
    const response = await api.post('/api/team-sources/sync', { path: payload.path });
    return response.data;
  } catch (error) {
    console.error("Failed to sync source:", error);
    throw error;
  }
};

/**
 * Calls the backend to get the last commit log for a specific script file.
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
 * Calls the backend to register a new script source for a team.
 */
export const registerRemoteSource = async (payload: RegisterSourcePayload): Promise<RegisteredSource> => {
  try {
    const response = await api.post<RegisteredSource>('/api/team-sources/register', payload);
    return response.data;
  } catch (error) {
    console.error("Failed to register source:", error);
    throw error;
  }
};

/**
 * Calls the backend to delete a local script source clone from the filesystem.
 */
export const deleteLocalSource = async (sourcePath: string): Promise<void> => {
  try {
    await api.delete('/api/team-sources/local', { data: { path: sourcePath } });
  } catch (error) {
    console.error("Failed to delete local script source:", error);
    throw error;
  }
};

/**
 * Calls the backend to pull changes for multiple script sources at once.
 */
export const pullTeamSources = async (
  rapServerUrl: string,
  sourcePaths: string[],
  token: string,
  branch?: string
): Promise<{ message: string; results: { path: string; status: string; message: string }[] }> => {
  const response = await axios.post(
    `${rapServerUrl}/api/team-sources/pull-all`,
    { source_paths: sourcePaths, branch: branch },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

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
