import { useNavigate } from 'react-router-dom';
import { WorkItem, PaginationMeta } from '../../types';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import Pagination from '../../components/Pagination';
import LoadingSpinner from '../../components/LoadingSpinner';

interface WorkItemListProps {
  items: WorkItem[];
  meta?: PaginationMeta;
  isLoading: boolean;
  onPageChange: (newPage: number) => void;
  onCreateClick: () => void;
}

export default function WorkItemList({
  items,
  meta,
  isLoading,
  onPageChange,
  onCreateClick,
}: WorkItemListProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12">
        <LoadingSpinner label="Loading operational queue..." />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <div className="max-w-sm mx-auto">
          <div className="h-12 w-12 mx-auto rounded-full bg-primary-50 flex items-center justify-center text-primary-600 mb-4 text-xl font-bold">
            0
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            No work items found
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            There are no operational items matching your current filters or in this team queue.
          </p>
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 shadow-sm transition-colors"
          >
            + Create New Work Item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-left">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Work Item
              </th>
              <th scope="col" className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Priority
              </th>
              <th scope="col" className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Assignee
              </th>
              <th scope="col" className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Created
              </th>
              <th scope="col" className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Version
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => navigate(`/work-items/${item.id}`)}
                className="hover:bg-blue-50/40 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="font-medium text-sm text-gray-900 line-clamp-1 hover:text-primary-600">
                    {item.title}
                  </div>
                  {item.description && (
                    <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                      {item.description}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <PriorityBadge priority={item.priority} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {item.assignee ? (
                    <div className="flex items-center space-x-2">
                      <div className="h-6 w-6 rounded-full bg-primary-100 text-primary-700 font-semibold text-xs flex items-center justify-center">
                        {item.assignee.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-800">{item.assignee.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                  v{item.version}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                  <span className="text-primary-600 hover:text-primary-900">
                    View &rarr;
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && (
        <Pagination meta={meta} onPageChange={onPageChange} />
      )}
    </div>
  );
}
