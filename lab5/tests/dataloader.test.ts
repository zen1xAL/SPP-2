import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase } from '../server/db.js';
import { runDataIngestion } from '../server/collectors/ingestion.js';
import { createDataLoaders } from '../server/dataloaders.js';

describe('Performance Optimization: DataLoader N+1 Prevention', () => {
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    db = getDatabase();
    await runDataIngestion(db);
  });

  it('should batch multiple entity resolutions into a single database query per relation', async () => {
    const dataLoaders = createDataLoaders(db);

    const products = db.prepare('SELECT id FROM products LIMIT 15').all() as { id: string }[];
    const productIds = products.map((p) => p.id);

    const reviewsPromises = productIds.map((id) => dataLoaders.reviewsByProductId.load(id));
    const stocksPromises = productIds.map((id) => dataLoaders.stocksByProductId.load(id));
    const priceHistoryPromises = productIds.map((id) => dataLoaders.priceHistoryByProductId.load(id));

    const [reviewsResults, stocksResults, priceHistoryResults] = await Promise.all([
      Promise.all(reviewsPromises),
      Promise.all(stocksPromises),
      Promise.all(priceHistoryPromises)
    ]);

    expect(reviewsResults.length).toBe(15);
    expect(stocksResults.length).toBe(15);
    expect(priceHistoryResults.length).toBe(15);

    const metrics = dataLoaders.getMetrics();

    expect(metrics.reviewsBatchCount).toBe(1);

    expect(metrics.stocksBatchCount).toBe(1);

    expect(metrics.priceHistoryBatchCount).toBe(1);
  });
});

