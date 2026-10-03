import { WorkItemStatus } from '../types';

interface StatusBadgeProps {
  status: WorkItemStatus | string;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const getStyles = () => {
    switch (status) {
      case WorkItemStatus.OPEN:
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case WorkItemStatus.IN_PROGRESS:
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case WorkItemStatus.BLOCKED:
        return 'bg-red-50 text-red-700 border-red-200';
      case WorkItemStatus.RESOLVED:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case WorkItemStatus.CLOSED:
        return 'bg-gray-100 text-gray-700 border-gray-300';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const getLabel = () => {
    switch (status) {
      case WorkItemStatus.OPEN:
        return 'Open';
      case WorkItemStatus.IN_PROGRESS:
        return 'In Progress';
      case WorkItemStatus.BLOCKED:
        return 'Blocked';
      case WorkItemStatus.RESOLVED:
        return 'Resolved';
      case WorkItemStatus.CLOSED:
        return 'Closed';
      default:
        return status;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStyles()} ${className}`}
    >
      {getLabel()}
    </span>
  );
}
