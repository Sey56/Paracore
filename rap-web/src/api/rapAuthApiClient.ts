import axios from 'axios';
import { Workspace } from '@/types';

const AUTH_SERVER_URL = 'https://rap-auth-server-production.up.railway.app';

/**
 * Registers a new workspace for a team on the cloud auth server.
 * @param teamId The ID of the team.
 * @param name The name for the new workspace.
 * @param repoUrl The Git repository URL for the workspace.
 * @param token The user's cloud authentication token.
 * @returns The newly created workspace.
 */
export const registerWorkspace = async (
  teamId: number,
  name: string,
  repoUrl: string,
  token: string
): Promise<Workspace> => {
  try {
    const response = await axios.post(
      `${AUTH_SERVER_URL}/api/teams/${teamId}/workspaces`,
      { name, repo_url: repoUrl },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to register workspace:', error);
    throw error;
  }
};

/**
 * Fetches all registered workspaces for a given team from the cloud auth server.
 * @param teamId The ID of the team.
 * @param token The user's cloud authentication token.
 * @returns A list of workspaces.
 */
export const getTeamWorkspaces = async (
  teamId: number,
  token: string
): Promise<Workspace[]> => {
  try {
    const response = await axios.get(
      `${AUTH_SERVER_URL}/api/teams/${teamId}/workspaces`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch team workspaces:', error);
    throw error;
  }
};

/**
 * Deletes a registered workspace from the cloud auth server.
 * @param workspaceId The ID of the workspace to delete.
 * @param token The user's cloud authentication token.
 */
export const deleteRegisteredWorkspace = async (
  workspaceId: number,
  token: string
): Promise<void> => {
  try {
    await axios.delete(`${AUTH_SERVER_URL}/api/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Updates an existing registered workspace on the cloud auth server.
 * @param workspaceId The ID of the workspace to update.
 * @param name The new name for the workspace (optional).
 * @param repoUrl The new Git repository URL for the workspace (optional).
 * @param token The user's cloud authentication token.
 * @returns The updated workspace.
 */
export const updateRegisteredWorkspace = async (
  workspaceId: number,
  name: string | undefined,
  repoUrl: string | undefined,
  token: string
): Promise<Workspace> => {
  try {
    const payload: { name?: string; repo_url?: string } = {};
    if (name !== undefined) payload.name = name;
    if (repoUrl !== undefined) payload.repo_url = repoUrl;

    const response = await axios.put(
      `${AUTH_SERVER_URL}/api/workspaces/${workspaceId}`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to update registered workspace:', error);
    throw error;
  }
};
