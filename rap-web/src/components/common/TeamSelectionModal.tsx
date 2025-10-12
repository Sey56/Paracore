import React, { useState } from 'react';
import { TeamMembership } from '@/context/authTypes';

interface TeamSelectionModalProps {
  isOpen: boolean;
  memberships: TeamMembership[];
  onSelectTeam: (team: TeamMembership) => void;
  onCancel: () => void;
}

export const TeamSelectionModal: React.FC<TeamSelectionModalProps> = ({
  isOpen,
  memberships,
  onSelectTeam,
  onCancel,
}) => {
  const [selectedTeamState, setSelectedTeamState] = useState<TeamMembership | null>(null);
  if (!isOpen) return null;

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedTeamId = parseInt(e.target.value);
    const team = memberships.find(m => m.team_id === selectedTeamId);
    setSelectedTeamState(team || null);
  };

  const handleConfirm = () => {
    if (selectedTeamState) {
      onSelectTeam(selectedTeamState);
    }
  };

  const handleCancel = () => {
    setSelectedTeamState(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Select Your Team</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          You are a member of multiple teams. Please select the team you wish to work with for this session.
        </p>
        <div className="mb-4">
          <label htmlFor="team-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Choose a team:
          </label>
          <select
            id="team-select"
            onChange={handleSelect}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={selectedTeamState?.team_id || ''}
          >
            <option value="" disabled>Select a team...</option>
            {memberships.map((membership) => (
              <option key={membership.team_id} value={membership.team_id}>
                {membership.team_name} ({membership.role})
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedTeamState}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          You can change your active team by logging out and selecting a different team upon re-login.
        </div>
      </div>
    </div>
  );
};
