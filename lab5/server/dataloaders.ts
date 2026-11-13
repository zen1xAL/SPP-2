import DataLoader from 'dataloader';
import type { DatabaseSync } from 'node:sqlite';
import type { ReviewRecord, PriceHistoryRecord, StockRecord } from './db.js';
import { groupEntitiesByForeignKey } from './shared/grouping.js';

export interface DataLoadersMetrics {
  reviewsBatchCount: number;
  priceHistoryBatchCount: number;
  stocksBatchCount: number;
}

export interface GraphQLDataLoaders {
  reviewsByProductId: DataLoader<string, ReviewRecord[]>;
  priceHistoryByProductId: DataLoader<string, PriceHistoryRecord[]>;
  stocksByProductId: DataLoader<string, StockRecord[]>;
  getMetrics: () => DataLoadersMetrics;
}

function queryEntities<T>(db: DatabaseSync, sql: string, params: readonly (string | number)[]): T[] {
  const statement = db.prepare(sql);
  const rows = statement.all(...params);
  return rows as unknown as T[];
}

export function createDataLoaders(db: DatabaseSync): GraphQLDataLoaders {
  let reviewsBatchCount = 0;
  let priceHistoryBatchCount = 0;
  let stocksBatchCount = 0;

  const reviewsByProductId = new DataLoader<string, ReviewRecord[]>(async (productIds) => {
    reviewsBatchCount++;
    if (productIds.length === 0) return [];

    const placeholders = productIds.map(() => '?').join(',');
    const sql = `SELECT * FROM reviews WHERE product_id IN (${placeholders}) ORDER BY created_at DESC`;
    const rows = queryEntities<ReviewRecord>(db, sql, productIds);

    return groupEntitiesByForeignKey(productIds, rows, (review) => review.product_id);
  });

  const priceHistoryByProductId = new DataLoader<string, PriceHistoryRecord[]>(async (productIds) => {
    priceHistoryBatchCount++;
    if (productIds.length === 0) return [];

    const placeholders = productIds.map(() => '?').join(',');
    const sql = `SELECT * FROM price_history WHERE product_id IN (${placeholders}) ORDER BY recorded_at ASC`;
    const rows = queryEntities<PriceHistoryRecord>(db, sql, productIds);

    return groupEntitiesByForeignKey(productIds, rows, (history) => history.product_id);
  });

  const stocksByProductId = new DataLoader<string, StockRecord[]>(async (productIds) => {
    stocksBatchCount++;
    if (productIds.length === 0) return [];

    const placeholders = productIds.map(() => '?').join(',');
    const sql = `
      SELECT s.id, s.product_id, s.warehouse_id, s.quantity, s.updated_at, w.name as warehouse_name, w.city
      FROM stocks s
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.product_id IN (${placeholders})
    `;
    const rows = queryEntities<StockRecord>(db, sql, productIds);

    return groupEntitiesByForeignKey(productIds, rows, (stock) => stock.product_id);
  });

  return {
    reviewsByProductId,
    priceHistoryByProductId,
    stocksByProductId,
    getMetrics: (): DataLoadersMetrics => ({
      reviewsBatchCount,
      priceHistoryBatchCount,
      stocksBatchCount
    })
  };
}
