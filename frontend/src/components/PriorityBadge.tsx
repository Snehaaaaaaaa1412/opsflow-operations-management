import { WorkItemPriority } from '../types';

interface PriorityBadgeProps {
  priority: WorkItemPriority | string;
  className?: string;
}

export default function PriorityBadge({ priority, className = '' }: PriorityBadgeProps) {
  const getStyles = () => {
    switch (priority) {
      case WorkItemPriority.LOW:
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case WorkItemPriority.MEDIUM:
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case WorkItemPriority.HIGH:
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case WorkItemPriority.URGENT:
        return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getLabel = () => {
    switch (priority) {
      case WorkItemPriority.LOW:
        return 'Low';
      case WorkItemPriority.MEDIUM:
        return 'Medium';
      case WorkItemPriority.HIGH:
        return 'High';
      case WorkItemPriority.URGENT:
        return 'Urgent';
      default:
        return priority;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStyles()} ${className}`}
    >
      {getLabel()}
    </span>
  );
}
