import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase, getDatabaseStats } from '../src/server/db.js';
import { runDataIngestion } from '../src/server/collectors/ingestion.js';

describe('Data Ingestion & Volume (>10,000 records from 3 sources)', () => {
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    db = getDatabase();
    await runDataIngestion(db);
  });

  it('should have populated the database with at least 10,000 records', () => {
    const stats = getDatabaseStats(db);
    expect(stats.totalRecords).toBeGreaterThanOrEqual(10000);
    expect(stats.priceHistoryCount).toBeGreaterThanOrEqual(8000);
    expect(stats.productsCount).toBeGreaterThanOrEqual(400);
    expect(stats.reviewsCount).toBeGreaterThanOrEqual(2000);
    expect(stats.stocksCount).toBeGreaterThanOrEqual(1000);
  });

  it('should contain records from all 3 automated data sources', () => {
    const sources = db.prepare('SELECT DISTINCT source FROM products').all() as { source: string }[];
    const sourceNames = sources.map((s) => s.source);

    // Источник 1: Внешний API
    expect(sourceNames).toContain('api');
    // Источник 3: Генератор большого объема
    expect(sourceNames).toContain('generator');

    // Источник 2: Новостной / RSS фид отзывов
    const feedReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE id LIKE 'feed-rev-%'").get() as { count: number };
    expect(feedReviews.count).toBeGreaterThan(0);
  });
});
