import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { getDatabase } from '../server/db.js';
import { runDataIngestion } from '../server/collectors/ingestion.js';
import { createSupergraphGateway } from '../server/gateway.js';
import { createDataLoaders } from '../server/dataloaders.js';
import { pubsub, type TickerEvent, type NewReviewEvent } from '../server/pubsub.js';

describe('Mutations & GraphQL Subscriptions Real-time Events', () => {
  let server: ApolloServer;
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    db = getDatabase();
    await runDataIngestion(db);

    const { gateway } = createSupergraphGateway(db);
    server = new ApolloServer({ gateway });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should deliver live ticker events to subscription generator', async () => {
    const iterator = pubsub.subscribeTicker();

    const testEvent: TickerEvent = {
      productId: 'prod-test-live',
      title: 'Realtime Cyber Component',
      oldPrice: 150.0,
      newPrice: 165.0,
      changePercent: 10.0,
      timestamp: new Date().toISOString()
    };

    pubsub.publishTicker(testEvent);

    const next = await iterator.next();
    expect(next.done).toBe(false);
    expect(next.value).toEqual(testEvent);
  });

  it('should execute addReview mutation and notify subscription listeners', async () => {
    const product = db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string };
    const reviewIterator = pubsub.subscribeReview();

    const mutation = `
      mutation AddTestReview($productId: ID!, $author: String!, $rating: Int!, $comment: String!) {
        addReview(productId: $productId, author: $author, rating: $rating, comment: $comment) {
          id
          productId
          author
          rating
          comment
        }
      }
    `;

    const res = await server.executeOperation(
      {
        query: mutation,
        variables: {
          productId: product.id,
          author: 'Senior QA Tester',
          rating: 5,
          comment: 'Flawless performance, all telemetry parameters are green.'
        }
      },
      {
        contextValue: { db, dataLoaders: createDataLoaders(db) }
      }
    );

    expect(res.body.kind).toBe('single');
    if (res.body.kind === 'single') {
      expect(res.body.singleResult.errors).toBeUndefined();
      const reviewData = (res.body.singleResult.data as unknown as { addReview: { author: string; rating: number } }).addReview;
      expect(reviewData.author).toBe('Senior QA Tester');
      expect(reviewData.rating).toBe(5);
    }

    const event = await reviewIterator.next();
    expect(event.done).toBe(false);
    expect((event.value as NewReviewEvent).author).toBe('Senior QA Tester');
    expect((event.value as NewReviewEvent).rating).toBe(5);
  });

  it('should execute updateStock mutation', async () => {
    const product = db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string };
    const warehouse = db.prepare('SELECT id FROM warehouses LIMIT 1').get() as { id: string };

    const mutation = `
      mutation UpdateTestStock($productId: ID!, $warehouseId: ID!, $quantity: Int!) {
        updateStock(productId: $productId, warehouseId: $warehouseId, quantity: $quantity) {
          id
          productId
          warehouseId
          warehouseName
          quantity
        }
      }
    `;

    const res = await server.executeOperation(
      {
        query: mutation,
        variables: {
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 42
        }
      },
      {
        contextValue: { db, dataLoaders: createDataLoaders(db) }
      }
    );

    if (res.body.kind === 'single') {
      expect(res.body.singleResult.errors).toBeUndefined();
      const stockData = (res.body.singleResult.data as unknown as { updateStock: { quantity: number; warehouseId: string } }).updateStock;
      expect(stockData.quantity).toBe(42);
      expect(stockData.warehouseId).toBe(warehouse.id);
    }
  });
});

