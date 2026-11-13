import type { DatabaseSync } from 'node:sqlite';
import { getDatabaseStats, type DatabaseStats, type ProductRecord, type ReviewRecord, type PriceHistoryRecord, type StockRecord, type WarehouseRecord } from '../db.js';
import { fetchApiProducts } from './api-source.js';
import { fetchNewsFeedReviews } from './news-source.js';
import { generateBulkData } from './seed-source.js';
import { INGESTION_CONFIG } from '../shared/constants.js';

function purgeDatabase(db: DatabaseSync): void {
  db.exec(`
    DELETE FROM stocks;
    DELETE FROM price_history;
    DELETE FROM reviews;
    DELETE FROM products;
    DELETE FROM warehouses;
    DELETE FROM categories;
  `);
}

function insertWarehouses(db: DatabaseSync, warehouses: readonly WarehouseRecord[]): void {
  const statement = db.prepare('INSERT OR IGNORE INTO warehouses (id, name, city) VALUES (?, ?, ?)');
  for (const wh of warehouses) {
    statement.run(wh.id, wh.name, wh.city);
  }
}

function insertCategories(db: DatabaseSync, categories: Iterable<string>): void {
  const statement = db.prepare('INSERT OR IGNORE INTO categories (id, name, slug) VALUES (?, ?, ?)');
  let index = 1;
  for (const catName of categories) {
    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    statement.run(`cat-${index++}`, catName, slug);
  }
}

function insertProducts(db: DatabaseSync, products: readonly ProductRecord[]): void {
  const statement = db.prepare(`
    INSERT OR REPLACE INTO products (id, title, description, price, category, brand, rating, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of products) {
    statement.run(p.id, p.title, p.description, p.price, p.category, p.brand, p.rating, p.source, p.created_at);
  }
}

function insertReviews(db: DatabaseSync, reviews: readonly ReviewRecord[]): void {
  const statement = db.prepare(`
    INSERT OR REPLACE INTO reviews (id, product_id, author, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const r of reviews) {
    statement.run(r.id, r.product_id, r.author, r.rating, r.comment, r.created_at);
  }
}

function insertPriceHistories(db: DatabaseSync, histories: readonly PriceHistoryRecord[]): void {
  const statement = db.prepare(`
    INSERT OR REPLACE INTO price_history (id, product_id, price, recorded_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const ph of histories) {
    statement.run(ph.id, ph.product_id, ph.price, ph.recorded_at);
  }
}

function insertStocks(db: DatabaseSync, stocks: readonly StockRecord[]): void {
  const statement = db.prepare(`
    INSERT OR REPLACE INTO stocks (id, product_id, warehouse_id, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const st of stocks) {
    statement.run(st.id, st.product_id, st.warehouse_id, st.quantity, st.updated_at);
  }
}

export async function runDataIngestion(db: DatabaseSync, forceRefresh = false): Promise<DatabaseStats> {
  const currentStats = getDatabaseStats(db);
  if (!forceRefresh && currentStats.totalRecords >= INGESTION_CONFIG.TARGET_RECORD_COUNT) {
    return currentStats;
  }

  if (forceRefresh) {
    purgeDatabase(db);
  }

  const bulkData = generateBulkData();
  const apiProducts = await fetchApiProducts();

  const allProducts = [...bulkData.products, ...apiProducts];
  const allProductIds = allProducts.map((p) => p.id);

  const feedReviews = await fetchNewsFeedReviews(allProductIds);
  const allReviews = [...bulkData.reviews, ...feedReviews];

  const categorySet = new Set<string>();
  for (const p of allProducts) {
    categorySet.add(p.category);
  }

  db.exec('BEGIN TRANSACTION;');

  try {
    insertWarehouses(db, bulkData.warehouses);
    insertCategories(db, categorySet);
    insertProducts(db, allProducts);
    insertReviews(db, allReviews);
    insertPriceHistories(db, bulkData.priceHistory);
    insertStocks(db, bulkData.stocks);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return getDatabaseStats(db);
}
