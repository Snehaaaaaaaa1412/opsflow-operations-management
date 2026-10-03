import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { User, AuthResponse, ApiResponse } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AUTH_TOKEN_KEY = 'opsflow_token';
export const AUTH_USER_KEY = 'opsflow_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const storedUser = localStorage.getItem(AUTH_USER_KEY);
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    // Validate stored token and user on startup
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const storedUser = localStorage.getItem(AUTH_USER_KEY);
    if (storedToken && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        setUser(null);
        setToken(null);
      }
    } else {
      setUser(null);
      setToken(null);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', {
      email,
      password,
    });

    const authData = res.data;
    localStorage.setItem(AUTH_TOKEN_KEY, authData.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authData.user));
    setToken(authData.token);
    setUser(authData.user);
    return authData.user;
  };

  const register = async (
    name: string,
    email: string,
    password: string
  ): Promise<User> => {
    await apiClient.post<ApiResponse<User>>('/auth/register', {
      name,
      email,
      password,
    });

    // Automatically login upon successful registration
    const loggedInUser = await login(email, password);
    return loggedInUser;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
    setToken(null);
    queryClient.clear();
    navigate('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
