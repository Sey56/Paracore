import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Modal } from '../common/Modal';
import { Role, TeamMemberOut } from '@/context/authTypes';
import { toast } from 'react-toastify';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, message, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmation" size="sm">
      <div className="p-4">
        <p className="text-gray-700 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const TeamManagementModal: React.FC = () => {
  const { isTeamManagementModalOpen, closeTeamManagementModal } = useUI();
  const { user, activeTeam, activeRole } = useAuth();
  const { members: teamMembers, inviteMember, updateMemberRole, removeMember, loading, error } = useTeamMembers();

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<Role>(Role.User);
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Map<number, Role>>(new Map());

  // Confirmation Modal State
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmButtonText, setConfirmButtonText] = useState('Confirm');

  const teamId = activeTeam?.team_id;

  const handleOpenConfirm = useCallback((message: string, action: () => void, confirmText?: string) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmButtonText(confirmText || 'Confirm');
    setShowConfirm(true);
  }, []);

  const handleCloseConfirm = useCallback(() => {
    setShowConfirm(false);
    setConfirmAction(null);
    setConfirmMessage('');
    setConfirmButtonText('Confirm');
  }, []);

  const handleConfirm = useCallback(() => {
    if (confirmAction) {
      confirmAction();
    }
    handleCloseConfirm();
  }, [confirmAction, handleCloseConfirm]);

  const handleInviteMember = useCallback(async () => {
    if (!teamId || !newMemberEmail || !newMemberRole) return;

    handleOpenConfirm(
      `Are you sure you want to invite ${newMemberEmail} as a ${newMemberRole}?`,
      async () => {
        try {
          await inviteMember(newMemberEmail, newMemberRole);
          toast.success(`Invitation sent to ${newMemberEmail}`);
          setNewMemberEmail('');
          setNewMemberRole(Role.User);
        } catch (err) {
          toast.error(`Failed to send invitation: ${error || 'Unknown error'}`);
        }
      },
      'Invite'
    );
  }, [teamId, newMemberEmail, newMemberRole, inviteMember, error, handleOpenConfirm]);

  const handleRoleChange = useCallback((memberId: number, newRole: Role) => {
    setPendingRoleChanges(prev => {
      const newMap = new Map(prev);
      newMap.set(memberId, newRole);
      return newMap;
    });
  }, []);

  const handleUpdateRole = useCallback(async (member: TeamMemberOut) => {
    if (!teamId) return;
    const newRole = pendingRoleChanges.get(member.id);
    if (!newRole) return;

    handleOpenConfirm(
      `Are you sure you want to change ${member.email}'s role to ${newRole}?`,
      async () => {
        try {
          await updateMemberRole(member.id, newRole);
          toast.success(`Role for ${member.email} updated to ${newRole}`);
          setPendingRoleChanges(prev => {
            const newMap = new Map(prev);
            newMap.delete(member.id);
            return newMap;
          });
        } catch (err) {
          toast.error(`Failed to update role: ${error || 'Unknown error'}`);
        }
      },
      'Set Role'
    );
  }, [teamId, pendingRoleChanges, updateMemberRole, error, handleOpenConfirm]);

  const handleRemoveMember = useCallback(async (member: TeamMemberOut) => {
    if (!teamId) return;

    handleOpenConfirm(
      `Are you sure you want to remove ${member.email} from the team? This action cannot be undone.`,
      async () => {
        try {
          await removeMember(member.id);
          toast.success(`${member.email} removed from the team.`);
        } catch (err) {
          toast.error(`Failed to remove member: ${error || 'Unknown error'}`);
        }
      },
      'Remove'
    );
  }, [teamId, removeMember, error, handleOpenConfirm]);

  if (!user || !activeTeam || activeRole === null) {
    return null; // Or a loading spinner
  }

  const isAdmin = activeRole === Role.Admin;

  return (
    <Modal isOpen={isTeamManagementModalOpen} onClose={closeTeamManagementModal} title={`Manage Team: ${activeTeam.team_name}`} size="2xl">
      <div className="p-6 space-y-8">
        {/* Invite New Member Section */}
        {isAdmin && (
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-inner">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Invite New Member</h3>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <input
                type="email"
                placeholder="Member Email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="flex-grow px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as Role)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {Object.values(Role).map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <button
                onClick={handleInviteMember}
                disabled={!newMemberEmail || loading}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </div>
        )}

        {/* Team Members Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Team Members</h3>
          {loading && <p className="text-gray-600 dark:text-gray-400">Loading members...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}
          {!loading && teamMembers.length === 0 && (
            <p className="text-gray-600 dark:text-gray-400">No members in this team yet.</p>
          )}
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {teamMembers.map((member: TeamMemberOut) => (
              <li key={member.id} className="py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{member.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{member.id.toString() === user?.id ? 'You' : member.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={pendingRoleChanges.has(member.id) ? pendingRoleChanges.get(member.id) : member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                    disabled={!isAdmin || member.id.toString() === user?.id} // Disable for self and non-admins
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    {Object.values(Role).map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  {pendingRoleChanges.has(member.id) && pendingRoleChanges.get(member.id) !== member.role && (
                    <button
                      onClick={() => handleUpdateRole(member)}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white font-medium rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {loading ? 'Setting...' : 'Set'}
                    </button>
                  )}
                  {isAdmin && member.id.toString() !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(member)}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 text-white font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {loading ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirm}
        onClose={handleCloseConfirm}
        onConfirm={handleConfirm}
        message={confirmMessage}
        confirmText={confirmButtonText}
      />
    </Modal>
  );
};

export default TeamManagementModal;