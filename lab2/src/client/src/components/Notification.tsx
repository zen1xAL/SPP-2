import React from 'react';

interface NotificationProps {
  type: 'error' | 'success';
  message: string;
  onClose: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ type, message, onClose }) => {
  if (!message) return null;

  return (
    <div className={`alert alert-${type}`} role="alert">
      {type === 'error' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      )}
      <span>{message}</span>
      <button type="button" onClick={onClose} className="alert-close" aria-label="Закрыть">
        &times;
      </button>
    </div>
  );
};
