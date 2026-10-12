import React, { useState } from 'react';
import { resetPassword } from '../api';

interface ResetPasswordModalProps {
  isOpen: boolean;
  initialToken?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  initialToken = '',
  onClose,
  onSuccess
}) => {
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await resetPassword(token, newPassword);
      onSuccess(res.message);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Ошибка сброса пароля');
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Ввод нового пароля</h2>
              <p className="modal-subtitle">Подтверждение одноразового токена из письма</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-close" aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form-fields">
          <div className="form-field">
            <label htmlFor="reset-token" className="field-label">
              Одноразовый токен сброса
            </label>
            <input
              type="text"
              id="reset-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="32-байтный hex-токен..."
              className="field-input font-mono"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="reset-password" className="field-label">
              Новый пароль
            </label>
            <input
              type="password"
              id="reset-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов..."
              className="field-input"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary btn-block btn-lg"
          >
            {isLoading ? 'Обновление...' : 'Сохранить новый пароль'}
          </button>
        </form>
      </div>
    </div>
  );
};
