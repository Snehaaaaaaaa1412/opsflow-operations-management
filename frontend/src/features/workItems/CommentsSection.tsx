import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiRequestError } from '../../api/client';
import { Comment, ApiResponse } from '../../types';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';

interface CommentsSectionProps {
  workItemId: string;
}

export default function CommentsSection({ workItemId }: CommentsSectionProps) {
  const [content, setContent] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: commentsResponse,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ['work-item-comments', workItemId],
    queryFn: () =>
      apiClient.get<ApiResponse<Comment[]>>(`/work-items/${workItemId}/comments`),
  });

  const comments = commentsResponse?.data || [];

  const addCommentMutation = useMutation({
    mutationFn: async (commentBody: string) => {
      const res = await apiClient.post<ApiResponse<Comment>>(
        `/work-items/${workItemId}/comments`,
        { content: commentBody }
      );
      return res.data;
    },
    onSuccess: () => {
      setContent('');
      setErrorMessage(null);
      queryClient.invalidateQueries({
        queryKey: ['work-item-comments', workItemId],
      });
      queryClient.invalidateQueries({
        queryKey: ['work-item-activity', workItemId],
      });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message || 'Failed to post comment.');
      } else {
        setErrorMessage('An unexpected error occurred.');
      }
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/work-items/${workItemId}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['work-item-comments', workItemId],
      });
      queryClient.invalidateQueries({
        queryKey: ['work-item-activity', workItemId],
      });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message || 'Failed to delete comment.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setErrorMessage('Comment cannot be empty.');
      return;
    }

    addCommentMutation.mutate(trimmed);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="text-base font-semibold text-gray-900">
          Collaboration & Comments
        </h3>
        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">
          {comments.length}
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="new-comment" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="new-comment"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write an operational note or status update..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={addCommentMutation.isPending || !content.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 focus:outline-none disabled:opacity-50 transition-colors"
          >
            {addCommentMutation.isPending ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>

      {/* Comment List */}
      <div className="space-y-4 pt-2">
        {isLoading && <LoadingSpinner size="sm" label="Loading comments..." />}

        {fetchError && (
          <p className="text-xs text-red-500">
            Failed to load comments: {(fetchError as Error).message}
          </p>
        )}

        {!isLoading && comments.length === 0 && (
          <p className="text-xs text-gray-400 italic text-center py-4">
            No comments yet on this work item.
          </p>
        )}

        {comments.map((comment) => (
          <div
            key={comment.id}
            className="bg-gray-50/70 p-4 rounded-lg border border-gray-100 space-y-2 relative group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-6 w-6 rounded-full bg-primary-200 text-primary-800 font-bold text-xs flex items-center justify-center">
                  {comment.author?.name ? comment.author.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-semibold text-gray-800">
                  {comment.author?.name || 'User'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(comment.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Show delete button if user is author */}
              {user && user.id === comment.authorId && (
                <button
                  type="button"
                  onClick={() => deleteCommentMutation.mutate(comment.id)}
                  disabled={deleteCommentMutation.isPending}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete comment"
                >
                  Delete
                </button>
              )}
            </div>

            <p className="text-sm text-gray-700 whitespace-pre-wrap pl-8">
              {comment.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
