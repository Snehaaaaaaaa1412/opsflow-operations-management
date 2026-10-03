import { WorkItemStatus, WorkItemPriority, TeamMember } from '../../types';

export interface FilterState {
  search: string;
  status: string;
  priority: string;
  assigneeId: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

interface WorkItemFiltersProps {
  filters: FilterState;
  members: TeamMember[];
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
}

export default function WorkItemFilters({
  filters,
  members,
  onFilterChange,
  onReset,
}: WorkItemFiltersProps) {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="md:col-span-2">
          <label htmlFor="search-input" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Search
          </label>
          <div className="relative">
            <input
              id="search-input"
              type="text"
              value={filters.search}
              onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
              placeholder="Search by title or description..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => onFilterChange({ search: '', page: 1 })}
                className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label htmlFor="status-select" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Status
          </label>
          <select
            id="status-select"
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value, page: 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Statuses</option>
            <option value={WorkItemStatus.OPEN}>Open</option>
            <option value={WorkItemStatus.IN_PROGRESS}>In Progress</option>
            <option value={WorkItemStatus.BLOCKED}>Blocked</option>
            <option value={WorkItemStatus.RESOLVED}>Resolved</option>
            <option value={WorkItemStatus.CLOSED}>Closed</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div>
          <label htmlFor="priority-select" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Priority
          </label>
          <select
            id="priority-select"
            value={filters.priority}
            onChange={(e) => onFilterChange({ priority: e.target.value, page: 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Priorities</option>
            <option value={WorkItemPriority.LOW}>Low</option>
            <option value={WorkItemPriority.MEDIUM}>Medium</option>
            <option value={WorkItemPriority.HIGH}>High</option>
            <option value={WorkItemPriority.URGENT}>Urgent</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
        {/* Assignee Filter */}
        <div>
          <label htmlFor="assignee-select" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Assignee
          </label>
          <select
            id="assignee-select"
            value={filters.assigneeId}
            onChange={(e) => onFilterChange({ assigneeId: e.target.value, page: 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user?.name || member.userId} ({member.role})
              </option>
            ))}
          </select>
        </div>

        {/* Sort Field */}
        <div>
          <label htmlFor="sort-field-select" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Sort By
          </label>
          <select
            id="sort-field-select"
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ sortBy: e.target.value, page: 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="createdAt">Created Date</option>
            <option value="updatedAt">Updated Date</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="title">Title</option>
          </select>
        </div>

        {/* Sort Order */}
        <div>
          <label htmlFor="sort-order-select" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Order
          </label>
          <select
            id="sort-order-select"
            value={filters.sortOrder}
            onChange={(e) =>
              onFilterChange({ sortOrder: e.target.value as 'asc' | 'desc', page: 1 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        {/* Page Limit & Reset */}
        <div className="flex items-end justify-between space-x-2">
          <div className="flex-1">
            <label htmlFor="limit-select" className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Per Page
            </label>
            <select
              id="limit-select"
              value={filters.limit}
              onChange={(e) =>
                onFilterChange({ limit: Number(e.target.value), page: 1 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-2 border border-gray-300 text-xs font-medium text-gray-600 rounded-md hover:bg-gray-50 focus:outline-none transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
