import React from 'react';
import { Database, Network, Activity, Layers, Terminal } from 'lucide-react';

export type TabType = 'catalog' | 'mutations' | 'feed' | 'studio' | 'metrics';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  totalRecords?: number;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, totalRecords }) => {
  return (
    <header className="app-header">
      <div className="brand-section">
        <h1 className="brand-title">Marketplace Hub</h1>
        <span className="brand-tag">GraphQL Federation v2</span>
      </div>

      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => onTabChange('catalog')}
        >
          <Database size={14} />
          Каталог & Relay
        </button>
        <button
          className={`tab-btn ${activeTab === 'mutations' ? 'active' : ''}`}
          onClick={() => onTabChange('mutations')}
        >
          <Layers size={14} />
          Мутации
        </button>
        <button
          className={`tab-btn ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => onTabChange('feed')}
        >
          <Activity size={14} />
          WebSocket Live
        </button>
        <button
          className={`tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => onTabChange('studio')}
        >
          <Terminal size={14} />
          Query Studio
        </button>
        <button
          className={`tab-btn ${activeTab === 'metrics' ? 'active' : ''}`}
          onClick={() => onTabChange('metrics')}
        >
          <Network size={14} />
          Мониторинг & Federation
        </button>
      </nav>

      <div className="system-status-pills">
        <div className="status-pill">
          <span className="status-dot"></span>
          <span>100% GraphQL</span>
        </div>
        {totalRecords !== undefined && (
          <div className="status-pill font-mono">
            <span>База:</span>
            <strong style={{ color: '#38bdf8' }}>{totalRecords.toLocaleString()}</strong>
            <span>записей</span>
          </div>
        )}
      </div>
    </header>
  );
};
