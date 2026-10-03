import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import WorkItemDetailPage from '../features/workItems/WorkItemDetailPage';
import { apiClient, ApiRequestError } from '../api/client';
import { WorkItemStatus, WorkItemPriority } from '../types';

function renderDetail(id = 'wi-101') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/work-items/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/work-items/:id" element={<WorkItemDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockItem = {
  id: 'wi-101',
  title: 'Investigate DB Connection Pool Spike',
  description: 'Detailed analysis of connection pool starvation.',
  status: WorkItemStatus.OPEN,
  priority: WorkItemPriority.HIGH,
  teamId: 'team-1',
  createdById: 'u-1',
  assigneeId: 'u-2',
  version: 3,
  dueAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  createdBy: { id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' },
  assignee: { id: 'u-2', name: 'Bob Ops', email: 'bob@example.com' },
};

const mockComments = [
  {
    id: 'comm-1',
    workItemId: 'wi-101',
    authorId: 'u-1',
    body: 'Initial triage complete. Handing over to Bob.',
    createdAt: '2026-10-01T11:00:00.000Z',
    updatedAt: '2026-10-01T11:00:00.000Z',
    author: { id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' },
  },
];

const mockActivities = [
  {
    id: 'act-1',
    workItemId: 'wi-101',
    actorId: 'u-1',
    action: 'WORK_ITEM_CREATED',
    metadata: { title: mockItem.title, priority: 'HIGH', status: 'OPEN' },
    createdAt: '2026-10-01T10:00:00.000Z',
    actor: { id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' },
  },
];

describe('WorkItemDetailPage Feature', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('opsflow_token', 'test-token');
    localStorage.setItem(
      'opsflow_user',
      JSON.stringify({ id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' })
    );
    vi.restoreAllMocks();
  });

  it('should render work item details, comments, and audit trail', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/work-items/wi-101') return { data: mockItem };
      if (url.includes('/comments')) return { data: mockComments };
      if (url.includes('/activity')) return { data: mockActivities };
      if (url.includes('/members')) return { data: [] };
      return { data: null };
    });

    renderDetail();

    await waitFor(() => {
      expect(
        screen.getByText('Investigate DB Connection Pool Spike')
      ).toBeInTheDocument();
      expect(screen.getByText('Version 3')).toBeInTheDocument();
      expect(screen.getByText('Bob Ops')).toBeInTheDocument();
      expect(screen.getAllByText('Alice Lead').length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText('Initial triage complete. Handing over to Bob.')
      ).toBeInTheDocument();
      expect(screen.getByText('Activity & Audit Trail')).toBeInTheDocument();
    });
  });

  it('should trigger status transition and handle concurrency conflict (409)', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/work-items/wi-101') return { data: mockItem };
      if (url.includes('/comments')) return { data: mockComments };
      if (url.includes('/activity')) return { data: mockActivities };
      if (url.includes('/members')) return { data: [] };
      return { data: null };
    });

    // Simulate concurrency conflict 409
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(
      new ApiRequestError(409, {
        code: 'STALE_WORK_ITEM',
        message: 'The work item has been modified since it was last read.',
      })
    );

    renderDetail();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /transition to IN_PROGRESS/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /transition to IN_PROGRESS/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/modified by another user.*out of date/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh data/i })).toBeInTheDocument();
    });
  });

  it('should post a new comment on the work item', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/work-items/wi-101') return { data: mockItem };
      if (url.includes('/comments')) return { data: mockComments };
      if (url.includes('/activity')) return { data: mockActivities };
      if (url.includes('/members')) return { data: [] };
      return { data: null };
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        id: 'comm-2',
        workItemId: 'wi-101',
        authorId: 'u-1',
        body: 'Investigating replica node metrics now.',
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        author: { id: 'u-1', name: 'Alice Lead', email: 'alice@example.com' },
      },
    });

    renderDetail();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/write an operational note/i)
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/write an operational note/i), {
      target: { value: 'Investigating replica node metrics now.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/work-items/wi-101/comments', {
        content: 'Investigating replica node metrics now.',
      });
    });
  });
});
