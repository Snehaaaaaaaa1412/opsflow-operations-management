import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import DashboardPage from '../features/dashboard/DashboardPage';
import { apiClient } from '../api/client';
import { WorkItemStatus, WorkItemPriority, TeamRole } from '../types';

function renderDashboard(initialEntries = ['/dashboard']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockTeams = [
  { id: 'team-1', name: 'Core Infrastructure', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'team-2', name: 'Payment Operations', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const mockMembers = [
  {
    id: 'tm-1',
    userId: 'u-1',
    teamId: 'team-1',
    role: TeamRole.ADMIN,
    createdAt: '2026-01-01',
    user: { id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' },
  },
  {
    id: 'tm-2',
    userId: 'u-2',
    teamId: 'team-1',
    role: TeamRole.MEMBER,
    createdAt: '2026-01-01',
    user: { id: 'u-2', name: 'Bob Ops', email: 'bob@example.com' },
  },
];

const mockWorkItemsResult = {
  data: [
    {
      id: 'wi-101',
      title: 'Investigate DB Connection Spikes',
      description: 'Connection pool exhausted on replica 2',
      status: WorkItemStatus.OPEN,
      priority: WorkItemPriority.HIGH,
      teamId: 'team-1',
      createdById: 'u-1',
      assigneeId: 'u-2',
      version: 1,
      dueAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      assignee: { id: 'u-2', name: 'Bob Ops', email: 'bob@example.com' },
    },
    {
      id: 'wi-102',
      title: 'Renew TLS Certificate',
      description: 'Wildcard cert expires in 7 days',
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.URGENT,
      teamId: 'team-1',
      createdById: 'u-1',
      assigneeId: null,
      version: 2,
      dueAt: null,
      createdAt: '2026-10-02T10:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
      assignee: null,
    },
  ],
  meta: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  },
};

describe('DashboardPage Feature', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('opsflow_token', 'test-token');
    localStorage.setItem(
      'opsflow_user',
      JSON.stringify({ id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' })
    );
    vi.restoreAllMocks();
  });

  it('should render teams and work items table', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/teams') {
        return { data: mockTeams };
      }
      if (url.includes('/members')) {
        return { data: mockMembers };
      }
      if (url.includes('/work-items')) {
        return mockWorkItemsResult;
      }
      return { data: [] };
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Work Management Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Investigate DB Connection Spikes')).toBeInTheDocument();
      expect(screen.getByText('Renew TLS Certificate')).toBeInTheDocument();
      expect(screen.getByText('Bob Ops')).toBeInTheDocument();
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should update query when filters are changed', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/teams') return { data: mockTeams };
      if (url.includes('/members')) return { data: mockMembers };
      if (url.includes('/work-items')) return mockWorkItemsResult;
      return { data: [] };
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Investigate DB Connection Spikes')).toBeInTheDocument();
    });

    // Select status filter
    const statusSelect = screen.getByLabelText(/status/i);
    fireEvent.change(statusSelect, { target: { value: WorkItemStatus.OPEN } });

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        expect.stringContaining('status=OPEN')
      );
    });
  });

  it('should open create modal and create a new work item', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/teams') return { data: mockTeams };
      if (url.includes('/members')) return { data: mockMembers };
      if (url.includes('/work-items')) return mockWorkItemsResult;
      return { data: [] };
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        id: 'wi-103',
        title: 'New High Priority Incident',
        status: WorkItemStatus.OPEN,
        priority: WorkItemPriority.HIGH,
        teamId: 'team-1',
        version: 1,
      },
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ new work item/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ new work item/i }));

    expect(screen.getByText('Create Work Item')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'New High Priority Incident' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/teams/team-1/work-items',
        expect.objectContaining({
          title: 'New High Priority Incident',
        })
      );
      expect(screen.queryByText('Create Work Item')).not.toBeInTheDocument();
    });
  });
});
