import React, { useState } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '../common/Modal';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Role } from '@/context/authTypes';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faUserPlus, faTrash } from '@fortawesome/free-solid-svg-icons';

const TeamManagementModal: React.FC = () => {
  const { isTeamManagementModalOpen, closeTeamManagementModal } = useUI();
  const { activeTeam, activeRole, user: currentUser } = useAuth();
  const { members, loading, error, updateMemberRole, inviteMember, removeMember } = useTeamMembers();

  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<Role>(Role.User);
  const [inviteLoading, setInviteLoading] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const isAdmin = activeRole === Role.Admin;

  const handleRoleChange = async (memberId: number, newRole: Role) => {
    if (!isAdmin) return; // Should be disabled by UI, but good to have a safeguard
    try {
      await updateMemberRole(memberId, newRole);
    } catch (err: any) {
      // Error handling is done in the hook, but we can add specific UI feedback here if needed
      console.error("Failed to update role in UI:", err);
    }
  };

  const handleRemoveMember = async (memberId: number, memberName: string) => {
    if (!isAdmin) return;
    if (window.confirm(`Are you sure you want to remove ${memberName} from the team?`)) {
      try {
        await removeMember(memberId);
      } catch (err: any) {
        console.error("Failed to remove member in UI:", err);
      }
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !activeTeam || !inviteEmail || !inviteRole) return;

    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      await inviteMember(inviteEmail, inviteRole);
      setInviteSuccess(`Invitation sent to ${inviteEmail} as ${inviteRole}.`);
      setInviteEmail(''); // Clear form
      setInviteRole(Role.User); // Reset role
    } catch (err: any) {
      setInviteError(err.response?.data?.detail || "Failed to send invitation.");
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isTeamManagementModalOpen} 
      onClose={closeTeamManagementModal} 
      title={`Team Management for ${activeTeam?.team_name || ''}`}
      size="2xl"
    >
      <div className="p-6 space-y-6">
        {!activeTeam && <p className="text-red-500">No active team selected.</p>}
        {loading && <div className="text-center text-gray-500"><FontAwesomeIcon icon={faSpinner} spin /> Loading members...</div>}
        {error && <p className="text-red-500">Error: {error}</p>}

        {activeTeam && !loading && !error && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Team Members</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                    <th scope="col" className="relative px-6 py-3"><span className="sr-only">Edit</span></th>
                    <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{member.name || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{member.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                          disabled={!isAdmin || member.id === Number(currentUser?.id) || member.id === activeTeam.owner_id} // Cannot change own role or owner's role
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        >
                          {Object.values(Role).map(roleOption => (
                            <option key={roleOption} value={roleOption}>{roleOption}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {member.id === Number(currentUser?.id) && <span className="text-gray-400 dark:text-gray-500"> (You)</span>}
                        {member.id === activeTeam.owner_id && <span className="text-blue-500 dark:text-blue-400"> (Owner)</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {isAdmin && member.id !== Number(currentUser?.id) && member.id !== activeTeam.owner_id && (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.name || member.email)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 ml-4"
                            title="Remove Member"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-8">Invite New Member</h3>
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              {inviteSuccess && <p className="text-green-500">{inviteSuccess}</p>}
              {inviteError && <p className="text-red-500">{inviteError}</p>}
              <div className="flex items-end space-x-4">
                <div className="flex-1">
                  <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Email</label>
                  <input
                    type="email"
                    id="inviteEmail"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    disabled={!isAdmin || inviteLoading}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label htmlFor="inviteRole" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Role</label>
                  <select
                    id="inviteRole"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    disabled={!isAdmin || inviteLoading}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    {Object.values(Role).map(roleOption => (
                      <option key={roleOption} value={roleOption}>{roleOption}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!isAdmin || inviteLoading}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviteLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faUserPlus} />} Invite
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TeamManagementModal;