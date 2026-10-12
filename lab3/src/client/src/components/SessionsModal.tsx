import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from '../types';
import { fetchSessions, revokeSession } from '../api';

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionRevoked: () => void;
}

export const SessionsModal: React.FC<SessionsModalProps> = ({
  isOpen,
  onClose,
  onSessionRevoked
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось загрузить сессии');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  if (!isOpen) return null;

  const handleRevoke = async (id: string) => {
    try {
      await revokeSession(id);
      await loadSessions();
      onSessionRevoked();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Ошибка при отзыве сессии');
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card sessions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Контроль активных подключений
          </h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Закрыть">
            &times;
          </button>
        </div>

        {errorMessage && (
          <div className="alert alert-error">
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Загрузка подключений...</span>
          </div>
        ) : sessions.length === 0 ? (
          <p className="empty-text">Нет активных сессий</p>
        ) : (
          <div className="sessions-list">
            {sessions.map((sess) => (
              <div key={sess.id} className={`session-item ${sess.isCurrent ? 'session-current' : ''}`}>
                <div className="session-info">
                  <div className="session-title-row">
                    <span className="session-email">{sess.email}</span>
                    {sess.isCurrent && <span className="badge badge-current">Текущее устройство</span>}
                    {sess.isRevoked && <span className="badge badge-revoked">Отозвана</span>}
                    {sess.isExpired && !sess.isRevoked && <span className="badge badge-expired">Истекла</span>}
                  </div>
                  <div className="session-meta">
                    <span>IP: <strong>{sess.ipAddress}</strong></span>
                    <span>Браузер: {sess.userAgent}</span>
                  </div>
                  <div className="session-dates">
                    <span>Создана: {formatDate(sess.createdAt)}</span>
                    <span>Истекает: {formatDate(sess.expiresAt)}</span>
                  </div>
                </div>

                {!sess.isRevoked && !sess.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(sess.id)}
                    className="btn btn-secondary btn-revoke"
                    title="Принудительно завершить сессию"
                  >
                    Завершить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
