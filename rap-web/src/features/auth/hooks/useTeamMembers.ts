import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { getTeamMembers, updateTeamMemberRole, inviteUserToTeam, removeTeamMember } from '@/features/team-sources/services/teamSourceApiClient';
import { Role, TeamMemberOut } from '../types/authTypes';

export const useTeamMembers = () => {
  const { activeTeam, cloudToken, activeRole } = useAuth();
  const [members, setMembers] = useState<TeamMemberOut[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!activeTeam || !cloudToken || activeRole !== Role.Admin) {
      setMembers([]);
      setLoading(false);
      return;
    }

    // LOCAL MODE BYPASS
    if (activeTeam.team_id === 0) {
      setMembers([{ id: 0, name: "Local User", email: "local@paracore.app", role: Role.Admin }]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Retry once for Railway cold-start (server wakes from sleep)
      let data: TeamMemberOut[];
      try {
        data = await getTeamMembers(activeTeam.team_id, cloudToken);
      } catch (firstErr: any) {
        if (firstErr?.response?.status === 503 || firstErr?.code === 'ECONNABORTED' || !firstErr?.response) {
          // Cold start — wait 3s and retry
          await new Promise(resolve => setTimeout(resolve, 3000));
          data = await getTeamMembers(activeTeam.team_id, cloudToken);
        } else {
          throw firstErr;
        }
      }
      setMembers(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || String(err);
      console.error("Failed to fetch team members:", { status, detail, err });
      if (status === 401) {
        setError("Session expired. Please sign out and sign in again.");
      } else if (status === 403) {
        setError("You no longer have admin access to this team.");
      } else if (status === 404) {
        setError("Team not found. It may have been deleted or the server database was reset.");
      } else {
        setError(`Failed to load team members (${status || 'network error'}). ${detail}`);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTeam, cloudToken, activeRole]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const refetchMembers = useCallback(() => {
    fetchMembers();
  }, [fetchMembers]);

  const updateMemberRole = useCallback(async (userId: number, newRole: Role) => {
    if (!activeTeam || !cloudToken) {
      setError("Not authenticated or no active team.");
      return;
    }
    try {
      const updatedMember = await updateTeamMemberRole(activeTeam.team_id, userId, newRole, cloudToken);
      setMembers(prevMembers =>
        prevMembers.map(member => (member.id === updatedMember.id ? updatedMember : member))
      );
      return updatedMember;
    } catch (err) {
      console.error("Failed to update member role:", err);
      setError("Failed to update member role.");
      throw err; // Re-throw to allow UI to handle
    }
  }, [activeTeam, cloudToken]);

  const inviteMember = useCallback(async (email: string, role: Role) => {
    if (!activeTeam || !cloudToken) {
      setError("Not authenticated or no active team.");
      return;
    }
    try {
      const newMember = await inviteUserToTeam(activeTeam.team_id, email, role, cloudToken);
      setMembers(prevMembers => [...prevMembers, newMember]);
      return newMember;
    } catch (err) {
      console.error("Failed to invite member:", err);
      setError("Failed to invite member.");
      throw err; // Re-throw to allow UI to handle
    }
  }, [activeTeam, cloudToken]);

  const removeMember = useCallback(async (userId: number) => {
    if (!activeTeam || !cloudToken) {
      setError("Not authenticated or no active team.");
      return;
    }
    try {
      await removeTeamMember(activeTeam.team_id, userId, cloudToken);
      setMembers(prevMembers => prevMembers.filter(member => member.id !== userId));
    } catch (err) {
      console.error("Failed to remove member:", err);
      setError("Failed to remove member.");
      throw err;
    }
  }, [activeTeam, cloudToken]);

  return { members, loading, error, refetchMembers, updateMemberRole, inviteMember, removeMember };
};
