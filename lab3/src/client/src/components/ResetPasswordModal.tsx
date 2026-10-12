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
          <h2 className="modal-title">Ввод нового пароля</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Закрыть">
            &times;
          </button>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="reset-token" className="form-label">
              Одноразовый токен сброса <span className="required">*</span>
            </label>
            <input
              type="text"
              id="reset-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Вставьте токен из письма..."
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reset-new-password" className="form-label">
              Новый пароль <span className="required">*</span>
            </label>
            <input
              type="password"
              id="reset-new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов..."
              className="form-input"
              required
            />
          </div>

          <div className="form-actions auth-actions">
            <button type="submit" disabled={isLoading} className="btn btn-primary btn-submit-full">
              {isLoading ? 'Сохранение...' : 'Обновить пароль'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
