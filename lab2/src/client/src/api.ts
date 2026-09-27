import type { Attachment, Task, TaskFilter, TaskStats } from './types';

const BASE_URL = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Ошибка сервера (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
    } catch {
      errorMsg = await res.text() || errorMsg;
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export async function fetchTasks(filter: TaskFilter = 'all'): Promise<{ tasks: Task[]; stats: TaskStats }> {
  const url = filter !== 'all' ? `${BASE_URL}/tasks?status=${filter}` : `${BASE_URL}/tasks`;
  const res = await fetch(url);
  return handleResponse<{ tasks: Task[]; stats: TaskStats }>(res);
}

export async function createTask(formData: FormData): Promise<Task> {
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    body: formData
  });
  return handleResponse<Task>(res);
}

export async function updateTask(
  id: string,
  data: { title?: string; description?: string; status?: string; dueDate?: string | null }
): Promise<Task> {
  const res = await fetch(`${BASE_URL}/tasks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return handleResponse<Task>(res);
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/tasks/${id}`, {
    method: 'DELETE'
  });
  await handleResponse<{ message: string; id: string }>(res);
}

export async function addAttachment(taskId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('attachment', file);

  const res = await fetch(`${BASE_URL}/tasks/${taskId}/attachments`, {
    method: 'POST',
    body: formData
  });
  return handleResponse<Attachment>(res);
}

export async function deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/attachments/${attachmentId}`, {
    method: 'DELETE'
  });
  await handleResponse<{ message: string; attachmentId: string }>(res);
}

export function getDownloadUrl(taskId: string, attachmentId: string): string {
  return `${BASE_URL}/tasks/${taskId}/attachments/${attachmentId}/download`;
}
