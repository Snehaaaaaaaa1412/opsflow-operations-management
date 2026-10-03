import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { Team, TeamMember, WorkItem, ApiResponse, PaginatedResult } from '../../types';
import TeamSelector from './TeamSelector';
import WorkItemFilters, { FilterState } from './WorkItemFilters';
import WorkItemList from './WorkItemList';
import CreateWorkItemModal from './CreateWorkItemModal';
import LoadingSpinner from '../../components/LoadingSpinner';

const initialFilters: FilterState = {
  search: '',
  status: '',
  priority: '',
  assigneeId: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  limit: 20,
};

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const teamIdParam = searchParams.get('teamId');

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamIdParam);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 1. Fetch user's teams
  const {
    data: teamsResponse,
    isLoading: isTeamsLoading,
    error: teamsError,
  } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiClient.get<ApiResponse<Team[]>>('/teams'),
  });

  const teams = teamsResponse?.data || [];

  // Synchronize selected team
  useEffect(() => {
    if (teams.length > 0) {
      if (!selectedTeamId || !teams.some((t) => t.id === selectedTeamId)) {
        const defaultTeamId = teams[0]!.id;
        setSelectedTeamId(defaultTeamId);
        setSearchParams({ teamId: defaultTeamId });
      }
    }
  }, [teams, selectedTeamId, setSearchParams]);

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setSearchParams({ teamId });
    setFilters(initialFilters);
  };

  // 2. Fetch team members
  const { data: membersResponse } = useQuery({
    queryKey: ['team-members', selectedTeamId],
    queryFn: () =>
      apiClient.get<ApiResponse<TeamMember[]>>(`/teams/${selectedTeamId}/members`),
    enabled: !!selectedTeamId,
  });

  const members = membersResponse?.data || [];

  // 3. Fetch paginated work items with server-side filters
  const {
    data: workItemsResponse,
    isLoading: isWorkItemsLoading,
    error: workItemsError,
  } = useQuery({
    queryKey: ['work-items', selectedTeamId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const queryStr = params.toString();
      const url = `/teams/${selectedTeamId}/work-items${
        queryStr ? `?${queryStr}` : ''
      }`;
      return apiClient.get<PaginatedResult<WorkItem>>(url);
    },
    enabled: !!selectedTeamId,
  });

  const workItems = workItemsResponse?.data || [];
  const meta = workItemsResponse?.meta;

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
    }));
  };

  const handleResetFilters = () => {
    setFilters(initialFilters);
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  if (isTeamsLoading) {
    return <LoadingSpinner label="Loading your teams..." className="py-20" />;
  }

  if (teamsError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl">
        <h3 className="font-semibold text-base mb-1">Failed to load teams</h3>
        <p className="text-sm">
          {(teamsError as Error)?.message || 'An error occurred loading your teams.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar: Title & New Item Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Work Management Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor, prioritize, and manage operational work across teams.
          </p>
        </div>

        {selectedTeamId && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none transition-colors"
          >
            + New Work Item
          </button>
        )}
      </div>

      {/* Team Selector */}
      <TeamSelector
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={handleSelectTeam}
      />

      {/* Main Content Area */}
      {selectedTeamId ? (
        <>
          {/* Filters & Search */}
          <WorkItemFilters
            filters={filters}
            members={members}
            onFilterChange={handleFilterChange}
            onReset={handleResetFilters}
          />

          {/* Error Message if Work Items failed */}
          {workItemsError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              Error fetching work items: {(workItemsError as Error)?.message}
            </div>
          )}

          {/* Work Items Table */}
          <WorkItemList
            items={workItems}
            meta={meta}
            isLoading={isWorkItemsLoading}
            onPageChange={handlePageChange}
            onCreateClick={() => setIsCreateModalOpen(true)}
          />

          {/* Create Modal */}
          <CreateWorkItemModal
            teamId={selectedTeamId}
            isOpen={isCreateModalOpen}
            members={members}
            onClose={() => setIsCreateModalOpen(false)}
          />
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            No Team Selected
          </h3>
          <p className="text-xs text-gray-500">
            Create or join a team above to view operational work items.
          </p>
        </div>
      )}
    </div>
  );
}
