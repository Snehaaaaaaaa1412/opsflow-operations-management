import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface HealthResponse {
  status: string;
}

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthResponse>('/health'),
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-4">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome to OpsFlow</h2>
        <p className="mt-2 text-base text-gray-600">
          Operational work management &mdash; track, prioritize, and collaborate on mission-critical work items under pressure.
        </p>

        <div className="mt-6 flex items-center space-x-4">
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 shadow-sm transition-colors"
            >
              Go to Dashboard &rarr;
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 shadow-sm transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center px-5 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Health Status Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-700 mb-3">System Status</h3>
        {isLoading && (
          <div className="flex items-center space-x-2 text-gray-500">
            <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full" />
            <span>Checking backend status...</span>
          </div>
        )}
        {isError && (
          <div className="text-red-600">
            <p className="font-medium">Backend unavailable</p>
            <p className="text-sm mt-1">{(error as Error)?.message || 'Connection failed'}</p>
          </div>
        )}
        {data && (
          <div className="flex items-center space-x-2 text-green-600">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="font-medium">Backend is healthy</span>
            <span className="text-gray-400">({data.status})</span>
          </div>
        )}
      </div>
    </div>
  );
}
