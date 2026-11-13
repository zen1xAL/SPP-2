import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { getDatabase } from '../src/server/db.js';
import { runDataIngestion } from '../src/server/collectors/ingestion.js';
import { createSupergraphGateway } from '../src/server/gateway.js';
import { createDataLoaders } from '../src/server/dataloaders.js';
import { createComplexityPlugin, calculateQueryComplexity } from '../src/server/complexity.js';
import { gql } from '../src/server/shared/gql.js';

describe('Load Control & Security: Query Complexity & Depth Limiting', () => {
  let server: ApolloServer;
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    db = getDatabase();
    await runDataIngestion(db);

    const { gateway } = createSupergraphGateway(db);
    server = new ApolloServer({
      gateway,
      plugins: [
        createComplexityPlugin({
          maxComplexity: 100, // Пониженный порог для тестирования лимитера
          maxDepth: 4
        })
      ]
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should accurately calculate complexity score and depth via AST visitor', () => {
    const document = gql`
      query TestCalc {
        products(first: 10) {
          edges {
            node {
              id
              title
              price
            }
          }
        }
      }
    `;

    const { complexity, depth } = calculateQueryComplexity(document);
    expect(complexity).toBeGreaterThan(0);
    expect(depth).toBe(4);
  });

  it('should allow queries within complexity and depth thresholds', async () => {
    const query = `
      query NormalQuery {
        products(first: 2) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query },
      {
        contextValue: {
          db,
          dataLoaders: createDataLoaders(db)
        }
      }
    );

    expect(res.body.kind).toBe('single');
    if (res.body.kind === 'single') {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data).toBeDefined();
    }
  });

  it('should reject queries exceeding the depth limit with GRAPHQL_VALIDATION_FAILED', async () => {
    // Вложенность глубже 4 уровней
    const deepQuery = `
      query TooDeepQuery {
        products(first: 1) {
          edges {
            node {
              priceHistory {
                id
              }
            }
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query: deepQuery },
      {
        contextValue: {
          db,
          dataLoaders: createDataLoaders(db)
        }
      }
    );

    if (res.body.kind === 'single') {
      expect(res.body.singleResult.errors).toBeDefined();
      const err = res.body.singleResult.errors![0]!;
      expect(err.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(err.message).toContain('Depth of');
    }
  });

  it('should reject queries exceeding the complexity budget with GRAPHQL_VALIDATION_FAILED', async () => {
    // Большой множитель first: 100 превысит бюджет complexity в 100
    const expensiveQuery = `
      query ExpensiveQuery {
        products(first: 90) {
          edges {
            node {
              id
              title
              description
              price
              category
              brand
              rating
            }
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query: expensiveQuery },
      {
        contextValue: {
          db,
          dataLoaders: createDataLoaders(db)
        }
      }
    );

    if (res.body.kind === 'single') {
      expect(res.body.singleResult.errors).toBeDefined();
      const err = res.body.singleResult.errors![0]!;
      expect(err.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(err.message).toContain('Complexity score');
    }
  });
});

