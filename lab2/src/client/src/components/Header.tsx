import React from 'react';

interface HeaderProps {
  onToggleForm: () => void;
  isFormOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleForm, isFormOpen }) => {
  return (
    <header className="app-header">
      <div className="container header-content">
        <div className="brand">
          <div className="brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
              <path d="M7 7h.01"></path>
            </svg>
          </div>
          <div>
            <h1 className="brand-title">TaskFlow SPA</h1>
            <p className="brand-subtitle">Лабораторная работа №2 (React + Express + PostgreSQL)</p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onToggleForm} className="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            {isFormOpen ? 'Скрыть форму' : 'Новая задача'}
          </button>
        </div>
      </div>
    </header>
  );
};
