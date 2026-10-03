import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiRequestError } from '../../api/client';
import { WorkItem, WorkItemStatus, ApiResponse } from '../../types';

interface WorkItemStatusTransitionProps {
  workItem: WorkItem;
  onRefresh: () => void;
}

const ALLOWED_STATUS_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  [WorkItemStatus.OPEN]: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.BLOCKED,
    WorkItemStatus.CLOSED,
  ],
  [WorkItemStatus.IN_PROGRESS]: [
    WorkItemStatus.OPEN,
    WorkItemStatus.BLOCKED,
    WorkItemStatus.RESOLVED,
  ],
  [WorkItemStatus.BLOCKED]: [
    WorkItemStatus.OPEN,
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.CLOSED,
  ],
  [WorkItemStatus.RESOLVED]: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.CLOSED,
  ],
  [WorkItemStatus.CLOSED]: [
    WorkItemStatus.OPEN,
  ],
};

export default function WorkItemStatusTransition({
  workItem,
  onRefresh,
}: WorkItemStatusTransitionProps) {
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const queryClient = useQueryClient();

  const transitionMutation = useMutation({
    mutationFn: async (targetStatus: WorkItemStatus) => {
      const res = await apiClient.post<ApiResponse<WorkItem>>(
        `/work-items/${workItem.id}/transition`,
        {
          toStatus: targetStatus,
          version: workItem.version,
        }
      );
      return res.data;
    },
    onSuccess: () => {
      setIsConflict(false);
      setTransitionError(null);
      queryClient.invalidateQueries({ queryKey: ['work-item', workItem.id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-activity', workItem.id] });
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        if (err.status === 409 || err.code === 'STALE_WORK_ITEM' || err.code === 'CONFLICT') {
          setIsConflict(true);
          setTransitionError(
            'This work item was modified by another user. Your version is out of date. Please refresh the page.'
          );
        } else {
          setTransitionError(err.message || 'Status transition failed.');
        }
      } else {
        setTransitionError('An unexpected error occurred.');
      }
    },
  });

  const nextStatuses = ALLOWED_STATUS_TRANSITIONS[workItem.status] || [];

  const getStatusButtonClass = (status: WorkItemStatus) => {
    switch (status) {
      case WorkItemStatus.IN_PROGRESS:
        return 'bg-amber-500 hover:bg-amber-600 text-white';
      case WorkItemStatus.RESOLVED:
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
      case WorkItemStatus.BLOCKED:
        return 'bg-red-600 hover:bg-red-700 text-white';
      case WorkItemStatus.CLOSED:
        return 'bg-gray-700 hover:bg-gray-800 text-white';
      case WorkItemStatus.OPEN:
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">
          Workflow Transition
        </h4>
        <span className="text-xs text-gray-500 font-mono">
          State Machine Enforced (v{workItem.version})
        </span>
      </div>

      {transitionError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <span>{transitionError}</span>
          {isConflict && (
            <button
              type="button"
              onClick={() => {
                setIsConflict(false);
                setTransitionError(null);
                onRefresh();
              }}
              className="px-2.5 py-1 bg-red-600 text-white font-medium rounded text-xs hover:bg-red-700 whitespace-nowrap self-start sm:self-auto"
            >
              Refresh Data
            </button>
          )}
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2">Available status transitions:</p>
        <div className="flex flex-wrap gap-2">
          {nextStatuses.length > 0 ? (
            nextStatuses.map((target) => (
              <button
                key={target}
                type="button"
                disabled={transitionMutation.isPending}
                onClick={() => {
                  setTransitionError(null);
                  setIsConflict(false);
                  transitionMutation.mutate(target);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-colors focus:outline-none disabled:opacity-50 ${getStatusButtonClass(
                  target
                )}`}
              >
                {transitionMutation.isPending ? 'Transitioning...' : `Transition to ${target}`}
              </button>
            ))
          ) : (
            <span className="text-xs text-gray-400 italic">
              No further transitions available from current status.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
