/**
 * Reusable API client for communicating with the OpsFlow backend.
 * Handles JSON requests, auth headers, and structured error responses.
 */

const API_BASE_URL = '/api';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.details = error.details;
    this.name = 'ApiRequestError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Attach auth token if available (will be implemented in Phase 1)
  const token = localStorage.getItem('opsflow_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    if (!response.ok) {
      throw new ApiRequestError(response.status, {
        code: 'NETWORK_ERROR',
        message: `Request failed with status ${response.status}`,
      });
    }
    return {} as T;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      data.error || { code: 'UNKNOWN', message: 'An error occurred' }
    );
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
