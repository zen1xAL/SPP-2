import React from 'react';
import type { Task, TaskStatus, User } from '../types';
import { getDownloadUrl } from '../api';

interface TaskCardProps {
  task: Task;
  currentUser: User | null;
  onStatusChange: (id: string, newStatus: TaskStatus) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onAddAttachment: (id: string, file: File) => Promise<void>;
  onDeleteAttachment: (taskId: string, attachmentId: string) => Promise<void>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Не указан';
  const [year, month, day] = dateStr.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

function formatFileSize(bytes: string | number): string {
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num)) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'completed') {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  return due.getTime() < today.getTime();
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  currentUser,
  onStatusChange,
  onDeleteTask,
  onAddAttachment,
  onDeleteAttachment
}) => {
  const taskOverdue = isOverdue(task.dueDate, task.status);
  const canModify = currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAddAttachment(task.id, file);
      e.target.value = '';
    }
  };

  const handleDelete = () => {
    if (window.confirm('Вы действительно хотите удалить эту задачу?')) {
      onDeleteTask(task.id);
    }
  };

  return (
    <article className={`task-item-card ${taskOverdue ? 'is-overdue' : ''}`}>
      <div className="task-header-row">
        <div className="task-status-tags">
          <span className={`status-pill status-pill-${task.status}`}>
            <span className="status-dot"></span>
            {task.status === 'pending' && 'Ожидает'}
            {task.status === 'in_progress' && 'В работе'}
            {task.status === 'completed' && 'Завершена'}
          </span>
          {taskOverdue && (
            <span className="status-pill status-pill-overdue">
              Просрочено
            </span>
          )}
        </div>

        {canModify && (
          <button
            type="button"
            onClick={handleDelete}
            className="btn-card-action"
            title="Удалить задачу"
            aria-label="Удалить задачу"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        )}
      </div>

      <div className="task-content">
        <h3 className="task-heading">{task.title}</h3>
        {task.description && <p className="task-paragraph">{task.description}</p>}

        <div className="task-meta-list">
          <div className="task-meta-entry">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span className="meta-text">Срок:</span>
            <code className="meta-value">{formatDate(task.dueDate)}</code>
          </div>

          {task.authorEmail && (
            <div className="task-meta-entry">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span className="meta-author">{task.authorEmail}</span>
            </div>
          )}
        </div>

        {task.attachments.length > 0 && (
          <div className="task-files-box">
            <div className="files-header">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
              <span>Вложения ({task.attachments.length})</span>
            </div>
            <ul className="files-list">
              {task.attachments.map((att) => (
                <li key={att.id} className="file-item">
                  <a
                    href={getDownloadUrl(task.id, att.id)}
                    className="file-link"
                    title={`Скачать ${att.originalName}`}
                  >
                    <span className="file-name">{att.originalName}</span>
                    <span className="file-size">{formatFileSize(att.size)}</span>
                  </a>

                  {canModify && (
                    <button
                      type="button"
                      onClick={() => onDeleteAttachment(task.id, att.id)}
                      className="btn-file-delete"
                      title="Удалить файл"
                      aria-label="Удалить файл"
                    >
                      &times;
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canModify && (
          <div className="task-upload-row">
            <label className="btn-upload-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Прикрепить файл</span>
              <input
                type="file"
                onChange={handleFileUpload}
                className="visually-hidden"
              />
            </label>
          </div>
        )}
      </div>

      <div className="task-footer-row">
        <span className="footer-label">Статус:</span>
        {canModify ? (
          <select
            id={`status-${task.id}`}
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
            className="status-dropdown"
          >
            <option value="pending">Ожидает</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершена</option>
          </select>
        ) : (
          <span className="readonly-status-tag">
            {task.status === 'pending' && 'Ожидает'}
            {task.status === 'in_progress' && 'В работе'}
            {task.status === 'completed' && 'Завершена'}
          </span>
        )}
      </div>
    </article>
  );
};
