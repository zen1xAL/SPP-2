import React, { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { GET_PRODUCTS, GET_CATEGORIES } from '../graphql/operations.js';
import type { ProductConnection, Category } from '../types.js';
import { ChevronLeft, ChevronRight, Eye, Star } from 'lucide-react';
import { ProductDetailModal } from './ProductDetailModal.js';
import { CATALOG_CONFIG, CLIENT_THEME } from '../constants.js';

export const Catalog: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(CATALOG_CONFIG.CATEGORY_ALL);
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string>(CATALOG_CONFIG.DEFAULT_SORT_BY);
  const [sortOrder, setSortOrder] = useState<string>(CATALOG_CONFIG.DEFAULT_SORT_ORDER);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCursorStack([null]);
    }, CATALOG_CONFIG.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const currentAfterCursor = cursorStack[cursorStack.length - 1] ?? undefined;

  const { data: catData } = useQuery<{ categories: Category[] }>(GET_CATEGORIES);

  const { data, loading, error } = useQuery<{ products: ProductConnection }>(GET_PRODUCTS, {
    variables: {
      first: CATALOG_CONFIG.DEFAULT_PAGE_SIZE,
      after: currentAfterCursor,
      search: debouncedSearch || undefined,
      category: selectedCategory !== CATALOG_CONFIG.CATEGORY_ALL ? selectedCategory : undefined,
      minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      sortBy,
      sortOrder
    },
    fetchPolicy: 'cache-and-network'
  });

  const handleNextPage = () => {
    if (data?.products.pageInfo.hasNextPage && data.products.pageInfo.endCursor) {
      setCursorStack((prev) => [...prev, data.products.pageInfo.endCursor]);
    }
  };

  const handlePrevPage = () => {
    if (cursorStack.length > 1) {
      setCursorStack((prev) => prev.slice(0, prev.length - 1));
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
          <span style={{ color: CLIENT_THEME.colors.textMuted }}>–</span>
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
              const parts = e.target.value.split('_');
              setSortBy(parts[0] ?? CATALOG_CONFIG.DEFAULT_SORT_BY);
              setSortOrder(parts[1] ?? CATALOG_CONFIG.DEFAULT_SORT_ORDER);
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

      <div style={{ marginBottom: '16px' }} className="category-pills">
        <button
          className={`pill-filter ${selectedCategory === CATALOG_CONFIG.CATEGORY_ALL ? 'active' : ''}`}
          onClick={() => {
            setSelectedCategory(CATALOG_CONFIG.CATEGORY_ALL);
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

      <div className="data-table-container">
        {loading && !data && (
          <div style={{ padding: '30px', textAlign: 'center', color: CLIENT_THEME.colors.textSecondary }}>
            Выполнение GraphQL-запроса через Supergraph Gateway...
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', color: CLIENT_THEME.colors.danger }}>
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
                      <div style={{ fontWeight: 600, color: CLIENT_THEME.colors.textLight }}>{node.title}</div>
                      <div style={{ fontSize: '11px', color: CLIENT_THEME.colors.textMuted }}>
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
                      <span className="font-mono" style={{ fontWeight: 600, color: CLIENT_THEME.colors.primary }}>
                        ${node.price.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: CLIENT_THEME.colors.warning }}>
                        <Star size={13} fill={CLIENT_THEME.colors.warning} />
                        <span className="font-mono">{node.rating.toFixed(1)}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '12px',
                          color: node.inStock ? CLIENT_THEME.colors.success : CLIENT_THEME.colors.danger,
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

            <div className="pagination-bar">
              <div style={{ fontSize: '12px', color: CLIENT_THEME.colors.textSecondary }}>
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

      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
};
