import React, { useState, useEffect, useCallback } from 'react';
import type { Task, TaskFilter, TaskStats, TaskStatus, User } from './types';
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  addAttachment,
  deleteAttachment,
  getStoredUser,
  fetchMe,
  logout,
  ApiError
} from './api';
import { Header } from './components/Header';
import { Notification } from './components/Notification';
import { MetricsGrid } from './components/MetricsGrid';
import { FilterNav } from './components/FilterNav';
import { TaskForm } from './components/TaskForm';
import { TaskCard } from './components/TaskCard';
import { AuthModal } from './components/AuthModal';
import { SessionsModal } from './components/SessionsModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetToken, setResetToken] = useState('');

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
  const [isLoading, setIsLoading] = useState(false);
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
    if (!currentUser) return;
    try {
      setIsLoading(true);
      const data = await fetchTasks(filter);
      setTasks(data.tasks);
      setStats(data.stats);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setCurrentUser(null);
        setIsAuthOpen(true);
        showNotification('error', 'Сессия истекла или была отозвана. Пожалуйста, выполните вход.');
      } else {
        showNotification('error', err instanceof Error ? err.message : 'Не удалось загрузить задачи');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetchMe();
        setCurrentUser(res.user);
      } catch {
        setCurrentUser(null);
        setIsAuthOpen(true);
      }
    }

    if (currentUser) {
      checkAuth();
    } else {
      setIsAuthOpen(true);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadTasks(currentFilter);
    }
  }, [currentUser, currentFilter, loadTasks]);

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setTasks([]);
      setIsAuthOpen(true);
      showNotification('success', 'Вы успешно вышли из системы');
    } catch {
      setCurrentUser(null);
      setIsAuthOpen(true);
    }
  };

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
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenSessions={() => setIsSessionsOpen(true)}
        onLogout={handleLogout}
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

          {currentUser ? (
            <>
              <MetricsGrid
                stats={stats}
                currentFilter={currentFilter}
                onSelectFilter={(filter) => setCurrentFilter(filter)}
              />

              {isFormOpen && currentUser.role !== 'viewer' && (
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
                  <p>В выбранной категории «{currentFilter}» пока нет задач.</p>
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
                      currentUser={currentUser}
                      onStatusChange={handleStatusChange}
                      onDeleteTask={handleDeleteTask}
                      onAddAttachment={handleAddAttachment}
                      onDeleteAttachment={handleDeleteAttachment}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="unauthenticated-hero">
              <div className="hero-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <circle cx="12" cy="11" r="3"></circle>
                  <path d="M12 14v3"></path>
                </svg>
              </div>
              <h2>Требуется авторизация в системе</h2>
              <p>
                Для доступа к задачам и проверке прав ролевой модели (RBAC: Администратор, Менеджер, Наблюдатель) выполните вход в систему.
              </p>
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="btn btn-primary btn-large"
              >
                Войти или выбрать демонстрационную роль
              </button>
            </div>
          )}
        </div>
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          setCurrentUser(getStoredUser());
          showNotification('success', 'Успешный вход в систему!');
        }}
        onOpenResetPassword={(previewTok) => {
          setResetToken(previewTok || '');
          setIsResetOpen(true);
        }}
      />

      <SessionsModal
        isOpen={isSessionsOpen}
        onClose={() => setIsSessionsOpen(false)}
        onSessionRevoked={() => {
          showNotification('success', 'Сессия отозвана');
        }}
      />

      <ResetPasswordModal
        isOpen={isResetOpen}
        initialToken={resetToken}
        onClose={() => setIsResetOpen(false)}
        onSuccess={(msg) => {
          showNotification('success', msg);
          setIsAuthOpen(true);
        }}
      />

      <footer className="app-footer">
        <div className="container footer-content">
          <p>&copy; {new Date().getFullYear()} TaskFlow RBAC &bull; Лабораторная работа №3</p>
          <div className="footer-badges">
            <span className="tech-badge">RBAC (3 роли)</span>
            <span className="tech-badge">Rate Limiter (429)</span>
            <span className="tech-badge">Active Sessions</span>
            <span className="tech-badge">JSON Logging</span>
          </div>
        </div>
      </footer>
    </>
  );
};
