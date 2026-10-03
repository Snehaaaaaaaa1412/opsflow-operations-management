import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiRequestError } from '../../api/client';
import { WorkItem, WorkItemPriority, TeamMember, ApiResponse } from '../../types';

interface WorkItemEditModalProps {
  workItem: WorkItem;
  isOpen: boolean;
  members: TeamMember[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function WorkItemEditModal({
  workItem,
  isOpen,
  members,
  onClose,
  onRefresh,
}: WorkItemEditModalProps) {
  const [title, setTitle] = useState(workItem.title);
  const [description, setDescription] = useState(workItem.description || '');
  const [priority, setPriority] = useState<WorkItemPriority>(workItem.priority);
  const [assigneeId, setAssigneeId] = useState<string>(workItem.assigneeId || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    setTitle(workItem.title);
    setDescription(workItem.description || '');
    setPriority(workItem.priority);
    setAssigneeId(workItem.assigneeId || '');
    setErrorMessage(null);
    setIsConflict(false);
  }, [workItem, isOpen]);

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string | null;
      priority: WorkItemPriority;
      assigneeId?: string | null;
      version: number;
    }) => {
      const res = await apiClient.patch<ApiResponse<WorkItem>>(
        `/work-items/${workItem.id}`,
        payload
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item', workItem.id] });
      queryClient.invalidateQueries({ queryKey: ['work-item-activity', workItem.id] });
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        if (err.status === 409 || err.code === 'STALE_WORK_ITEM' || err.code === 'CONFLICT') {
          setIsConflict(true);
          setErrorMessage(
            'This work item was updated concurrently. Please refresh to view the latest version.'
          );
        } else {
          setErrorMessage(err.message || 'Failed to update work item.');
        }
      } else {
        setErrorMessage('An unexpected error occurred.');
      }
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Title is required');
      return;
    }

    updateMutation.mutate({
      title: trimmedTitle,
      description: description.trim() || null,
      priority,
      assigneeId: assigneeId ? assigneeId : null,
      version: workItem.version,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl relative border border-gray-100">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            Edit Work Item <span className="text-xs text-gray-400 font-mono">(v{workItem.version})</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-md flex flex-col gap-2"
          >
            <span>{errorMessage}</span>
            {isConflict && (
              <button
                type="button"
                onClick={() => {
                  onRefresh();
                  onClose();
                }}
                className="self-start px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"
              >
                Reload Latest Version
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-item-title" className="block text-xs font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-item-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="edit-item-description" className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-item-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-item-priority" className="block text-xs font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                id="edit-item-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as WorkItemPriority)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value={WorkItemPriority.LOW}>Low</option>
                <option value={WorkItemPriority.MEDIUM}>Medium</option>
                <option value={WorkItemPriority.HIGH}>High</option>
                <option value={WorkItemPriority.URGENT}>Urgent</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-item-assignee" className="block text-xs font-medium text-gray-700 mb-1">
                Assignee
              </label>
              <select
                id="edit-item-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.name || m.userId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={updateMutation.isPending}
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
