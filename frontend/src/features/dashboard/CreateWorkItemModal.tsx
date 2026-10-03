import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiRequestError } from '../../api/client';
import { WorkItemPriority, TeamMember, WorkItem, ApiResponse } from '../../types';

interface CreateWorkItemModalProps {
  teamId: string;
  isOpen: boolean;
  members: TeamMember[];
  onClose: () => void;
  onSuccess?: (item: WorkItem) => void;
}

export default function CreateWorkItemModal({
  teamId,
  isOpen,
  members,
  onClose,
  onSuccess,
}: CreateWorkItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkItemPriority>(WorkItemPriority.MEDIUM);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      priority: WorkItemPriority;
      assigneeId?: string;
    }) => {
      const res = await apiClient.post<ApiResponse<WorkItem>>(
        `/teams/${teamId}/work-items`,
        payload
      );
      return res.data;
    },
    onSuccess: (createdItem) => {
      queryClient.invalidateQueries({ queryKey: ['work-items', teamId] });
      resetForm();
      onClose();
      if (onSuccess) {
        onSuccess(createdItem);
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message || 'Failed to create work item');
      } else {
        setErrorMessage('An unexpected error occurred.');
      }
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority(WorkItemPriority.MEDIUM);
    setAssigneeId('');
    setErrorMessage(null);
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Title is required');
      return;
    }

    createMutation.mutate({
      title: trimmedTitle,
      description: description.trim() || undefined,
      priority,
      assigneeId: assigneeId ? assigneeId : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl relative border border-gray-100">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Create Work Item</h3>
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-md"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="create-item-title" className="block text-xs font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="create-item-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Investigate high latency on payment gateway"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="create-item-description" className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="create-item-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide background context, logs, repro steps, or impacted services..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="create-item-priority" className="block text-xs font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                id="create-item-priority"
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
              <label htmlFor="create-item-assignee" className="block text-xs font-medium text-gray-700 mb-1">
                Assignee
              </label>
              <select
                id="create-item-assignee"
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
              disabled={createMutation.isPending}
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
