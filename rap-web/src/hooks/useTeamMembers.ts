import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getTeamMembers, updateTeamMemberRole, inviteUserToTeam, removeTeamMember } from '@/api/workspaceApiClient';
import { Role, TeamMemberOut } from '@/context/authTypes';

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

    setLoading(true);
    setError(null);
    try {
      const data = await getTeamMembers(activeTeam.team_id, cloudToken);
      setMembers(data);
    } catch (err) {
      console.error("Failed to fetch team members:", err);
      setError("Failed to load team members.");
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
