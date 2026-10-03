interface LoadingSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingSpinner({
  label = 'Loading...',
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  };

  return (
    <div className={`flex flex-col items-center justify-center p-6 ${className}`}>
      <div
        className={`animate-spin rounded-full border-primary-600 border-t-transparent ${sizeClasses[size]}`}
      />
      {label && <p className="mt-2 text-sm text-gray-500">{label}</p>}
    </div>
  );
}
