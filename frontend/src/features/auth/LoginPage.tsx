import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiRequestError } from '../../api/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setIsLoading(true);
    try {
      await login(trimmedEmail, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message || 'Invalid email or password');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-white p-8 border border-gray-200 rounded-xl shadow-sm">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Sign in to OpsFlow</h2>
        <p className="text-sm text-gray-600 mt-2">
          Manage operational tasks, workflow transitions, and team queues.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 flex items-start"
        >
          <span className="font-medium mr-1">Error:</span> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm disabled:bg-gray-100"
            placeholder="alice@opsflow.internal"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm disabled:bg-gray-100"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-primary-600 hover:text-primary-500"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
