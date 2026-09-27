import React from 'react';
import type { TaskFilter, TaskStats } from '../types';

interface FilterNavProps {
  currentFilter: TaskFilter;
  stats: TaskStats;
  onFilterChange: (filter: TaskFilter) => void;
}

export const FilterNav: React.FC<FilterNavProps> = ({ currentFilter, stats, onFilterChange }) => {
  return (
    <nav className="filter-nav" aria-label="Фильтрация задач">
      <div className="filter-pills">
        <button
          type="button"
          className={`filter-pill ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          Все задачи
          <span className="count-badge">{stats.total}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${currentFilter === 'pending' ? 'active' : ''}`}
          onClick={() => onFilterChange('pending')}
        >
          Ожидают
          <span className="count-badge">{stats.pending}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${currentFilter === 'in_progress' ? 'active' : ''}`}
          onClick={() => onFilterChange('in_progress')}
        >
          В работе
          <span className="count-badge">{stats.inProgress}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${currentFilter === 'completed' ? 'active' : ''}`}
          onClick={() => onFilterChange('completed')}
        >
          Завершены
          <span className="count-badge">{stats.completed}</span>
        </button>
      </div>
    </nav>
  );
};
