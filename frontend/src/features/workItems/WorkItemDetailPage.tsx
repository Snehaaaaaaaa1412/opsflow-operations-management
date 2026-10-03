import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiRequestError } from '../../api/client';
import { WorkItem, TeamMember, ApiResponse } from '../../types';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import WorkItemStatusTransition from './WorkItemStatusTransition';
import WorkItemEditModal from './WorkItemEditModal';
import CommentsSection from './CommentsSection';
import ActivityTimeline from './ActivityTimeline';

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 1. Fetch work item details
  const {
    data: workItemResponse,
    isLoading: isItemLoading,
    error: itemError,
    refetch,
  } = useQuery({
    queryKey: ['work-item', id],
    queryFn: () => apiClient.get<ApiResponse<WorkItem>>(`/work-items/${id}`),
    enabled: !!id,
  });

  const workItem = workItemResponse?.data;

  // 2. Fetch team members for edit dropdown
  const { data: membersResponse } = useQuery({
    queryKey: ['team-members', workItem?.teamId],
    queryFn: () =>
      apiClient.get<ApiResponse<TeamMember[]>>(`/teams/${workItem?.teamId}/members`),
    enabled: !!workItem?.teamId,
  });

  const members = membersResponse?.data || [];

  // 3. Delete work item mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/work-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      navigate('/dashboard');
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        setDeleteError(err.message || 'Failed to delete work item');
      } else {
        setDeleteError('An unexpected error occurred while deleting.');
      }
    },
  });

  if (isItemLoading) {
    return <LoadingSpinner label="Loading work item details..." className="py-24" />;
  }

  if (itemError || !workItem) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center max-w-lg mx-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Work Item Not Found
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          {(itemError as Error)?.message ||
            'The requested work item could not be found or you do not have permission to view it.'}
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link
            to={`/dashboard?teamId=${workItem.teamId}`}
            className="text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            &larr; Back to Queue
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-xs text-gray-500 font-mono">ID: {workItem.id.slice(0, 8)}...</span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="inline-flex items-center px-3.5 py-1.5 border border-gray-300 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors"
          >
            Edit Item
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this work item?')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center px-3.5 py-1.5 border border-red-200 text-xs font-medium rounded-lg text-red-600 bg-white hover:bg-red-50 focus:outline-none disabled:opacity-50 transition-colors"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg"
        >
          {deleteError}
        </div>
      )}

      {/* Main Details Card */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-gray-100 pb-5">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <StatusBadge status={workItem.status} />
              <PriorityBadge priority={workItem.priority} />
              <span className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                Version {workItem.version}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {workItem.title}
            </h1>
          </div>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Description
          </h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50/50 p-4 rounded-lg border border-gray-100 leading-relaxed">
            {workItem.description || (
              <span className="italic text-gray-400">No description provided.</span>
            )}
          </p>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100 text-xs">
          <div>
            <span className="text-gray-500 block uppercase font-medium text-[10px]">
              Assignee
            </span>
            <span className="font-semibold text-gray-900 mt-0.5 block">
              {workItem.assignee?.name || 'Unassigned'}
            </span>
          </div>

          <div>
            <span className="text-gray-500 block uppercase font-medium text-[10px]">
              Created By
            </span>
            <span className="font-semibold text-gray-900 mt-0.5 block">
              {workItem.createdBy?.name || workItem.createdById}
            </span>
          </div>

          <div>
            <span className="text-gray-500 block uppercase font-medium text-[10px]">
              Created Date
            </span>
            <span className="text-gray-800 mt-0.5 block">
              {new Date(workItem.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>

          <div>
            <span className="text-gray-500 block uppercase font-medium text-[10px]">
              Last Updated
            </span>
            <span className="text-gray-800 mt-0.5 block">
              {new Date(workItem.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* State Machine Transition Widget */}
      <WorkItemStatusTransition workItem={workItem} onRefresh={refetch} />

      {/* Grid: Comments & Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CommentsSection workItemId={workItem.id} />
        <ActivityTimeline workItemId={workItem.id} />
      </div>

      {/* Edit Modal */}
      <WorkItemEditModal
        workItem={workItem}
        isOpen={isEditModalOpen}
        members={members}
        onClose={() => setIsEditModalOpen(false)}
        onRefresh={refetch}
      />
    </div>
  );
}
