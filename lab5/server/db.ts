import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

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

let dbInstance: DatabaseSync | null = null;

export function getDatabase(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const defaultDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  const targetPath = customPath ?? path.join(defaultDir, 'marketplace.db');
  const db = new DatabaseSync(targetPath);

  // Оптимизация производительности: WAL режим, synchronous NORMAL
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 10000;');
  } catch {
    // Ignore pragma errors if in-memory
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

    -- Индексы для сверхбыстрой выборки и пагинации
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
  const p = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count;
  const r = (db.prepare('SELECT COUNT(*) as count FROM reviews').get() as { count: number }).count;
  const ph = (db.prepare('SELECT COUNT(*) as count FROM price_history').get() as { count: number }).count;
  const s = (db.prepare('SELECT COUNT(*) as count FROM stocks').get() as { count: number }).count;

  return {
    productsCount: p,
    reviewsCount: r,
    priceHistoryCount: ph,
    stocksCount: s,
    totalRecords: p + r + ph + s
  };
}
