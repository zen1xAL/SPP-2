import { describe, it, expect, beforeAll } from 'vitest';
import { getDatabase } from '../src/server/db.js';
import { runDataIngestion } from '../src/server/collectors/ingestion.js';
import { createDataLoaders } from '../src/server/dataloaders.js';

describe('Performance Optimization: DataLoader N+1 Prevention', () => {
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    db = getDatabase();
    await runDataIngestion(db);
  });

  it('should batch multiple entity resolutions into a single database query per relation', async () => {
    const dataLoaders = createDataLoaders(db);

    // Получаем 15 идентификаторов товаров
    const products = db.prepare('SELECT id FROM products LIMIT 15').all() as { id: string }[];
    const productIds = products.map((p) => p.id);

    // Параллельно загружаем отзывы и складские остатки для всех 15 товаров
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

    // Проверяем счетчик пакетов (batch count)
    const metrics = dataLoaders.getMetrics();
    // Вместо 15 отдельных SQL-запросов к отзывам был выполнен ровно 1 батч-запрос!
    expect(metrics.reviewsBatchCount).toBe(1);
    // Вместо 15 отдельных SQL-запросов к остаткам был выполнен ровно 1 батч-запрос!
    expect(metrics.stocksBatchCount).toBe(1);
    // Вместо 15 отдельных SQL-запросов к истории цен был выполнен ровно 1 батч-запрос!
    expect(metrics.priceHistoryBatchCount).toBe(1);
  });
});

