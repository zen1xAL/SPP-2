import React, { useState, useEffect, useCallback } from 'react';
import type { Task, TaskFilter, TaskStats, TaskStatus } from './types';
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  addAttachment,
  deleteAttachment
} from './api';
import { Header } from './components/Header';
import { Notification } from './components/Notification';
import { MetricsGrid } from './components/MetricsGrid';
import { FilterNav } from './components/FilterNav';
import { TaskForm } from './components/TaskForm';
import { TaskCard } from './components/TaskCard';

export const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0
  });
  const [currentFilter, setCurrentFilter] = useState<TaskFilter>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    if (type === 'success') {
      setTimeout(() => {
        setNotification((prev) => (prev?.message === message ? null : prev));
      }, 4000);
    }
  };

  const loadTasks = useCallback(async (filter: TaskFilter) => {
    try {
      setIsLoading(true);
      const data = await fetchTasks(filter);
      setTasks(data.tasks);
      setStats(data.stats);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Не удалось загрузить задачи');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks(currentFilter);
  }, [loadTasks, currentFilter]);

  const handleCreateTask = async (formData: FormData) => {
    try {
      await createTask(formData);
      showNotification('success', 'Задача успешно создана!');
      await loadTasks(currentFilter);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Ошибка создания задачи');
      throw err;
    }
  };

  const handleStatusChange = async (id: string, newStatus: TaskStatus) => {
    try {
      await updateTask(id, { status: newStatus });
      showNotification('success', 'Статус задачи обновлен');
      await loadTasks(currentFilter);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Ошибка обновления статуса');
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteTask(id);
      showNotification('success', 'Задача удалена');
      await loadTasks(currentFilter);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Ошибка удаления задачи');
    }
  };

  const handleAddAttachment = async (id: string, file: File) => {
    try {
      await addAttachment(id, file);
      showNotification('success', 'Файл успешно прикреплен');
      await loadTasks(currentFilter);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Ошибка загрузки файла');
    }
  };

  const handleDeleteAttachment = async (taskId: string, attachmentId: string) => {
    try {
      await deleteAttachment(taskId, attachmentId);
      showNotification('success', 'Вложение удалено');
      await loadTasks(currentFilter);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Ошибка удаления вложения');
    }
  };

  return (
    <>
      <Header
        onToggleForm={() => setIsFormOpen((prev) => !prev)}
        isFormOpen={isFormOpen}
      />

      <main className="main-content">
        <div className="container">
          {notification && (
            <Notification
              type={notification.type}
              message={notification.message}
              onClose={() => setNotification(null)}
            />
          )}

          <MetricsGrid
            stats={stats}
            currentFilter={currentFilter}
            onSelectFilter={(filter) => setCurrentFilter(filter)}
          />

          {isFormOpen && (
            <TaskForm
              onTaskCreated={handleCreateTask}
              onClose={() => setIsFormOpen(false)}
            />
          )}

          <FilterNav
            currentFilter={currentFilter}
            stats={stats}
            onFilterChange={(filter) => setCurrentFilter(filter)}
          />

          {isLoading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <span>Загрузка задач...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <line x1="10" y1="9" x2="8" y2="9"></line>
                </svg>
              </div>
              <h3>Задач не найдено</h3>
              <p>В выбранной категории «{currentFilter}» нет задач. Создайте новую задачу или сбросьте фильтр.</p>
              {currentFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCurrentFilter('all')}
                  className="btn btn-secondary"
                >
                  Сбросить фильтр
                </button>
              )}
            </div>
          ) : (
            <div className="tasks-grid">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={handleStatusChange}
                  onDeleteTask={handleDeleteTask}
                  onAddAttachment={handleAddAttachment}
                  onDeleteAttachment={handleDeleteAttachment}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container footer-content">
          <p>&copy; {new Date().getFullYear()} TaskFlow SPA &bull; React + Express REST API + PostgreSQL</p>
          <div className="footer-badges">
            <span className="tech-badge">React 18 SPA</span>
            <span className="tech-badge">PostgreSQL</span>
            <span className="tech-badge">Docker Compose</span>
          </div>
        </div>
      </footer>
    </>
  );
};
