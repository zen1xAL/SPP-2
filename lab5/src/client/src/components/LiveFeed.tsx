import React, { useState } from 'react';
import { useSubscription } from '@apollo/client';
import { TICKER_SUBSCRIPTION, REVIEW_SUBSCRIPTION, STOCK_SUBSCRIPTION } from '../graphql/operations.js';
import type { TickerEvent, NewReviewEvent, StockUpdateEvent } from '../types.js';
import { Radio, ArrowUpRight, ArrowDownRight, MessageSquare, Warehouse, Trash2 } from 'lucide-react';

interface FeedEntry {
  id: string;
  type: 'ticker' | 'review' | 'stock';
  timestamp: string;
  data: any;
}

export const LiveFeed: React.FC = () => {
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  // 1. Подписка на изменение котировок
  useSubscription<{ tickerUpdated: TickerEvent }>(TICKER_SUBSCRIPTION, {
    onData: ({ data }) => {
      const item = data.data?.tickerUpdated;
      if (item) {
        setFeed((prev) => [
          {
            id: `ticker-${Date.now()}-${Math.random()}`,
            type: 'ticker',
            timestamp: new Date().toLocaleTimeString(),
            data: item
          },
          ...prev.slice(0, 40)
        ]);
      }
    }
  });

  // 2. Подписка на новые отзывы
  useSubscription<{ reviewAdded: NewReviewEvent }>(REVIEW_SUBSCRIPTION, {
    onData: ({ data }) => {
      const item = data.data?.reviewAdded;
      if (item) {
        setFeed((prev) => [
          {
            id: `review-${Date.now()}-${Math.random()}`,
            type: 'review',
            timestamp: new Date().toLocaleTimeString(),
            data: item
          },
          ...prev.slice(0, 40)
        ]);
      }
    }
  });

  // 3. Подписка на остатки складов
  useSubscription<{ stockUpdated: StockUpdateEvent }>(STOCK_SUBSCRIPTION, {
    onData: ({ data }) => {
      const item = data.data?.stockUpdated;
      if (item) {
        setFeed((prev) => [
          {
            id: `stock-${Date.now()}-${Math.random()}`,
            type: 'stock',
            timestamp: new Date().toLocaleTimeString(),
            data: item
          },
          ...prev.slice(0, 40)
        ]);
      }
    }
  });

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>WebSocket Subscriptions (Поток событий)</h2>
            <span className="status-pill" style={{ color: '#10b981' }}>
              <Radio size={12} className="pulse-icon" /> LIVE WS (graphql-ws)
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Сервер непрерывно транслирует изменения цен, новые пользовательские отзывы и складские перемещения по протоколу WebSocket.
          </p>
        </div>

        {feed.length > 0 && (
          <button className="btn" onClick={() => setFeed([])}>
            <Trash2 size={13} /> Очистить ленту
          </button>
        )}
      </div>

      <div style={{ maxWidth: '850px' }}>
        {feed.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              backgroundColor: '#0f172a',
              border: '1px dashed #334155',
              borderRadius: '6px',
              color: '#94a3b8'
            }}
          >
            <Radio size={24} style={{ marginBottom: '8px', opacity: 0.6 }} />
            <div>Ожидание входящих событий WebSocket...</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              (Сервер отправляет тикер каждые 4-5 секунд; также вы можете создать отзыв во вкладке «Мутации»)
            </div>
          </div>
        ) : (
          feed.map((entry) => {
            if (entry.type === 'ticker') {
              const t: TickerEvent = entry.data;
              const isPositive = t.changePercent >= 0;
              return (
                <div key={entry.id} className="feed-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isPositive ? (
                        <ArrowUpRight size={16} color="#10b981" />
                      ) : (
                        <ArrowDownRight size={16} color="#ef4444" />
                      )}
                      <span style={{ fontWeight: 600, color: '#f8fafc' }}>{t.title}</span>
                      <span className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>
                        ID: {t.productId}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="font-mono" style={{ color: '#94a3b8', textDecoration: 'line-through', fontSize: '12px' }}>
                        ${t.oldPrice.toFixed(2)}
                      </span>
                      <span className="font-mono" style={{ fontWeight: 700, color: '#38bdf8' }}>
                        ${t.newPrice.toFixed(2)}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: isPositive ? '#10b981' : '#ef4444'
                        }}
                      >
                        {isPositive ? '+' : ''}
                        {t.changePercent.toFixed(1)}%
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{entry.timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            }

            if (entry.type === 'review') {
              const r: NewReviewEvent = entry.data;
              return (
                <div key={entry.id} className="feed-item review">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MessageSquare size={14} color="#f59e0b" />
                      <strong style={{ color: '#f59e0b' }}>Новый отзыв:</strong>
                      <span style={{ color: '#f8fafc' }}>{r.productTitle}</span>
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>от {r.author}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>★ {r.rating}/5</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{entry.timestamp}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#cbd5e1', marginLeft: '20px' }}>{r.comment}</p>
                </div>
              );
            }

            if (entry.type === 'stock') {
              const s: StockUpdateEvent = entry.data;
              return (
                <div key={entry.id} className="feed-item stock">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Warehouse size={14} color="#10b981" />
                      <strong style={{ color: '#10b981' }}>Складской остаток:</strong>
                      <span style={{ color: '#f8fafc' }}>{s.warehouseName} ({s.city})</span>
                      <span className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>
                        Товар: {s.productId}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span className="font-mono" style={{ fontWeight: 700, color: '#10b981' }}>
                        {s.quantity} шт.
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{entry.timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })
        )}
      </div>
    </div>
  );
};
