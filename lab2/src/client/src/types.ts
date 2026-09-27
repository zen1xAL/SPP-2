export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Attachment {
  readonly id: string;
  readonly originalName: string;
  readonly storedName: string;
  readonly mimeType: string;
  readonly size: string | number;
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

export interface TaskStats {
  readonly total: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly overdue: number;
}

export type TaskFilter = 'all' | TaskStatus;
