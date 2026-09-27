export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Attachment {
  readonly id: string;
  readonly originalName: string;
  readonly storedName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedAt: string;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly Attachment[];
}

export interface CreateTaskDTO {
  readonly title: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly dueDate?: string | null;
  readonly attachment?: Attachment;
}

export interface UpdateTaskDTO {
  readonly title?: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly dueDate?: string | null;
}

export type TaskFilter = 'all' | TaskStatus;

export interface TaskStats {
  readonly total: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly overdue: number;
}

export const VALID_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed'] as const;

export function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && VALID_STATUSES.includes(value as TaskStatus);
}

export function isValidFilter(value: unknown): value is TaskFilter {
  return value === 'all' || isValidStatus(value);
}

export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'completed') {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  return due.getTime() < today.getTime();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
