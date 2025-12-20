import axios from 'axios';
import { TeamMemberOut, Role } from '@/context/authTypes';

const AUTH_SERVER_URL = 'https://rap-auth-server-production.up.railway.app'; // Replace with your actual auth server URL

export const getTeamMembers = async (teamId: number, token: string): Promise<TeamMemberOut[]> => {
  const response = await axios.get<TeamMemberOut[]>(`${AUTH_SERVER_URL}/api/teams/${teamId}/members`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const updateTeamMemberRole = async (
  teamId: number,
  userId: number,
  newRole: Role,
  token: string
): Promise<TeamMemberOut> => {
  const response = await axios.put<TeamMemberOut>(
    `${AUTH_SERVER_URL}/api/teams/${teamId}/members/${userId}`,
    { role: newRole },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const inviteUserToTeam = async (
  teamId: number,
  email: string,
  role: Role,
  token: string
): Promise<TeamMemberOut> => {
  const response = await axios.post<TeamMemberOut>(
    `${AUTH_SERVER_URL}/api/teams/${teamId}/invitations`,
    { email, role },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const pullTeamWorkspaces = async (
  workspacePaths: string[],
  token: string
): Promise<{ message: string; results: { path: string; status: string; message: string }[] }> => {
  const response = await axios.post(
    `${AUTH_SERVER_URL}/api/workspaces/pull_team_workspaces`,
    { workspace_paths: workspacePaths },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const removeTeamMember = async (
  teamId: number,
  userId: number,
  token: string
): Promise<{ message: string }> => {
  const response = await axios.delete<{ message: string }>(
    `${AUTH_SERVER_URL}/api/teams/${teamId}/members/${userId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};
