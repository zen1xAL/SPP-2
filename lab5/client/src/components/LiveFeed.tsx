import React, { useState } from 'react';
import { useSubscription } from '@apollo/client';
import { TICKER_SUBSCRIPTION, REVIEW_SUBSCRIPTION, STOCK_SUBSCRIPTION } from '../graphql/operations.js';
import type { TickerEvent, NewReviewEvent, StockUpdateEvent } from '../types.js';
import { Radio, ArrowUpRight, ArrowDownRight, MessageSquare, Warehouse, Trash2 } from 'lucide-react';
import { FEED_CONFIG, CLIENT_THEME } from '../constants.js';

type FeedEntry =
  | { id: string; type: 'ticker'; timestamp: string; data: TickerEvent }
  | { id: string; type: 'review'; timestamp: string; data: NewReviewEvent }
  | { id: string; type: 'stock'; timestamp: string; data: StockUpdateEvent };

const TickerFeedCard: React.FC<{ entry: Extract<FeedEntry, { type: 'ticker' }> }> = ({ entry }) => {
  const t = entry.data;
  const isPositive = t.changePercent >= 0;

  return (
    <div className="feed-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isPositive ? (
            <ArrowUpRight size={16} color={CLIENT_THEME.colors.success} />
          ) : (
            <ArrowDownRight size={16} color={CLIENT_THEME.colors.danger} />
          )}
          <span style={{ fontWeight: 600, color: CLIENT_THEME.colors.textLight }}>{t.title}</span>
          <span className="font-mono" style={{ fontSize: '11px', color: CLIENT_THEME.colors.textMuted }}>
            ID: {t.productId}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="font-mono" style={{ color: CLIENT_THEME.colors.textSecondary, textDecoration: 'line-through', fontSize: '12px' }}>
            ${t.oldPrice.toFixed(2)}
          </span>
          <span className="font-mono" style={{ fontWeight: 700, color: CLIENT_THEME.colors.primary }}>
            ${t.newPrice.toFixed(2)}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: isPositive ? CLIENT_THEME.colors.success : CLIENT_THEME.colors.danger
            }}
          >
            {isPositive ? '+' : ''}
            {t.changePercent.toFixed(1)}%
          </span>
          <span style={{ fontSize: '11px', color: CLIENT_THEME.colors.textMuted }}>{entry.timestamp}</span>
        </div>
      </div>
    </div>
  );
};

const ReviewFeedCard: React.FC<{ entry: Extract<FeedEntry, { type: 'review' }> }> = ({ entry }) => {
  const r = entry.data;

  return (
    <div className="feed-item review">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageSquare size={14} color={CLIENT_THEME.colors.warning} />
          <strong style={{ color: CLIENT_THEME.colors.warning }}>Новый отзыв:</strong>
          <span style={{ color: CLIENT_THEME.colors.textLight }}>{r.productTitle}</span>
          <span style={{ color: CLIENT_THEME.colors.textSecondary, fontSize: '12px' }}>от {r.author}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: CLIENT_THEME.colors.warning, fontWeight: 600 }}>★ {r.rating}/5</span>
          <span style={{ fontSize: '11px', color: CLIENT_THEME.colors.textMuted }}>{entry.timestamp}</span>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: '#cbd5e1', marginLeft: '20px' }}>{r.comment}</p>
    </div>
  );
};

const StockFeedCard: React.FC<{ entry: Extract<FeedEntry, { type: 'stock' }> }> = ({ entry }) => {
  const s = entry.data;

  return (
    <div className="feed-item stock">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Warehouse size={14} color={CLIENT_THEME.colors.success} />
          <strong style={{ color: CLIENT_THEME.colors.success }}>Складской остаток:</strong>
          <span style={{ color: CLIENT_THEME.colors.textLight }}>{s.warehouseName} ({s.city})</span>
          <span className="font-mono" style={{ fontSize: '11px', color: CLIENT_THEME.colors.textMuted }}>
            Товар: {s.productId}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className="font-mono" style={{ fontWeight: 700, color: CLIENT_THEME.colors.success }}>
            {s.quantity} шт.
          </span>
          <span style={{ fontSize: '11px', color: CLIENT_THEME.colors.textMuted }}>{entry.timestamp}</span>
        </div>
      </div>
    </div>
  );
};

export const LiveFeed: React.FC = () => {
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const appendEntry = (type: FeedEntry['type'], data: FeedEntry['data']) => {
    const newEntry = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      timestamp: new Date().toLocaleTimeString(),
      data
    } as FeedEntry;

    setFeed((prev) => [newEntry, ...prev.slice(0, FEED_CONFIG.MAX_ENTRIES_RETAINED)]);
  };

  useSubscription<{ tickerUpdated: TickerEvent }>(TICKER_SUBSCRIPTION, {
    onData: ({ data }) => {
      if (data.data?.tickerUpdated) {
        appendEntry('ticker', data.data.tickerUpdated);
      }
    }
  });

  useSubscription<{ reviewAdded: NewReviewEvent }>(REVIEW_SUBSCRIPTION, {
    onData: ({ data }) => {
      if (data.data?.reviewAdded) {
        appendEntry('review', data.data.reviewAdded);
      }
    }
  });

  useSubscription<{ stockUpdated: StockUpdateEvent }>(STOCK_SUBSCRIPTION, {
    onData: ({ data }) => {
      if (data.data?.stockUpdated) {
        appendEntry('stock', data.data.stockUpdated);
      }
    }
  });

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>WebSocket Subscriptions (Поток событий)</h2>
            <span className="status-pill" style={{ color: CLIENT_THEME.colors.success }}>
              <Radio size={12} className="pulse-icon" /> LIVE WS (graphql-ws)
            </span>
          </div>
          <p style={{ fontSize: '13px', color: CLIENT_THEME.colors.textSecondary, marginTop: '4px' }}>
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
              backgroundColor: CLIENT_THEME.colors.bgSurface,
              border: `1px dashed ${CLIENT_THEME.colors.borderDashed}`,
              borderRadius: '6px',
              color: CLIENT_THEME.colors.textSecondary
            }}
          >
            <Radio size={24} style={{ marginBottom: '8px', opacity: 0.6 }} />
            <div>Ожидание входящих событий WebSocket...</div>
            <div style={{ fontSize: '12px', color: CLIENT_THEME.colors.textMuted, marginTop: '4px' }}>
              (Сервер отправляет тикер каждые 4-5 секунд; также вы можете создать отзыв во вкладке «Мутации»)
            </div>
          </div>
        ) : (
          feed.map((entry) => {
            switch (entry.type) {
              case 'ticker':
                return <TickerFeedCard key={entry.id} entry={entry} />;
              case 'review':
                return <ReviewFeedCard key={entry.id} entry={entry} />;
              case 'stock':
                return <StockFeedCard key={entry.id} entry={entry} />;
            }
          })
        )}
      </div>
    </div>
  );
};
