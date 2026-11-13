import type { DatabaseSync } from 'node:sqlite';
import { getDatabaseStats, type DatabaseStats } from '../db.js';
import { fetchApiProducts } from './api-source.js';
import { fetchNewsFeedReviews } from './news-source.js';
import { generateBulkData } from './seed-source.js';

export async function runDataIngestion(db: DatabaseSync, forceRefresh = false): Promise<DatabaseStats> {
  const currentStats = getDatabaseStats(db);
  if (!forceRefresh && currentStats.totalRecords >= 10000) {
    return currentStats;
  }

  if (forceRefresh) {
    db.exec(`
      DELETE FROM stocks;
      DELETE FROM price_history;
      DELETE FROM reviews;
      DELETE FROM products;
      DELETE FROM warehouses;
      DELETE FROM categories;
    `);
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

    const insertWh = db.prepare('INSERT OR IGNORE INTO warehouses (id, name, city) VALUES (?, ?, ?)');
    for (const wh of bulkData.warehouses) {
      insertWh.run(wh.id, wh.name, wh.city);
    }

    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, name, slug) VALUES (?, ?, ?)');
    let catIdx = 1;
    for (const catName of categorySet) {
      const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      insertCat.run(`cat-${catIdx++}`, catName, slug);
    }

    // Вставка продуктов
    const insertProd = db.prepare(`
      INSERT OR REPLACE INTO products (id, title, description, price, category, brand, rating, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of allProducts) {
      insertProd.run(p.id, p.title, p.description, p.price, p.category, p.brand, p.rating, p.source, p.created_at);
    }

    // Вставка отзывов
    const insertRev = db.prepare(`
      INSERT OR REPLACE INTO reviews (id, product_id, author, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const r of allReviews) {
      insertRev.run(r.id, r.product_id, r.author, r.rating, r.comment, r.created_at);
    }

    // Вставка истории цен (10 000+ записей)
    const insertPh = db.prepare(`
      INSERT OR REPLACE INTO price_history (id, product_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const ph of bulkData.priceHistory) {
      insertPh.run(ph.id, ph.product_id, ph.price, ph.recorded_at);
    }

    // Вставка остатков по складам
    const insertStock = db.prepare(`
      INSERT OR REPLACE INTO stocks (id, product_id, warehouse_id, quantity, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const st of bulkData.stocks) {
      insertStock.run(st.id, st.product_id, st.warehouse_id, st.quantity, st.updated_at);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return getDatabaseStats(db);
}

