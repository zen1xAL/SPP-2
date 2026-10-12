export type UserRole = 'admin' | 'manager' | 'viewer';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
}

export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly isRevoked: boolean;
  readonly isCurrent?: boolean;
  readonly isExpired?: boolean;
}

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
  readonly authorId?: string | null;
  readonly authorEmail?: string | null;
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

export interface AuthResponse {
  readonly message: string;
  readonly token: string;
  readonly user: User;
  readonly session: {
    readonly id: string;
    readonly expiresAt: string;
  };
}

export interface EmailPreview {
  readonly to: string;
  readonly subject: string;
  readonly resetUrl: string;
  readonly token: string;
  readonly expiresAt: string;
}
