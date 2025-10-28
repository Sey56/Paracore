import axios from 'axios';

export const pullTeamWorkspaces = async (
  rapServerUrl: string,
  workspacePaths: string[],
  token: string, // cloudToken is passed for authentication with rap-server
  branch?: string
): Promise<{ message: string; results: { path: string; status: string; message: string }[] }> => {
  const response = await axios.post(
    `${rapServerUrl}/api/workspaces/pull_team_workspaces`,
    { workspace_paths: workspacePaths, branch: branch },
    {
      headers: {
        Authorization: `Bearer ${token}`, // Use cloudToken for authorization
      },
    }
  );
  return response.data;
};