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
      <div className="segmented-control">
        <button
          type="button"
          className={`segment-btn ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          <span>Все задачи</span>
          <span className="segment-count">{stats.total}</span>
        </button>
        <button
          type="button"
          className={`segment-btn ${currentFilter === 'pending' ? 'active' : ''}`}
          onClick={() => onFilterChange('pending')}
        >
          <span>Ожидают</span>
          <span className="segment-count">{stats.pending}</span>
        </button>
        <button
          type="button"
          className={`segment-btn ${currentFilter === 'in_progress' ? 'active' : ''}`}
          onClick={() => onFilterChange('in_progress')}
        >
          <span>В работе</span>
          <span className="segment-count">{stats.inProgress}</span>
        </button>
        <button
          type="button"
          className={`segment-btn ${currentFilter === 'completed' ? 'active' : ''}`}
          onClick={() => onFilterChange('completed')}
        >
          <span>Завершены</span>
          <span className="segment-count">{stats.completed}</span>
        </button>
      </div>
    </nav>
  );
};
