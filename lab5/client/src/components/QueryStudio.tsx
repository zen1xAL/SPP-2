import React, { useState } from 'react';
import { useApolloClient, gql } from '@apollo/client';
import { Play, ShieldAlert, Cpu } from 'lucide-react';
import { CLIENT_THEME, formatClientError } from '../constants.js';

interface QueryEstimate {
  depth: number;
  cost: number;
}

function estimateQueryBudget(
  limit: number,
  includeReviews: boolean,
  includeInventory: boolean,
  includePriceHistory: boolean
): QueryEstimate {
  let depth = 4;
  let cost = 2 + limit * 5;

  if (includeReviews) {
    depth = Math.max(depth, 5);
    cost += limit * 8;
  }
  if (includeInventory) {
    depth = Math.max(depth, 5);
    cost += limit * 6;
  }
  if (includePriceHistory) {
    depth = Math.max(depth, 5);
    cost += limit * 15;
  }

  return { depth, cost };
}

export const QueryStudio: React.FC = () => {
  const client = useApolloClient();

  const [limit, setLimit] = useState(3);
  const [includeDescription, setIncludeDescription] = useState(false);
  const [includeBrand, setIncludeBrand] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [includeInventory, setIncludeInventory] = useState(true);
  const [includePriceHistory, setIncludePriceHistory] = useState(false);

  const [executing, setExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<string>('Нажмите «Выполнить GraphQL запрос» для получения ответа сервера...');
  const [executionTime, setExecutionTime] = useState<number | null>(null);

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
      ? `\n        reviews {
          id
          author
          rating
          comment
        }`
      : ''
  }${
    includeInventory
      ? `\n        inventory {
          warehouseName
          city
          quantity
        }`
      : ''
  }${
    includePriceHistory
      ? `\n        priceHistory {
          price
          recordedAt
        }`
      : ''
  }
      }
    }
  }
}`;

  const { depth: estimatedDepth, cost: estimatedCost } = estimateQueryBudget(
    limit,
    includeReviews,
    includeInventory,
    includePriceHistory
  );

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
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - startTime);
      setExecutionTime(duration);
      setQueryResult(JSON.stringify({ error: formatClientError(err) }, null, 2));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Dynamic Query Studio & Complexity Meter</h2>
        <p style={{ fontSize: '13px', color: CLIENT_THEME.colors.textSecondary }}>
          Динамическое конструирование произвольных GraphQL-запросов с расчетом веса сложности (Query Complexity Limiter) и трассировкой времени резолверов.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: CLIENT_THEME.colors.textLight, marginBottom: '12px' }}>
          Конфигуратор запрашиваемых полей и уровней вложенности:
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', color: CLIENT_THEME.colors.textSecondary, marginRight: '8px' }}>Лимит записей (first):</label>
            <input
              type="number"
              min={1}
              max={50}
              className="input-field font-mono"
              style={{ width: '70px', display: 'inline-block' }}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
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

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: CLIENT_THEME.colors.warning }}>
            <input
              type="checkbox"
              checked={includeReviews}
              onChange={(e) => setIncludeReviews(e.target.checked)}
            />
            <span>+ reviews (Subgraph Reviews)</span>
          </label>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: CLIENT_THEME.colors.success }}>
            <input
              type="checkbox"
              checked={includeInventory}
              onChange={(e) => setIncludeInventory(e.target.checked)}
            />
            <span>+ inventory (Subgraph Inventory)</span>
          </label>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: CLIENT_THEME.colors.primary }}>
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
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: CLIENT_THEME.colors.textSecondary }}>СГЕНЕРИРОВАННЫЙ GRAPHQL ЗАПРОС</span>
            <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
              <Play size={14} /> {executing ? 'Запрос...' : 'Выполнить GraphQL'}
            </button>
          </div>

          <div className="code-editor">{dynamicQueryString}</div>

          <div className="complexity-meter">
            <Cpu size={16} color={CLIENT_THEME.colors.primary} />
            <div>
              <span>Глубина AST: </span>
              <strong style={{ color: estimatedDepth > 6 ? CLIENT_THEME.colors.danger : CLIENT_THEME.colors.primary }}>{estimatedDepth} / 6</strong>
              {' • '}
              <span>Сложность: </span>
              <strong style={{ color: isOverBudget ? CLIENT_THEME.colors.danger : CLIENT_THEME.colors.success }}>{estimatedCost} / 500</strong>
            </div>

            {isOverBudget && (
              <div style={{ color: CLIENT_THEME.colors.danger, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                <ShieldAlert size={14} /> Превышен лимит!
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: CLIENT_THEME.colors.textSecondary }}>ОТВЕТ СЕРВЕРА (JSON & TRACING)</span>
            {executionTime !== null && (
              <span className="font-mono" style={{ fontSize: '12px', color: CLIENT_THEME.colors.success }}>
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
