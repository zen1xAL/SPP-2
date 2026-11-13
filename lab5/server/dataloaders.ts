import DataLoader from 'dataloader';
import type { DatabaseSync } from 'node:sqlite';
import type { ReviewRecord, PriceHistoryRecord, StockRecord } from './db.js';

export interface GraphQLDataLoaders {
  reviewsByProductId: DataLoader<string, ReviewRecord[]>;
  priceHistoryByProductId: DataLoader<string, PriceHistoryRecord[]>;
  stocksByProductId: DataLoader<string, StockRecord[]>;
  getMetrics: () => {
    reviewsBatchCount: number;
    priceHistoryBatchCount: number;
    stocksBatchCount: number;
  };
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
    const rows = db.prepare(sql).all(...productIds) as unknown as ReviewRecord[];

    const map = new Map<string, ReviewRecord[]>();
    for (const id of productIds) {
      map.set(id, []);
    }
    for (const r of rows) {
      map.get(r.product_id)?.push(r);
    }
    return productIds.map((id) => map.get(id) || []);
  });

  const priceHistoryByProductId = new DataLoader<string, PriceHistoryRecord[]>(async (productIds) => {
    priceHistoryBatchCount++;
    if (productIds.length === 0) return [];

    const placeholders = productIds.map(() => '?').join(',');
    const sql = `SELECT * FROM price_history WHERE product_id IN (${placeholders}) ORDER BY recorded_at ASC`;
    const rows = db.prepare(sql).all(...productIds) as unknown as PriceHistoryRecord[];

    const map = new Map<string, PriceHistoryRecord[]>();
    for (const id of productIds) {
      map.set(id, []);
    }
    for (const ph of rows) {
      map.get(ph.product_id)?.push(ph);
    }
    return productIds.map((id) => map.get(id) || []);
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
    const rows = db.prepare(sql).all(...productIds) as unknown as StockRecord[];

    const map = new Map<string, StockRecord[]>();
    for (const id of productIds) {
      map.set(id, []);
    }
    for (const s of rows) {
      map.get(s.product_id)?.push(s);
    }
    return productIds.map((id) => map.get(id) || []);
  });

  return {
    reviewsByProductId,
    priceHistoryByProductId,
    stocksByProductId,
    getMetrics: () => ({
      reviewsBatchCount,
      priceHistoryBatchCount,
      stocksBatchCount
    })
  };
}

