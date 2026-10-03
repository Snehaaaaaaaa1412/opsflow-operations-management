import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from '../features/auth/LoginPage';
import RegisterPage from '../features/auth/RegisterPage';
import ProtectedRoute from '../components/ProtectedRoute';
import { apiClient, ApiRequestError } from '../api/client';

function renderWithProviders(ui: React.ReactElement, { initialEntries = ['/'] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Authentication & Protected Routes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('LoginPage', () => {
    it('should render login form with email and password inputs', () => {
      renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should show error when submitting empty email', async () => {
      renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

      const form = screen.getByRole('button', { name: /sign in/i }).closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/email is required/i);
      });
    });

    it('should handle successful login and set localStorage token', async () => {
      const mockPost = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        data: {
          token: 'mock-jwt-token-xyz',
          user: {
            id: 'u-123',
            name: 'Alice User',
            email: 'alice@example.com',
          },
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
        </Routes>,
        { initialEntries: ['/login'] }
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'alice@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      });

      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/auth/login', {
          email: 'alice@example.com',
          password: 'password123',
        });
        expect(localStorage.getItem('opsflow_token')).toBe('mock-jwt-token-xyz');
        expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
      });
    });

    it('should display error message on invalid credentials', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce(
        new ApiRequestError(401, {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        })
      );

      renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'wrong@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'wrongpassword' },
      });

      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i);
      });
    });
  });

  describe('RegisterPage', () => {
    it('should render registration form fields', () => {
      renderWithProviders(<RegisterPage />, { initialEntries: ['/register'] });

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should reject password shorter than 8 characters', async () => {
      renderWithProviders(<RegisterPage />, { initialEntries: ['/register'] });

      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Bob' },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'bob@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'short' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);
      });
    });

    it('should handle duplicate email conflict error (409)', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce(
        new ApiRequestError(409, {
          code: 'CONFLICT',
          message: 'An account with this email address already exists',
        })
      );

      renderWithProviders(<RegisterPage />, { initialEntries: ['/register'] });

      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Existing User' },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'taken@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'securepassword123' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
      });
    });
  });

  describe('ProtectedRoute', () => {
    it('should redirect unauthenticated users to /login', async () => {
      renderWithProviders(
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Protected Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page Target</div>} />
        </Routes>,
        { initialEntries: ['/dashboard'] }
      );

      await waitFor(() => {
        expect(screen.getByText('Login Page Target')).toBeInTheDocument();
        expect(screen.queryByText('Protected Dashboard')).not.toBeInTheDocument();
      });
    });

    it('should permit access to protected route when authenticated', async () => {
      localStorage.setItem('opsflow_token', 'valid-jwt');
      localStorage.setItem(
        'opsflow_user',
        JSON.stringify({ id: 'u-1', name: 'Authorized User', email: 'auth@test.com' })
      );

      renderWithProviders(
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Protected Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page Target</div>} />
        </Routes>,
        { initialEntries: ['/dashboard'] }
      );

      await waitFor(() => {
        expect(screen.getByText('Protected Dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Login Page Target')).not.toBeInTheDocument();
      });
    });
  });
});
