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
    <section className="task-form-panel">
      <div className="panel-header-row">
        <div className="panel-title-wrap">
          <div className="panel-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
          <div>
            <h2 className="panel-heading">Новая задача</h2>
            <p className="panel-subheading">Заполните поля и прикрепите вложение при необходимости</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-close" aria-label="Закрыть форму">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {validationError && (
        <div className="alert alert-error">
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-layout">
        <div className="form-grid-top">
          <div className="form-field flex-grow">
            <label htmlFor="task-title" className="field-label">
              Название задачи
            </label>
            <input
              type="text"
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Короткое и понятное название..."
              className="field-input"
              required
            />
          </div>

          <div className="form-field field-date">
            <label htmlFor="task-date" className="field-label">Срок выполнения</label>
            <input
              type="date"
              id="task-date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="field-input field-input-date"
            />
          </div>

          <div className="form-field field-status">
            <label htmlFor="task-status" className="field-label">Статус</label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="field-select"
            >
              <option value="pending">Ожидает</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Завершена</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="task-desc" className="field-label">Описание</label>
          <textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Подробное описание задачи или критерии приемки..."
            className="field-textarea"
            rows={3}
          />
        </div>

        <div className="form-bottom-row">
          <div className="form-field-file">
            <label className="field-file-button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
              <span>{file ? file.name : 'Выбрать вложение...'}</span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="visually-hidden"
              />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="btn-clear-file"
                title="Очистить выбранный файл"
              >
                &times;
              </button>
            )}
          </div>

          <div className="form-actions-row">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Создание...' : 'Создать задачу'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
