import React, { useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { gql } from '@apollo/client';
import { Play, ShieldAlert, Cpu } from 'lucide-react';

export const QueryStudio: React.FC = () => {
  const client = useApolloClient();

  const [limit, setLimit] = useState(3);
  const [includeDescription, setIncludeDescription] = useState(false);
  const [includeBrand, setIncludeBrand] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [includeInventory, setIncludeInventory] = useState(true);
  const [includePriceHistory, setIncludePriceHistory] = useState(false);

  const [executing, setExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<string>('// Нажмите «Выполнить GraphQL запрос» для получения ответа сервера...');
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Динамическое формирование строки запроса GraphQL
  const dynamicQueryString = `query DynamicCatalogQuery {
  products(first: ${limit}) {
    totalCount
    edges {
      node {
        id
        title
        price
        category
        rating${includeBrand ? '\n        brand' : ''}${includeDescription ? '\n        description' : ''}${
    includeReviews
      ? `\n        # Поле из Federated Subgraph: reviews
        reviews {
          id
          author
          rating
          comment
        }`
      : ''
  }${
    includeInventory
      ? `\n        # Поле из Federated Subgraph: inventory
        inventory {
          warehouseName
          city
          quantity
        }`
      : ''
  }${
    includePriceHistory
      ? `\n        # Вложенный массив: priceHistory
        priceHistory {
          price
          recordedAt
        }`
      : ''
  }
      }
    }
  }
}`;

  // Расчет сложности (Complexity & Depth) на клиенте для мгновенной обратной связи
  let estimatedDepth = 4;
  let estimatedCost = 2 + limit * 5;
  if (includeReviews) {
    estimatedDepth = Math.max(estimatedDepth, 5);
    estimatedCost += limit * 8;
  }
  if (includeInventory) {
    estimatedDepth = Math.max(estimatedDepth, 5);
    estimatedCost += limit * 6;
  }
  if (includePriceHistory) {
    estimatedDepth = Math.max(estimatedDepth, 5);
    estimatedCost += limit * 15;
  }

  const isOverBudget = estimatedCost > 500 || estimatedDepth > 6;

  const handleExecute = async () => {
    setExecuting(true);
    setExecutionTime(null);

    const startTime = performance.now();
    try {
      const response = await client.query({
        query: gql(dynamicQueryString),
        fetchPolicy: 'no-cache'
      });
      const duration = Math.round(performance.now() - startTime);
      setExecutionTime(duration);
      setQueryResult(JSON.stringify(response.data, null, 2));
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      setExecutionTime(duration);
      setQueryResult(JSON.stringify({ error: err.message, networkError: err.networkError }, null, 2));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Dynamic Query Studio & Complexity Meter</h2>
        <p style={{ fontSize: '13px', color: '#94a3b8' }}>
          Динамическое конструирование произвольных GraphQL-запросов с расчетом веса сложности (Query Complexity Limiter) и трассировкой времени резолверов.
        </p>
      </div>

      {/* Панель настройки динамических полей */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>
          Конфигуратор запрашиваемых полей и уровней вложенности:
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', marginRight: '8px' }}>Лимит записей (first):</label>
            <input
              type="number"
              min={1}
              max={50}
              className="input-field font-mono"
              style={{ width: '70px', display: 'inline-block' }}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeBrand}
              onChange={(e) => setIncludeBrand(e.target.checked)}
            />
            <span>brand</span>
          </label>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeDescription}
              onChange={(e) => setIncludeDescription(e.target.checked)}
            />
            <span>description</span>
          </label>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#f59e0b' }}>
            <input
              type="checkbox"
              checked={includeReviews}
              onChange={(e) => setIncludeReviews(e.target.checked)}
            />
            <span>+ reviews (Subgraph Reviews)</span>
          </label>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#10b981' }}>
            <input
              type="checkbox"
              checked={includeInventory}
              onChange={(e) => setIncludeInventory(e.target.checked)}
            />
            <span>+ inventory (Subgraph Inventory)</span>
          </label>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#38bdf8' }}>
            <input
              type="checkbox"
              checked={includePriceHistory}
              onChange={(e) => setIncludePriceHistory(e.target.checked)}
            />
            <span>+ priceHistory (25 срезов)</span>
          </label>
        </div>
      </div>

      <div className="query-studio-container">
        {/* Левая колонка: Сгенерированный код GraphQL */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>СГЕНЕРИРОВАННЫЙ GRAPHQL ЗАПРОС</span>
            <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
              <Play size={14} /> {executing ? 'Запрос...' : 'Выполнить GraphQL'}
            </button>
          </div>

          <div className="code-editor">{dynamicQueryString}</div>

          <div className="complexity-meter">
            <Cpu size={16} color="#38bdf8" />
            <div>
              <span>Глубина AST: </span>
              <strong style={{ color: estimatedDepth > 6 ? '#ef4444' : '#38bdf8' }}>{estimatedDepth} / 6</strong>
              {' • '}
              <span>Сложность: </span>
              <strong style={{ color: isOverBudget ? '#ef4444' : '#10b981' }}>{estimatedCost} / 500</strong>
            </div>

            {isOverBudget && (
              <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                <ShieldAlert size={14} /> Превышен лимит!
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка: Результат ответа */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>ОТВЕТ СЕРВЕРА (JSON & TRACING)</span>
            {executionTime !== null && (
              <span className="font-mono" style={{ fontSize: '12px', color: '#10b981' }}>
                RTT: {executionTime} мс
              </span>
            )}
          </div>

          <div className="result-box">{queryResult}</div>
        </div>
      </div>
    </div>
  );
};
