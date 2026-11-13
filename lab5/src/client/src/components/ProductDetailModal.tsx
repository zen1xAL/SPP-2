import React from 'react';
import { useQuery } from '@apollo/client';
import { GET_PRODUCT_DETAILS } from '../graphql/operations.js';
import type { Product } from '../types.js';
import { X, Star, Warehouse, Clock, MessageSquare } from 'lucide-react';

interface ProductDetailModalProps {
  productId: string;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ productId, onClose }) => {
  const { data, loading, error } = useQuery<{ product: Product }>(GET_PRODUCT_DETAILS, {
    variables: { id: productId }
  });

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            Загрузка связного графа товара из подграфов Apollo Federation...
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.product) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div style={{ color: '#ef4444', padding: '20px' }}>
            Ошибка загрузки данных: {error?.message || 'Товар не найден'}
          </div>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    );
  }

  const p = data.product;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span className={`badge-source ${p.source}`}>{p.source}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>ID: {p.id}</span>
              <span style={{ fontSize: '12px', color: '#38bdf8' }}>• {p.brand}</span>
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{p.title}</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{p.description}</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Уровень 1: Сводные метрики */}
        <div className="grid-3" style={{ marginBottom: '16px' }}>
          <div style={{ background: '#0b1120', padding: '12px', borderRadius: '4px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '11px', color: '#64748b' }}>ТЕКУЩАЯ ЦЕНА</div>
            <div className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8' }}>
              ${p.price.toFixed(2)}
            </div>
          </div>
          <div style={{ background: '#0b1120', padding: '12px', borderRadius: '4px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '11px', color: '#64748b' }}>РЕЙТИНГ & ОТЗЫВЫ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}>
              <Star size={16} fill="#f59e0b" />
              <span>{p.averageRating ?? p.rating} / 5.0</span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>({p.reviewCount ?? p.reviews?.length ?? 0})</span>
            </div>
          </div>
          <div style={{ background: '#0b1120', padding: '12px', borderRadius: '4px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '11px', color: '#64748b' }}>ОСТАТОК НА СКЛАДАХ</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: p.inStock ? '#10b981' : '#ef4444' }}>
              {p.inStock ? `${p.totalStock} шт. в наличии` : 'Нет в наличии'}
            </div>
          </div>
        </div>

        {/* Уровень 2: Вложенность – История изменения цен (Price History) */}
        <div className="nested-section">
          <div className="nested-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} />
              История цен (Вложенный массив PricePoint – {p.priceHistory?.length ?? 0} точек)
            </span>
          </div>
          <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>Дата замера</th>
                  <th>Зафиксированная цена</th>
                </tr>
              </thead>
              <tbody>
                {p.priceHistory?.map((ph) => (
                  <tr key={ph.id}>
                    <td style={{ color: '#94a3b8' }}>{new Date(ph.recordedAt).toLocaleDateString()}</td>
                    <td className="font-mono" style={{ color: '#38bdf8' }}>${ph.price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Уровень 3: Вложенность – Склады и остатки (из Subgraph inventory) */}
        <div className="nested-section">
          <div className="nested-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Warehouse size={14} />
              Остатки по складам (Federated Subgraph: inventory)
            </span>
          </div>
          <div className="grid-2">
            {p.inventory?.map((st) => (
              <div
                key={st.id}
                style={{
                  background: '#090d16',
                  padding: '10px 14px',
                  borderRadius: '4px',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>{st.warehouseName}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Город: {st.city}</div>
                </div>
                <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>
                  {st.quantity} шт.
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Уровень 4: Вложенность – Отзывы покупателей (из Subgraph reviews) */}
        <div className="nested-section">
          <div className="nested-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageSquare size={14} />
              Отзывы пользователей (Federated Subgraph: reviews – {p.reviews?.length ?? 0} шт.)
            </span>
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {p.reviews && p.reviews.length > 0 ? (
              p.reviews.map((rev) => (
                <div
                  key={rev.id}
                  style={{
                    background: '#090d16',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    border: '1px solid #1e293b'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: '12px' }}>{rev.author}</span>
                    <span style={{ color: '#f59e0b', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Star size={12} fill="#f59e0b" /> {rev.rating} / 5
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#cbd5e1' }}>{rev.comment}</p>
                </div>
              ))
            ) : (
              <div style={{ color: '#64748b', fontSize: '12px' }}>Отзывов пока нет.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
