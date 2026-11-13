import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { DB_CONFIG } from './shared/constants.js';

export type { DatabaseSync } from 'node:sqlite';

export interface ProductRecord {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  rating: number;
  source: string;
  created_at: string;
}

export interface ReviewRecord {
  id: string;
  product_id: string;
  author: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface PriceHistoryRecord {
  id: string;
  product_id: string;
  price: number;
  recorded_at: string;
}

export interface WarehouseRecord {
  id: string;
  name: string;
  city: string;
}

export interface StockRecord {
  id: string;
  product_id: string;
  warehouse_id: string;
  warehouse_name?: string;
  city?: string;
  quantity: number;
  updated_at: string;
}

export interface DatabaseStats {
  productsCount: number;
  reviewsCount: number;
  priceHistoryCount: number;
  stocksCount: number;
  totalRecords: number;
}

interface CountQueryResult {
  count: number;
}

let dbInstance: DatabaseSync | null = null;

export function getTableCount(db: DatabaseSync, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as unknown;
  if (row && typeof row === 'object' && 'count' in row && typeof (row as CountQueryResult).count === 'number') {
    return (row as CountQueryResult).count;
  }
  return 0;
}

export function getDatabase(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const defaultDir = path.resolve(process.cwd(), DB_CONFIG.DEFAULT_DIR_NAME);
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  const targetPath = customPath ?? path.join(defaultDir, DB_CONFIG.DATABASE_FILENAME);
  const db = new DatabaseSync(targetPath);

  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`PRAGMA busy_timeout = ${DB_CONFIG.BUSY_TIMEOUT_MS};`);
  } catch (err: unknown) {
    console.warn('[DatabaseSync] SQLite PRAGMA configuration warning:', err instanceof Error ? err.message : String(err));
  }

  initSchema(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      slug TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      brand TEXT NOT NULL,
      rating REAL DEFAULT 0,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      price REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
    CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating);
    CREATE INDEX IF NOT EXISTS idx_products_title ON products(title);
    CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);
    CREATE INDEX IF NOT EXISTS idx_stocks_product_id ON stocks(product_id);
  `);
}

export function getDatabaseStats(db: DatabaseSync): DatabaseStats {
  const productsCount = getTableCount(db, 'products');
  const reviewsCount = getTableCount(db, 'reviews');
  const priceHistoryCount = getTableCount(db, 'price_history');
  const stocksCount = getTableCount(db, 'stocks');

  return {
    productsCount,
    reviewsCount,
    priceHistoryCount,
    stocksCount,
    totalRecords: productsCount + reviewsCount + priceHistoryCount + stocksCount
  };
}
