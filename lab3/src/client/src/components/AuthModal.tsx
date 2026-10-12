import React, { useState, useEffect } from 'react';
import type { UserRole } from '../types';
import { login, register, forgotPassword, ApiError } from '../api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenResetPassword: (previewToken?: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenResetPassword
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (retryCountdown !== null && retryCountdown > 0) {
      timer = setTimeout(() => {
        setRetryCountdown((prev) => (prev && prev > 1 ? prev - 1 : null));
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [retryCountdown]);

  if (!isOpen) return null;

  const handleQuickLogin = async (userEmail: string, userPass: string) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      await login(userEmail, userPass);
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        setRetryCountdown(err.retryAfterSeconds || 60);
      }
      setErrorMessage(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (tab === 'login') {
        await login(email, password);
        onSuccess();
        onClose();
      } else if (tab === 'register') {
        await register(email, password, role);
        setSuccessMessage('Регистрация успешна! Теперь вы можете войти в систему.');
        setTab('login');
      } else if (tab === 'forgot') {
        const res = await forgotPassword(email);
        setSuccessMessage(res.message);
        if (res.previewToken) {
          onClose();
          onOpenResetPassword(res.previewToken);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        setRetryCountdown(err.retryAfterSeconds || 60);
      }
      setErrorMessage(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-title-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <div>
              <h2 className="modal-title">
                {tab === 'login' && 'Авторизация в TaskFlow'}
                {tab === 'register' && 'Регистрация аккаунта'}
                {tab === 'forgot' && 'Восстановление доступа'}
              </h2>
              <p className="modal-subtitle">
                {tab === 'login' && 'Временные ключи JWT и защита от подбора паролей'}
                {tab === 'register' && 'Создание новой учетной записи с заданной ролью'}
                {tab === 'forgot' && 'Одноразовая ссылка восстановления через электронную почту'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-close" aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="auth-segmented-nav">
          <button
            type="button"
            className={`auth-nav-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setErrorMessage(''); }}
          >
            Вход
          </button>
          <button
            type="button"
            className={`auth-nav-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setErrorMessage(''); }}
          >
            Регистрация
          </button>
          <button
            type="button"
            className={`auth-nav-btn ${tab === 'forgot' ? 'active' : ''}`}
            onClick={() => { setTab('forgot'); setErrorMessage(''); }}
          >
            Сброс пароля
          </button>
        </div>

        {tab === 'login' && (
          <div className="quick-login-box">
            <div className="quick-login-header">
              <span className="quick-login-title">Тестовый вход (Seed-пользователи)</span>
              <span className="quick-login-hint">1 клик для проверки ролей</span>
            </div>
            <div className="quick-login-row">
              <button
                type="button"
                className="btn-seed-role"
                onClick={() => handleQuickLogin('admin@taskflow.local', 'AdminPass123!')}
              >
                <span className="seed-role-tag tag-admin">ADMIN</span>
                <span className="seed-role-desc">Администратор</span>
              </button>
              <button
                type="button"
                className="btn-seed-role"
                onClick={() => handleQuickLogin('manager@taskflow.local', 'ManagerPass123!')}
              >
                <span className="seed-role-tag tag-manager">MANAGER</span>
                <span className="seed-role-desc">Менеджер</span>
              </button>
              <button
                type="button"
                className="btn-seed-role"
                onClick={() => handleQuickLogin('viewer@taskflow.local', 'ViewerPass123!')}
              >
                <span className="seed-role-tag tag-viewer">VIEWER</span>
                <span className="seed-role-desc">Наблюдатель</span>
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
            {retryCountdown !== null && (
              <span className="retry-timer">Блокировка: {retryCountdown} с</span>
            )}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success">
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form-fields">
          <div className="form-field">
            <label htmlFor="auth-email" className="field-label">
              Электронная почта
            </label>
            <input
              type="email"
              id="auth-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@taskflow.local"
              className="field-input"
              required
            />
          </div>

          {tab !== 'forgot' && (
            <div className="form-field">
              <label htmlFor="auth-password" className="field-label">
                Пароль
              </label>
              <input
                type="password"
                id="auth-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field-input"
                required
              />
            </div>
          )}

          {tab === 'register' && (
            <div className="form-field">
              <label htmlFor="auth-role" className="field-label">Назначаемая роль</label>
              <select
                id="auth-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="field-select"
              >
                <option value="viewer">Наблюдатель (viewer) – только чтение</option>
                <option value="manager">Менеджер (manager) – управление задачами</option>
                <option value="admin">Администратор (admin) – полный доступ</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || retryCountdown !== null}
            className="btn btn-primary btn-block btn-lg"
          >
            {isLoading
              ? 'Проверка запроса...'
              : tab === 'login'
              ? 'Войти в систему'
              : tab === 'register'
              ? 'Зарегистрироваться'
              : 'Отправить ссылку сброса'}
          </button>
        </form>
      </div>
    </div>
  );
};
