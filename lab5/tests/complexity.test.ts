import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { getDatabase } from '../server/db.js';
import { runDataIngestion } from '../server/collectors/ingestion.js';
import { createSupergraphGateway } from '../server/gateway.js';
import { createDataLoaders } from '../server/dataloaders.js';
import { createComplexityPlugin, calculateQueryComplexity } from '../server/complexity.js';
import { gql } from '../server/shared/gql.js';

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
          maxComplexity: 100, 
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
      const firstError = res.body.singleResult.errors?.[0];
      expect(firstError).toBeDefined();
      expect(firstError?.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(firstError?.message).toContain('Depth of');
    }
  });

  it('should reject queries exceeding the complexity budget with GRAPHQL_VALIDATION_FAILED', async () => {

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
      const firstError = res.body.singleResult.errors?.[0];
      expect(firstError).toBeDefined();
      expect(firstError?.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(firstError?.message).toContain('Complexity score');
    }
  });
});

