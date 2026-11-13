import React, { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CREATE_PRODUCT, ADD_REVIEW, UPDATE_STOCK, GET_CATEGORIES, GET_PRODUCTS } from '../graphql/operations.js';
import type { Category, Warehouse } from '../types.js';
import { PlusCircle, MessageSquarePlus, PackagePlus, CheckCircle2 } from 'lucide-react';
import { MUTATION_FORM_DEFAULTS, CLIENT_THEME, formatClientError, CATALOG_CONFIG } from '../constants.js';

function useTemporaryFeedback(durationMs: number = MUTATION_FORM_DEFAULTS.SUCCESS_DURATION_MS) {
  const [active, setActive] = useState(false);

  const trigger = () => {
    setActive(true);
    setTimeout(() => setActive(false), durationMs);
  };

  return [active, trigger] as const;
}

export const MutationsForm: React.FC = () => {
  const { data: catData } = useQuery<{ categories: Category[]; warehouses: Warehouse[] }>(GET_CATEGORIES);

  const [prodTitle, setProdTitle] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState<number>(MUTATION_FORM_DEFAULTS.PRODUCT_PRICE);
  const [prodCategory, setProdCategory] = useState<string>(MUTATION_FORM_DEFAULTS.PRODUCT_CATEGORY);
  const [prodBrand, setProdBrand] = useState<string>(MUTATION_FORM_DEFAULTS.PRODUCT_BRAND);
  const [prodSuccess, triggerProdSuccess] = useTemporaryFeedback();

  const [revProductId, setRevProductId] = useState<string>(MUTATION_FORM_DEFAULTS.TARGET_PRODUCT_ID);
  const [revAuthor, setRevAuthor] = useState('');
  const [revRating, setRevRating] = useState<number>(MUTATION_FORM_DEFAULTS.DEFAULT_RATING);
  const [revComment, setRevComment] = useState('');
  const [revSuccess, triggerRevSuccess] = useTemporaryFeedback();

  const [stockProductId, setStockProductId] = useState<string>(MUTATION_FORM_DEFAULTS.TARGET_PRODUCT_ID);
  const [stockWarehouseId, setStockWarehouseId] = useState<string>(MUTATION_FORM_DEFAULTS.DEFAULT_WAREHOUSE_ID);
  const [stockQty, setStockQty] = useState<number>(MUTATION_FORM_DEFAULTS.DEFAULT_STOCK_QTY);
  const [stockSuccess, triggerStockSuccess] = useTemporaryFeedback();

  const [createProduct, { loading: prodLoading }] = useMutation(CREATE_PRODUCT, {
    refetchQueries: [{ query: GET_PRODUCTS, variables: { first: CATALOG_CONFIG.DEFAULT_PAGE_SIZE } }]
  });

  const [addReview, { loading: revLoading }] = useMutation(ADD_REVIEW);
  const [updateStock, { loading: stockLoading }] = useMutation(UPDATE_STOCK);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodTitle.trim()) return;

    try {
      await createProduct({
        variables: {
          title: prodTitle,
          description: prodDesc,
          price: Number(prodPrice),
          category: prodCategory,
          brand: prodBrand
        }
      });
      setProdTitle('');
      setProdDesc('');
      triggerProdSuccess();
    } catch (err: unknown) {
      alert(formatClientError(err));
    }
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revAuthor.trim() || !revComment.trim()) return;

    try {
      await addReview({
        variables: {
          productId: revProductId,
          author: revAuthor,
          rating: Number(revRating),
          comment: revComment
        }
      });
      setRevComment('');
      triggerRevSuccess();
    } catch (err: unknown) {
      alert(formatClientError(err));
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateStock({
        variables: {
          productId: stockProductId,
          warehouseId: stockWarehouseId,
          quantity: Number(stockQty)
        }
      });
      triggerStockSuccess();
    } catch (err: unknown) {
      alert(formatClientError(err));
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>GraphQL Mutations (Изменение данных)</h2>
        <p style={{ fontSize: '13px', color: CLIENT_THEME.colors.textSecondary }}>
          Отправка мутаций в распределенную схему Apollo Federation с мгновенной публикацией событий в WebSocket Subscriptions.
        </p>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-title">
            <PlusCircle size={16} color={CLIENT_THEME.colors.primary} />
            <span>createProduct</span>
          </div>

          <form onSubmit={handleCreateProduct}>
            <div className="form-group">
              <label className="form-label">Наименование товара</label>
              <input
                type="text"
                className="input-field"
                required
                placeholder="Apex Pulse Mini Router"
                value={prodTitle}
                onChange={(e) => setProdTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Бренд</label>
              <input
                type="text"
                className="input-field"
                required
                value={prodBrand}
                onChange={(e) => setProdBrand(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Категория</label>
              <select
                className="select-field"
                style={{ width: '100%' }}
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value)}
              >
                {catData?.categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Цена ($)</label>
              <input
                type="number"
                step="0.01"
                className="input-field font-mono"
                required
                value={prodPrice}
                onChange={(e) => setProdPrice(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Описание</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Инженерные характеристики и особенности..."
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={prodLoading}>
              {prodLoading ? 'Выполнение...' : 'Создать товар'}
            </button>

            {prodSuccess && (
              <div style={{ marginTop: '10px', color: CLIENT_THEME.colors.success, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Товар успешно создан в базе!
              </div>
            )}
          </form>
        </div>

        <div className="card">
          <div className="card-title">
            <MessageSquarePlus size={16} color={CLIENT_THEME.colors.warning} />
            <span>addReview (Reviews Subgraph)</span>
          </div>

          <form onSubmit={handleAddReview}>
            <div className="form-group">
              <label className="form-label">ID Товара (Target Product)</label>
              <input
                type="text"
                className="input-field font-mono"
                required
                placeholder="api-prod-1 или gen-prod-10"
                value={revProductId}
                onChange={(e) => setRevProductId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Автор отзыва</label>
              <input
                type="text"
                className="input-field"
                required
                placeholder="Инженер Тестирования"
                value={revAuthor}
                onChange={(e) => setRevAuthor(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Оценка (1 – 5)</label>
              <select
                className="select-field"
                style={{ width: '100%' }}
                value={revRating}
                onChange={(e) => setRevRating(Number(e.target.value))}
              >
                <option value={5}>5 – Отлично</option>
                <option value={4}>4 – Хорошо</option>
                <option value={3}>3 – Удовлетворительно</option>
                <option value={2}>2 – Ниже среднего</option>
                <option value={1}>1 – Плохо</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Текст отзыва</label>
              <textarea
                className="input-field"
                rows={3}
                required
                placeholder="Подробный комментарий о работе устройства..."
                value={revComment}
                onChange={(e) => setRevComment(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={revLoading}>
              {revLoading ? 'Отправка...' : 'Добавить отзыв'}
            </button>

            {revSuccess && (
              <div style={{ marginTop: '10px', color: CLIENT_THEME.colors.success, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Отзыв сохранен и разослан подписчикам!
              </div>
            )}
          </form>
        </div>

        <div className="card">
          <div className="card-title">
            <PackagePlus size={16} color={CLIENT_THEME.colors.success} />
            <span>updateStock (Inventory Subgraph)</span>
          </div>

          <form onSubmit={handleUpdateStock}>
            <div className="form-group">
              <label className="form-label">ID Товара</label>
              <input
                type="text"
                className="input-field font-mono"
                required
                placeholder="api-prod-1"
                value={stockProductId}
                onChange={(e) => setStockProductId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Целевой склад</label>
              <select
                className="select-field"
                style={{ width: '100%' }}
                value={stockWarehouseId}
                onChange={(e) => setStockWarehouseId(e.target.value)}
              >
                {catData?.warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.city})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Новое количество на складе (шт.)</label>
              <input
                type="number"
                min="0"
                className="input-field font-mono"
                required
                value={stockQty}
                onChange={(e) => setStockQty(Number(e.target.value))}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={stockLoading}>
              {stockLoading ? 'Обновление...' : 'Обновить остаток'}
            </button>

            {stockSuccess && (
              <div style={{ marginTop: '10px', color: CLIENT_THEME.colors.success, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Складской остаток успешно обновлен!
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
