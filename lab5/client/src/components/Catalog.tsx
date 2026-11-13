import React, { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { GET_PRODUCTS, GET_CATEGORIES } from '../graphql/operations.js';
import type { ProductConnection, Category } from '../types.js';
import { ChevronLeft, ChevronRight, Eye, Star } from 'lucide-react';
import { ProductDetailModal } from './ProductDetailModal.js';

export const Catalog: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [pageSize] = useState(12);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCursorStack([null]); 
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const currentAfterCursor = cursorStack[cursorStack.length - 1] ?? undefined;

  const { data: catData } = useQuery<{ categories: Category[] }>(GET_CATEGORIES);

  const { data, loading, error } = useQuery<{ products: ProductConnection }>(GET_PRODUCTS, {
    variables: {
      first: pageSize,
      after: currentAfterCursor,
      search: debouncedSearch || undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      sortBy,
      sortOrder
    },
    fetchPolicy: 'cache-and-network'
  });

  const handleNextPage = () => {
    if (data?.products.pageInfo.hasNextPage && data.products.pageInfo.endCursor) {
      setCursorStack([...cursorStack, data.products.pageInfo.endCursor]);
    }
  };

  const handlePrevPage = () => {
    if (cursorStack.length > 1) {
      setCursorStack(cursorStack.slice(0, cursorStack.length - 1));
    }
  };

  const currentPageNumber = cursorStack.length;

  return (
    <div className="container">
      <div className="controls-bar">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="input-field"
            placeholder="Поиск по названию, бренду, описанию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            className="input-field font-mono"
            placeholder="От $"
            style={{ width: '80px' }}
            value={minPrice ?? ''}
            onChange={(e) => {
              setMinPrice(e.target.value ? Number(e.target.value) : undefined);
              setCursorStack([null]);
            }}
          />
          <span style={{ color: '#64748b' }}>–</span>
          <input
            type="number"
            className="input-field font-mono"
            placeholder="До $"
            style={{ width: '80px' }}
            value={maxPrice ?? ''}
            onChange={(e) => {
              setMaxPrice(e.target.value ? Number(e.target.value) : undefined);
              setCursorStack([null]);
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            className="select-field"
            value={`${sortBy}_${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('_');
              setSortBy(sb!);
              setSortOrder(so!);
              setCursorStack([null]);
            }}
          >
            <option value="created_at_DESC">По новизне</option>
            <option value="price_ASC">Цена: от низкой к высокой</option>
            <option value="price_DESC">Цена: от высокой к низкой</option>
            <option value="rating_DESC">Рейтинг: высокий</option>
            <option value="title_ASC">По названию (А–Я)</option>
          </select>
        </div>
      </div>

      {/* Быстрые фильтры по категориям */}
      <div style={{ marginBottom: '16px' }} className="category-pills">
        <button
          className={`pill-filter ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => {
            setSelectedCategory('all');
            setCursorStack([null]);
          }}
        >
          Все категории
        </button>
        {catData?.categories.map((c) => (
          <button
            key={c.id}
            className={`pill-filter ${selectedCategory === c.name ? 'active' : ''}`}
            onClick={() => {
              setSelectedCategory(c.name);
              setCursorStack([null]);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Таблица товаров */}
      <div className="data-table-container">
        {loading && !data && (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
            Выполнение GraphQL-запроса через Supergraph Gateway...
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', color: '#ef4444' }}>
            Ошибка выполнения GraphQL-запроса: {error.message}
          </div>
        )}

        {data && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Наименование / Бренд</th>
                  <th>Категория</th>
                  <th>Источник</th>
                  <th>Цена</th>
                  <th>Рейтинг</th>
                  <th>Наличие</th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.products.edges.map(({ node }) => (
                  <tr key={node.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{node.title}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {node.brand} • <span className="font-mono">ID: {node.id}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', color: '#cbd5e1' }}>
                        {node.category}
                      </span>
                    </td>
                    <td>
                      <span className={`badge-source ${node.source}`}>{node.source}</span>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600, color: '#38bdf8' }}>
                        ${node.price.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                        <Star size={13} fill="#f59e0b" />
                        <span className="font-mono">{node.rating.toFixed(1)}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '12px',
                          color: node.inStock ? '#10b981' : '#ef4444',
                          fontWeight: 500
                        }}
                      >
                        {node.inStock ? `${node.totalStock} шт.` : 'Нет'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => setSelectedProductId(node.id)}
                      >
                        <Eye size={12} />
                        Граф связей
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Relay Cursor Connection Pagination Controls */}
            <div className="pagination-bar">
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Всего найдено:{' '}
                <strong style={{ color: '#fff' }}>{data.products.totalCount.toLocaleString()}</strong> товаров
                {' • '}
                Страница <strong style={{ color: '#fff' }}>{currentPageNumber}</strong>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn"
                  onClick={handlePrevPage}
                  disabled={currentPageNumber === 1}
                >
                  <ChevronLeft size={14} />
                  Назад
                </button>
                <button
                  className="btn"
                  onClick={handleNextPage}
                  disabled={!data.products.pageInfo.hasNextPage}
                >
                  Вперед
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Модальное окно детализации */}
      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
};
