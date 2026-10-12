import React from 'react';
import type { TaskFilter, TaskStats } from '../types';

interface MetricsGridProps {
  stats: TaskStats;
  currentFilter: TaskFilter;
  onSelectFilter: (filter: TaskFilter) => void;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ stats, currentFilter, onSelectFilter }) => {
  return (
    <section className="metrics-grid">
      <div
        className={`metric-card ${currentFilter === 'all' ? 'active' : ''}`}
        onClick={() => onSelectFilter('all')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-label">Всего задач</span>
          <span className="metric-indicator indicator-neutral"></span>
        </div>
        <span className="metric-value">{stats.total}</span>
      </div>

      <div
        className={`metric-card metric-pending ${currentFilter === 'pending' ? 'active' : ''}`}
        onClick={() => onSelectFilter('pending')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-label">Ожидают</span>
          <span className="metric-indicator indicator-amber"></span>
        </div>
        <span className="metric-value">{stats.pending}</span>
      </div>

      <div
        className={`metric-card metric-progress ${currentFilter === 'in_progress' ? 'active' : ''}`}
        onClick={() => onSelectFilter('in_progress')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-label">В работе</span>
          <span className="metric-indicator indicator-blue"></span>
        </div>
        <span className="metric-value">{stats.inProgress}</span>
      </div>

      <div
        className={`metric-card metric-completed ${currentFilter === 'completed' ? 'active' : ''}`}
        onClick={() => onSelectFilter('completed')}
        role="button"
        tabIndex={0}
      >
        <div className="metric-header">
          <span className="metric-label">Завершены</span>
          <span className="metric-indicator indicator-green"></span>
        </div>
        <span className="metric-value">{stats.completed}</span>
      </div>

      {stats.overdue > 0 && (
        <div className="metric-card metric-overdue">
          <div className="metric-header">
            <span className="metric-label">Просрочено</span>
            <span className="metric-indicator indicator-red"></span>
          </div>
          <span className="metric-value">{stats.overdue}</span>
        </div>
      )}
    </section>
  );
};
