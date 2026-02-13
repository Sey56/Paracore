import axios from 'axios';
import { TeamScriptSource } from '@/types';

const AUTH_SERVER_URL = 'https://rap-auth-server-production.up.railway.app';

/**
 * Registers a new script source for a team on the cloud auth server.
 * @param teamId The ID of the team.
 * @param name The name for the new script source.
 * @param repoUrl The Git repository URL for the script source.
 * @param token The user's cloud authentication token.
 * @returns The newly created script source.
 */
export const registerRemoteSource = async (
  teamId: number,
  name: string,
  repoUrl: string,
  token: string
): Promise<TeamScriptSource> => {
  try {
    const response = await axios.post(
      `${AUTH_SERVER_URL}/api/teams/${teamId}/team-sources`,
      { name, repo_url: repoUrl },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to register script source:', error);
    throw error;
  }
};

/**
 * Fetches all registered script sources for a given team from the cloud auth server.
 * @param teamId The ID of the team.
 * @param token The user's cloud authentication token.
 * @returns A list of script sources.
 */
export const getRemoteSources = async (
  teamId: number,
  token: string
): Promise<TeamScriptSource[]> => {
  try {
    const response = await axios.get(
      `${AUTH_SERVER_URL}/api/teams/${teamId}/team-sources`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch team script sources:', error);
    throw error;
  }
};

/**
 * Deletes a registered script source from the cloud auth server.
 * @param sourceId The ID of the script source to delete.
 * @param token The user's cloud authentication token.
 */
export const deleteRemoteSource = async (
  sourceId: number,
  token: string
): Promise<void> => {
  await axios.delete(`${AUTH_SERVER_URL}/api/team-sources/${sourceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Updates an existing registered script source on the cloud auth server.
 * @param sourceId The ID of the script source to update.
 * @param name The new name for the script source (optional).
 * @param repoUrl The new Git repository URL for the script source (optional).
 * @param token The user's cloud authentication token.
 * @returns The updated script source.
 */
export const updateRemoteSource = async (
  sourceId: number,
  name: string | undefined,
  repoUrl: string | undefined,
  token: string
): Promise<TeamScriptSource> => {
  try {
    const payload: { name?: string; repo_url?: string } = {};
    if (name !== undefined) payload.name = name;
    if (repoUrl !== undefined) payload.repo_url = repoUrl;

    const response = await axios.put(
      `${AUTH_SERVER_URL}/api/team-sources/${sourceId}`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to update registered script source:', error);
    throw error;
  }
};
