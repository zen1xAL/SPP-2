import React, { useState } from 'react';
import type { TaskStatus } from '../types';

interface TaskFormProps {
  onTaskCreated: (formData: FormData) => Promise<void>;
  onClose: () => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ onTaskCreated, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Название задачи обязательно для заполнения');
      return;
    }

    setValidationError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('status', status);
      if (dueDate) {
        formData.append('dueDate', dueDate);
      }
      if (file) {
        formData.append('attachment', file);
      }

      await onTaskCreated(formData);
      setTitle('');
      setDescription('');
      setStatus('pending');
      setDueDate('');
      setFile(null);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="panel new-task-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Создание новой задачи
        </h2>
        <button type="button" onClick={onClose} className="btn-icon" aria-label="Закрыть">
          &times;
        </button>
      </div>

      {validationError && (
        <div className="alert alert-error">
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="task-form">
        <div className="form-row">
          <div className="form-group flex-2">
            <label htmlFor="task-title" className="form-label">
              Название задачи <span className="required">*</span>
            </label>
            <input
              type="text"
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например, Подготовить отчет по лабораторной работе..."
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="task-status" className="form-label">Начальный статус</label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="form-select"
            >
              <option value="pending">Ожидает выполнения</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Завершена</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="task-due-date" className="form-label">Ожидаемый срок (дедлайн)</label>
            <input
              type="date"
              id="task-due-date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="task-description" className="form-label">Описание задачи</label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Краткие детали, инструкции или требования к задаче..."
            className="form-textarea"
          />
        </div>

        <div className="form-row form-row-bottom">
          <div className="form-group flex-2">
            <label htmlFor="task-attachment" className="form-label">Прикрепить файл (до 5 МБ)</label>
            <input
              type="file"
              id="task-attachment"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="form-file-input"
            />
            <span className="form-help">Поддерживаются PDF, DOCX, TXT, изображения, архивы, CSV.</span>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-submit">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              {isSubmitting ? 'Сохранение...' : 'Создать задачу'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
