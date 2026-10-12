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
          <h2 className="modal-title">
            {tab === 'login' && 'Вход в TaskFlow'}
            {tab === 'register' && 'Регистрация пользователя'}
            {tab === 'forgot' && 'Восстановление доступа'}
          </h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Закрыть">
            &times;
          </button>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setErrorMessage(''); }}
          >
            Вход
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setErrorMessage(''); }}
          >
            Регистрация
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'forgot' ? 'active' : ''}`}
            onClick={() => { setTab('forgot'); setErrorMessage(''); }}
          >
            Сброс пароля
          </button>
        </div>

        {tab === 'login' && (
          <div className="quick-login-panel">
            <span className="quick-login-label">Быстрый вход для проверки ролей (Seed):</span>
            <div className="quick-login-buttons">
              <button
                type="button"
                className="btn-quick-login role-admin"
                onClick={() => handleQuickLogin('admin@taskflow.local', 'AdminPass123!')}
              >
                Администратор
              </button>
              <button
                type="button"
                className="btn-quick-login role-manager"
                onClick={() => handleQuickLogin('manager@taskflow.local', 'ManagerPass123!')}
              >
                Менеджер
              </button>
              <button
                type="button"
                className="btn-quick-login role-viewer"
                onClick={() => handleQuickLogin('viewer@taskflow.local', 'ViewerPass123!')}
              >
                Наблюдатель
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
            {retryCountdown !== null && (
              <span className="retry-timer">Блокировка: {retryCountdown} сек.</span>
            )}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success">
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="auth-email" className="form-label">
              Электронная почта (Email) <span className="required">*</span>
            </label>
            <input
              type="email"
              id="auth-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@taskflow.local"
              className="form-input"
              required
            />
          </div>

          {tab !== 'forgot' && (
            <div className="form-group">
              <label htmlFor="auth-password" className="form-label">
                Пароль <span className="required">*</span>
              </label>
              <input
                type="password"
                id="auth-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов..."
                className="form-input"
                required
              />
            </div>
          )}

          {tab === 'register' && (
            <div className="form-group">
              <label htmlFor="auth-role" className="form-label">Назначаемая роль</label>
              <select
                id="auth-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="form-select"
              >
                <option value="viewer">Наблюдатель (viewer) – только чтение</option>
                <option value="manager">Менеджер (manager) – управление задачами</option>
                <option value="admin">Администратор (admin) – полный доступ</option>
              </select>
            </div>
          )}

          <div className="form-actions auth-actions">
            <button
              type="submit"
              disabled={isLoading || retryCountdown !== null}
              className="btn btn-primary btn-submit-full"
            >
              {isLoading
                ? 'Обработка...'
                : tab === 'login'
                ? 'Войти'
                : tab === 'register'
                ? 'Зарегистрироваться'
                : 'Отправить ссылку сброса'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
