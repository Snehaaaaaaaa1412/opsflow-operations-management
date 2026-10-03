import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Activity, ApiResponse } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';

interface ActivityTimelineProps {
  workItemId: string;
}

export default function ActivityTimeline({ workItemId }: ActivityTimelineProps) {
  const {
    data: activitiesResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['work-item-activity', workItemId],
    queryFn: () =>
      apiClient.get<ApiResponse<Activity[]>>(`/work-items/${workItemId}/activity`),
  });

  const activities = activitiesResponse?.data || [];

  const formatActionTitle = (activity: Activity) => {
    switch (activity.action) {
      case 'WORK_ITEM_CREATED':
        return 'created this work item';
      case 'WORK_ITEM_UPDATED':
        return 'updated work item properties';
      case 'STATUS_CHANGED':
        return 'transitioned the status';
      case 'ASSIGNEE_CHANGED':
        return 'updated the assignee';
      case 'COMMENT_ADDED':
        return 'posted a comment';
      case 'COMMENT_DELETED':
        return 'deleted a comment';
      case 'WORK_ITEM_DELETED':
        return 'deleted the work item';
      default:
        return activity.action;
    }
  };

  const renderDetails = (activity: Activity) => {
    const meta = activity.metadata;
    if (!meta) return null;

    if (activity.action === 'STATUS_CHANGED') {
      return (
        <div className="mt-1 text-xs text-gray-600 font-mono">
          <span className="font-semibold">{meta.from}</span> &rarr;{' '}
          <span className="font-semibold text-primary-600">{meta.to}</span>
        </div>
      );
    }

    if (activity.action === 'ASSIGNEE_CHANGED') {
      return (
        <div className="mt-1 text-xs text-gray-600">
          Reassigned from{' '}
          <span className="font-medium text-gray-800">{meta.from || 'Unassigned'}</span> to{' '}
          <span className="font-medium text-primary-600">{meta.to || 'Unassigned'}</span>
        </div>
      );
    }

    if (activity.action === 'WORK_ITEM_UPDATED' && meta.changes) {
      const keys = Object.keys(meta.changes);
      return (
        <div className="mt-1 text-xs text-gray-600 space-y-0.5">
          {keys.map((k) => (
            <div key={k}>
              <span className="capitalize font-medium">{k}</span> changed from{' '}
              <span className="line-through text-gray-400">
                {String(meta.changes[k]?.from ?? 'none')}
              </span>{' '}
              to <span className="font-medium text-gray-800">{String(meta.changes[k]?.to ?? 'none')}</span>
            </div>
          ))}
        </div>
      );
    }

    if (activity.action === 'WORK_ITEM_CREATED') {
      return (
        <div className="mt-1 text-xs text-gray-500">
          Initial status: <span className="font-medium">{meta.status || 'OPEN'}</span>, Priority:{' '}
          <span className="font-medium">{meta.priority || 'MEDIUM'}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="text-base font-semibold text-gray-900">
          Activity & Audit Trail
        </h3>
        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">
          {activities.length} records
        </span>
      </div>

      {isLoading && <LoadingSpinner size="sm" label="Loading audit history..." />}

      {error && (
        <p className="text-xs text-red-500">
          Failed to load audit history: {(error as Error).message}
        </p>
      )}

      {!isLoading && activities.length === 0 && (
        <p className="text-xs text-gray-400 italic text-center py-4">
          No audit entries recorded yet.
        </p>
      )}

      <div className="flow-root pt-2">
        <ul className="-mb-8">
          {activities.map((act, idx) => {
            const isLast = idx === activities.length - 1;
            return (
              <li key={act.id}>
                <div className="relative pb-8">
                  {!isLast && (
                    <span
                      className="absolute left-3.5 top-3.5 -ml-px h-full w-0.5 bg-gray-200"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-start space-x-3">
                    <div className="h-7 w-7 rounded-full bg-primary-100 border border-primary-300 flex items-center justify-center text-primary-700 text-xs font-bold">
                      {act.actor?.name ? act.actor.name.charAt(0).toUpperCase() : '•'}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-900 mr-1">
                          {act.actor?.name || 'User'}
                        </span>
                        {formatActionTitle(act)}
                        <span className="ml-2 text-gray-400">
                          {new Date(act.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {renderDetails(act)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
