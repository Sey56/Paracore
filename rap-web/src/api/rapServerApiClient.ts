import axios from 'axios';

/**
 * Calls the local RAP server to pull changes for multiple script sources.
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
