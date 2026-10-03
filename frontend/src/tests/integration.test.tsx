import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from '../routes';
import { AuthProvider } from '../context/AuthContext';
import { apiClient, ApiRequestError } from '../api/client';
import { WorkItemStatus, WorkItemPriority, TeamRole } from '../types';

function renderApp(initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockTeams = [
  { id: 'team-ops', name: 'Cloud Operations', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const mockMembers = [
  {
    id: 'tm-1',
    userId: 'u-1',
    teamId: 'team-ops',
    role: TeamRole.ADMIN,
    createdAt: '2026-01-01',
    user: { id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' },
  },
];

const mockItem = {
  id: 'wi-int-1',
  title: 'Critical Outage: Redis Cluster Unreachable',
  description: 'Sentinel failing to elect new master node.',
  status: WorkItemStatus.OPEN,
  priority: WorkItemPriority.URGENT,
  teamId: 'team-ops',
  createdById: 'u-1',
  assigneeId: null,
  version: 1,
  dueAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: { id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' },
  assignee: null,
};

describe('Phase 11: Frontend Integration & Correctness Flows (Scenario I)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('Flow 1: Login -> Dashboard -> Team View -> Work Item List Flow', async () => {
    // Mock login endpoint
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        token: 'auth-jwt-token-123',
        user: { id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' },
      },
    });

    // Mock dashboard queries
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/teams') return { data: mockTeams };
      if (url.includes('/members')) return { data: mockMembers };
      if (url.includes('/work-items')) {
        return {
          data: [mockItem],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        };
      }
      return { data: [] };
    });

    renderApp(['/login']);

    // 1. Fill login form and submit
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'alice@opsflow.io' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // 2. Verified dashboard loaded with team queue
    await waitFor(() => {
      expect(screen.getByText('Work Management Dashboard')).toBeInTheDocument();
      expect(
        screen.getByText('Critical Outage: Redis Cluster Unreachable')
      ).toBeInTheDocument();
      expect(screen.getByText('Alice Engineer')).toBeInTheDocument();
    });
  });

  it('Flow 2: Status Transition, Concurrency Conflict Handling, and Recovery', async () => {
    localStorage.setItem('opsflow_token', 'test-jwt');
    localStorage.setItem(
      'opsflow_user',
      JSON.stringify({ id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' })
    );

    let currentItem = { ...mockItem };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === `/work-items/${mockItem.id}`) return { data: currentItem };
      if (url.includes('/comments')) return { data: [] };
      if (url.includes('/activity')) return { data: [] };
      if (url.includes('/members')) return { data: mockMembers };
      return { data: null };
    });

    // First transition fails with 409 conflict
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(
      new ApiRequestError(409, {
        code: 'STALE_WORK_ITEM',
        message: 'The work item has been modified since it was last read.',
      })
    );

    renderApp([`/work-items/${mockItem.id}`]);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /transition to IN_PROGRESS/i })
      ).toBeInTheDocument();
    });

    // Click transition button
    fireEvent.click(
      screen.getByRole('button', { name: /transition to IN_PROGRESS/i })
    );

    // 409 Conflict banner shown with Refresh button
    await waitFor(() => {
      expect(
        screen.getByText(/modified by another user.*out of date/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh data/i })).toBeInTheDocument();
    });

    // Simulate item being updated by another client (version increments to 2)
    currentItem = { ...mockItem, version: 2, status: WorkItemStatus.IN_PROGRESS };

    // Click Refresh button
    fireEvent.click(screen.getByRole('button', { name: /refresh data/i }));

    // Reloads latest state
    await waitFor(() => {
      expect(screen.getByText('Version 2')).toBeInTheDocument();
      expect(screen.queryByText(/modified by another user/i)).not.toBeInTheDocument();
    });
  });

  it('Flow 3: Collaboration & Comment Lifecycle on Work Item Detail', async () => {
    localStorage.setItem('opsflow_token', 'test-jwt');
    localStorage.setItem(
      'opsflow_user',
      JSON.stringify({ id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' })
    );

    let comments = [
      {
        id: 'comm-10',
        workItemId: mockItem.id,
        authorId: 'u-1',
        body: 'Failover initiated on backup cluster.',
        createdAt: '2026-10-01T10:15:00.000Z',
        updatedAt: '2026-10-01T10:15:00.000Z',
        author: { id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' },
      },
    ];

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === `/work-items/${mockItem.id}`) return { data: mockItem };
      if (url.includes('/comments')) return { data: comments };
      if (url.includes('/activity')) return { data: [] };
      if (url.includes('/members')) return { data: mockMembers };
      return { data: null };
    });

    const deleteSpy = vi.spyOn(apiClient, 'delete').mockImplementation(async () => {
      comments = [];
      return {} as any;
    });

    renderApp([`/work-items/${mockItem.id}`]);

    await waitFor(() => {
      expect(
        screen.getByText('Failover initiated on backup cluster.')
      ).toBeInTheDocument();
    });

    // Click Delete on the comment
    const deleteButton = screen.getByTitle('Delete comment');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(
        `/work-items/${mockItem.id}/comments/comm-10`
      );
    });
  });

  it('Flow 4: Logout Clears Protected Session and Redirects to Login', async () => {
    localStorage.setItem('opsflow_token', 'test-jwt');
    localStorage.setItem(
      'opsflow_user',
      JSON.stringify({ id: 'u-1', name: 'Alice Engineer', email: 'alice@opsflow.io' })
    );

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/teams') return { data: mockTeams };
      if (url.includes('/members')) return { data: mockMembers };
      if (url.includes('/work-items')) {
        return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
      }
      return { data: [] };
    });

    renderApp(['/dashboard']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    });

    // Click Logout
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    // Verifies token cleared and redirected to login page
    await waitFor(() => {
      expect(localStorage.getItem('opsflow_token')).toBeNull();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
