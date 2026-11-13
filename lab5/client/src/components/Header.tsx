import React from 'react';
import { Database, Network, Activity, Layers, Terminal } from 'lucide-react';
import { TABS_CONFIG, CLIENT_THEME, type TabConfigItem } from '../constants.js';

export type TabType = 'catalog' | 'mutations' | 'feed' | 'studio' | 'metrics';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  totalRecords?: number;
}

function renderTabIcon(icon: TabConfigItem['icon']): React.ReactElement {
  switch (icon) {
    case 'Database':
      return <Database size={14} />;
    case 'Layers':
      return <Layers size={14} />;
    case 'Activity':
      return <Activity size={14} />;
    case 'Terminal':
      return <Terminal size={14} />;
    case 'Network':
      return <Network size={14} />;
  }
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, totalRecords }) => {
  return (
    <header className="app-header">
      <div className="brand-section">
        <h1 className="brand-title">Marketplace Hub</h1>
        <span className="brand-tag">GraphQL Federation v2</span>
      </div>

      <nav className="tabs-nav">
        {TABS_CONFIG.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {renderTabIcon(tab.icon)}
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="system-status-pills">
        <div className="status-pill">
          <span className="status-dot"></span>
          <span>100% GraphQL</span>
        </div>
        {totalRecords !== undefined && (
          <div className="status-pill font-mono">
            <span>База:</span>
            <strong style={{ color: CLIENT_THEME.colors.primary }}>{totalRecords.toLocaleString()}</strong>
            <span>записей</span>
          </div>
        )}
      </div>
    </header>
  );
};
