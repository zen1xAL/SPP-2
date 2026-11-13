import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { getDatabase } from '../server/db.js';
import { runDataIngestion } from '../server/collectors/ingestion.js';
import { createSupergraphGateway } from '../server/gateway.js';
import { createDataLoaders } from '../server/dataloaders.js';

describe('Apollo Federation v2 Supergraph Composition & Cross-Subgraph Query', () => {
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

  it('should successfully execute a cross-subgraph query resolving Product, Reviews and Inventory', async () => {
    const query = `
      query GetProductsWithNestedFederatedEntities {
        products(first: 3) {
          edges {
            node {
              id
              title
              price
              category
              # Из подграфа reviews:
              reviews {
                id
                author
                rating
                comment
              }
              reviewCount
              # Из подграфа inventory:
              inventory {
                warehouseName
                city
                quantity
              }
              totalStock
              inStock
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
      const data = res.body.singleResult.data as any;
      expect(data.products).toBeDefined();
      expect(data.products.edges.length).toBe(3);

      const firstProduct = data.products.edges[0].node;
      expect(firstProduct.id).toBeDefined();
      expect(firstProduct.title).toBeDefined();

      expect(Array.isArray(firstProduct.reviews)).toBe(true);
      expect(firstProduct.reviewCount).toBeGreaterThanOrEqual(0);

      expect(Array.isArray(firstProduct.inventory)).toBe(true);
      expect(typeof firstProduct.totalStock).toBe('number');
      expect(typeof firstProduct.inStock).toBe('boolean');
    }
  });

  it('should support Query.product by ID with nested federated fields', async () => {

    const p = db.prepare('SELECT id FROM products LIMIT 1').get() as { id: string };

    const query = `
      query GetSingleProduct($id: ID!) {
        product(id: $id) {
          id
          title
          reviews {
            author
            rating
          }
          inventory {
            warehouseName
            quantity
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query, variables: { id: p.id } },
      {
        contextValue: {
          db,
          dataLoaders: createDataLoaders(db)
        }
      }
    );

    if (res.body.kind === 'single') {
      expect(res.body.singleResult.errors).toBeUndefined();
      const data = res.body.singleResult.data as any;
      expect(data.product.id).toBe(p.id);
      expect(data.product.title).toBeDefined();
      expect(Array.isArray(data.product.reviews)).toBe(true);
      expect(Array.isArray(data.product.inventory)).toBe(true);
    }
  });
});

