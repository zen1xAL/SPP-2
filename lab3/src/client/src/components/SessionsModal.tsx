import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from '../types';
import { fetchSessions, revokeSession } from '../api';

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionRevoked: () => void;
}

function cleanIp(ip: string): string {
  return ip.replace(/^.*::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

function parseUserAgent(ua: string): { browser: string; os: string } {
  let os = 'Неизвестная ОС';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  let browser = 'Браузер';
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    browser = `Edge ${match ? match[1].split('.')[0] : ''}`.trim();
  } else if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    browser = `Chrome ${match ? match[1].split('.')[0] : ''}`.trim();
  } else if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    browser = `Firefox ${match ? match[1].split('.')[0] : ''}`.trim();
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const match = ua.match(/Version\/([\d.]+)/);
    browser = `Safari ${match ? match[1].split('.')[0] : ''}`.trim();
  }

  return { browser, os };
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
          <div className="modal-title-wrap">
            <div className="modal-title-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Активные сессии</h2>
              <p className="modal-subtitle">Контроль подключенных устройств и безопасности аккаунта</p>
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

        {isLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Загрузка подключений...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <p>Нет активных сессий</p>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map((sess) => {
              const { browser, os } = parseUserAgent(sess.userAgent);
              const ip = cleanIp(sess.ipAddress);
              return (
                <div key={sess.id} className={`session-card ${sess.isCurrent ? 'session-card-current' : ''}`}>
                  <div className="session-card-header">
                    <div className="session-device">
                      <div className="session-device-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                          <line x1="8" y1="21" x2="16" y2="21"></line>
                          <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                      </div>
                      <div className="session-device-info">
                        <div className="session-device-name">
                          <span>{browser}</span>
                          <span className="session-divider">/</span>
                          <span className="session-os">{os}</span>
                        </div>
                        <div className="session-ip-row">
                          <code className="session-ip">{ip}</code>
                          <span className="session-email-tag">{sess.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="session-status-wrap">
                      {sess.isCurrent && (
                        <span className="status-pill status-pill-active">
                          <span className="pulse-dot"></span>
                          Текущая сессия
                        </span>
                      )}
                      {sess.isRevoked && (
                        <span className="status-pill status-pill-revoked">
                          Отозвана
                        </span>
                      )}
                      {sess.isExpired && !sess.isRevoked && (
                        <span className="status-pill status-pill-expired">
                          Истекла
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="session-card-footer">
                    <div className="session-time-info">
                      <span className="session-time-item">Создана: {formatDate(sess.createdAt)}</span>
                      <span className="session-divider">•</span>
                      <span className="session-time-item">Истекает: {formatDate(sess.expiresAt)}</span>
                    </div>

                    {!sess.isRevoked && !sess.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(sess.id)}
                        className="btn btn-danger-ghost btn-sm"
                        title="Отозвать данную сессию"
                      >
                        Отозвать
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
