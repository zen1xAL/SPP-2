import React from 'react';
import type { User } from '../types';

interface HeaderProps {
  currentUser: User | null;
  onOpenAuth: () => void;
  onOpenSessions: () => void;
  onLogout: () => void;
  onToggleForm: () => void;
  isFormOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenAuth,
  onOpenSessions,
  onLogout,
  onToggleForm,
  isFormOpen
}) => {
  const canCreateTask = currentUser && currentUser.role !== 'viewer';

  return (
    <header className="app-header">
      <div className="container header-container">
        <div className="brand-group">
          <div className="brand-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div className="brand-titles">
            <div className="brand-name-row">
              <span className="brand-title">TaskFlow</span>
              <span className="brand-badge">RBAC v3</span>
            </div>
            <p className="brand-subtitle">Система управления задачами с контролем сессий и ролей</p>
          </div>
        </div>

        <div className="header-actions">
          {currentUser ? (
            <div className="user-profile-bar">
              <div className="user-pill">
                <span className="user-email-text">{currentUser.email}</span>
                <span className={`role-pill role-pill-${currentUser.role}`}>
                  <span className="role-dot"></span>
                  {currentUser.role === 'admin' && 'Администратор'}
                  {currentUser.role === 'manager' && 'Менеджер'}
                  {currentUser.role === 'viewer' && 'Наблюдатель'}
                </span>
              </div>

              {canCreateTask && (
                <button
                  type="button"
                  onClick={onToggleForm}
                  className={`btn ${isFormOpen ? 'btn-secondary' : 'btn-primary'}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  {isFormOpen ? 'Скрыть форму' : 'Новая задача'}
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSessions}
                className="btn btn-secondary"
                title="Управление активными подключениями"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                Сессии
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="btn btn-secondary btn-icon-only"
                title="Выйти из системы"
                aria-label="Выйти"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          ) : (
            <button type="button" onClick={onOpenAuth} className="btn btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Войти в систему
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
