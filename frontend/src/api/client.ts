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
  body?: unknown,
  customHeaders?: Record<string, string>
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };

  // Attach auth token if available
  const token = localStorage.getItem('opsflow_token');
  if (token && !headers['Authorization']) {
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
  get: <T>(path: string, headers?: Record<string, string>) =>
    request<T>('GET', path, undefined, headers),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>('POST', path, body, headers),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>('PUT', path, body, headers),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>('PATCH', path, body, headers),
  delete: <T>(path: string, headers?: Record<string, string>) =>
    request<T>('DELETE', path, undefined, headers),
};

