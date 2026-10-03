import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiRequestError } from '../../api/client';
import { Team, ApiResponse } from '../../types';

interface TeamSelectorProps {
  teams: Team[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
}

export default function TeamSelector({
  teams,
  selectedTeamId,
  onSelectTeam,
}: TeamSelectorProps) {
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<ApiResponse<Team>>('/teams', { name });
      return res.data;
    },
    onSuccess: (newTeam) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      onSelectTeam(newTeam.id);
      setNewTeamName('');
      setIsCreatingTeam(false);
      setCreateError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        setCreateError(err.message || 'Failed to create team');
      } else {
        setCreateError('An unexpected error occurred.');
      }
    },
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeamName.trim();
    if (!trimmed) {
      setCreateError('Team name is required');
      return;
    }
    createTeamMutation.mutate(trimmed);
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center space-x-3 flex-1">
        <label htmlFor="team-select" className="text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
          Active Team:
        </label>
        {teams.length > 0 ? (
          <select
            id="team-select"
            value={selectedTeamId || ''}
            onChange={(e) => onSelectTeam(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-w-xs"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-gray-500 italic">No teams joined yet</span>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {!isCreatingTeam ? (
          <button
            type="button"
            onClick={() => setIsCreatingTeam(true)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors"
          >
            + Create New Team
          </button>
        ) : (
          <form onSubmit={handleCreateTeam} className="flex items-center space-x-2">
            <input
              type="text"
              required
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name..."
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="submit"
              disabled={createTeamMutation.isPending}
              className="px-2.5 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {createTeamMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingTeam(false);
                setNewTeamName('');
                setCreateError(null);
              }}
              className="px-2.5 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {createError && (
        <div className="text-xs text-red-600 w-full sm:w-auto">
          {createError}
        </div>
      )}
    </div>
  );
}
