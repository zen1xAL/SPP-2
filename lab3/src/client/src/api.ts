import type {
  Attachment,
  AuthResponse,
  EmailPreview,
  Session,
  Task,
  TaskFilter,
  TaskStats,
  User,
  UserRole
} from './types';

const BASE_URL = '/api';

export function getToken(): string | null {
  return localStorage.getItem('taskflow_token');
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('taskflow_token', token);
  } else {
    localStorage.removeItem('taskflow_token');
  }
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem('taskflow_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  if (user) {
    localStorage.setItem('taskflow_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('taskflow_user');
  }
}

export class ApiError extends Error {
  readonly code?: string;
  readonly statusCode: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, statusCode: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  if (!res.ok) {
    let errorMsg = `Ошибка сервера (${res.status})`;
    let errorCode: string | undefined;
    let retryAfterSeconds: number | undefined;

    const retryHeader = res.headers.get('Retry-After');
    if (retryHeader) {
      retryAfterSeconds = parseInt(retryHeader, 10);
    }

    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
      if (data && data.code) {
        errorCode = data.code;
      }
      if (data && data.retryAfterSeconds) {
        retryAfterSeconds = data.retryAfterSeconds;
      }
    } catch {
      errorMsg = (await res.text()) || errorMsg;
    }

    if (res.status === 401 && (errorCode === 'TOKEN_EXPIRED' || errorCode === 'SESSION_REVOKED')) {
      setToken(null);
      setStoredUser(null);
    }

    throw new ApiError(errorMsg, res.status, errorCode, retryAfterSeconds);
  }

  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function register(email: string, password: string, role?: UserRole): Promise<{ message: string; user: User }> {
  return request<{ message: string; user: User }>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role })
  });
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST' });
  } finally {
    setToken(null);
    setStoredUser(null);
  }
}

export async function fetchMe(): Promise<{ user: User }> {
  return request<{ user: User }>('/auth/me');
}

export async function fetchSessions(): Promise<{ sessions: Session[] }> {
  return request<{ sessions: Session[] }>('/auth/sessions');
}

export async function revokeSession(id: string): Promise<void> {
  return request<void>(`/auth/sessions/${id}`, { method: 'DELETE' });
}

export async function forgotPassword(email: string): Promise<{ message: string; previewToken?: string }> {
  return request<{ message: string; previewToken?: string }>('/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword })
  });
}

export async function fetchEmailPreview(): Promise<{ latestEmail: EmailPreview | null }> {
  return request<{ latestEmail: EmailPreview | null }>('/auth/email-preview');
}

export async function fetchTasks(filter: TaskFilter = 'all'): Promise<{ tasks: Task[]; stats: TaskStats }> {
  const endpoint = filter !== 'all' ? `/tasks?status=${filter}` : '/tasks';
  return request<{ tasks: Task[]; stats: TaskStats }>(endpoint);
}

export async function createTask(formData: FormData): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: formData
  });
}

export async function updateTask(
  id: string,
  data: { title?: string; description?: string; status?: string; dueDate?: string | null }
): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteTask(id: string): Promise<void> {
  return request<void>(`/tasks/${id}`, {
    method: 'DELETE'
  });
}

export async function addAttachment(taskId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('attachment', file);
  return request<Attachment>(`/tasks/${taskId}/attachments`, {
    method: 'POST',
    body: formData
  });
}

export async function deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
  return request<void>(`/tasks/${taskId}/attachments/${attachmentId}`, {
    method: 'DELETE'
  });
}

export function getDownloadUrl(taskId: string, attachmentId: string): string {
  const token = getToken();
  return `${BASE_URL}/tasks/${taskId}/attachments/${attachmentId}/download?token=${encodeURIComponent(token || '')}`;
}
