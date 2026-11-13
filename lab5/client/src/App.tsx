import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { Header, type TabType } from './components/Header.js';
import { Catalog } from './components/Catalog.js';
import { MutationsForm } from './components/MutationsForm.js';
import { LiveFeed } from './components/LiveFeed.js';
import { QueryStudio } from './components/QueryStudio.js';
import { Metrics } from './components/Metrics.js';
import { GET_SYSTEM_METRICS } from './graphql/operations.js';
import type { DatabaseStats, SystemMetrics } from './types.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('catalog');

  const { data } = useQuery<{
    systemMetrics: SystemMetrics;
    databaseStats: DatabaseStats;
  }>(GET_SYSTEM_METRICS, {
    pollInterval: 5000
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalRecords={data?.databaseStats?.totalRecords}
      />

      <main style={{ flex: 1, paddingBottom: '40px' }}>
        {activeTab === 'catalog' && <Catalog />}
        {activeTab === 'mutations' && <MutationsForm />}
        {activeTab === 'feed' && <LiveFeed />}
        {activeTab === 'studio' && <QueryStudio />}
        {activeTab === 'metrics' && <Metrics />}
      </main>

      <footer
        style={{
          borderTop: '1px solid #1e293b',
          padding: '16px 24px',
          backgroundColor: '#090d16',
          fontSize: '12px',
          color: '#64748b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          СПП (7 семестр) – Лабораторная работа №5: Клиент-серверное GraphQL-приложение & Apollo Federation v2
        </div>
        <div className="font-mono">
          DataLoader N+1 Solved • Query Complexity Limiter • WebSocket graphql-ws
        </div>
      </footer>
    </div>
  );
};

