import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { getDatabase } from '../server/db.js';
import { runDataIngestion } from '../server/collectors/ingestion.js';
import { createSupergraphGateway } from '../server/gateway.js';
import { createDataLoaders } from '../server/dataloaders.js';

describe('Search, Filtering, Sorting & Relay Cursor Pagination', () => {
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

  it('should paginate items according to Relay Connection specification', async () => {

    const page1Query = `
      query PageOne {
        products(first: 5) {
          totalCount
          edges {
            cursor
            node {
              id
              title
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    const res1 = await server.executeOperation(
      { query: page1Query },
      { contextValue: { db, dataLoaders: createDataLoaders(db) } }
    );

    expect(res1.body.kind).toBe('single');
    if (res1.body.kind !== 'single') return;

    const data1 = (res1.body.singleResult.data as any).products;
    expect(data1.edges.length).toBe(5);
    expect(data1.pageInfo.hasNextPage).toBe(true);
    expect(data1.pageInfo.hasPreviousPage).toBe(false);
    expect(data1.pageInfo.endCursor).toBeDefined();

    const firstPageIds = data1.edges.map((e: any) => e.node.id);

    const page2Query = `
      query PageTwo($after: String!) {
        products(first: 5, after: $after) {
          edges {
            cursor
            node {
              id
              title
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;

    const res2 = await server.executeOperation(
      { query: page2Query, variables: { after: data1.pageInfo.endCursor } },
      { contextValue: { db, dataLoaders: createDataLoaders(db) } }
    );

    if (res2.body.kind !== 'single') return;
    const data2 = (res2.body.singleResult.data as any).products;
    expect(data2.edges.length).toBe(5);
    expect(data2.pageInfo.hasPreviousPage).toBe(true);

    const secondPageIds = data2.edges.map((e: any) => e.node.id);

    for (const id of secondPageIds) {
      expect(firstPageIds).not.toContain(id);
    }
  });

  it('should filter items by category and price range', async () => {
    const query = `
      query FilteredProducts($category: String, $minPrice: Float, $maxPrice: Float) {
        products(category: $category, minPrice: $minPrice, maxPrice: $maxPrice, first: 10) {
          totalCount
          edges {
            node {
              id
              category
              price
            }
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query, variables: { category: 'electronics', minPrice: 100, maxPrice: 500 } },
      { contextValue: { db, dataLoaders: createDataLoaders(db) } }
    );

    if (res.body.kind === 'single') {
      const data = (res.body.singleResult.data as any).products;
      for (const edge of data.edges) {
        expect(edge.node.category).toBe('electronics');
        expect(edge.node.price).toBeGreaterThanOrEqual(100);
        expect(edge.node.price).toBeLessThanOrEqual(500);
      }
    }
  });

  it('should sort items by price in ASC order', async () => {
    const query = `
      query SortedProducts {
        products(first: 5, sortBy: "price", sortOrder: "ASC") {
          edges {
            node {
              price
            }
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query },
      { contextValue: { db, dataLoaders: createDataLoaders(db) } }
    );

    if (res.body.kind === 'single') {
      const edges = (res.body.singleResult.data as any).products.edges;
      for (let i = 0; i < edges.length - 1; i++) {
        expect(edges[i].node.price).toBeLessThanOrEqual(edges[i + 1].node.price);
      }
    }
  });

  it('should execute full-text search across titles and descriptions', async () => {
    const query = `
      query SearchProducts($search: String!) {
        products(search: $search, first: 10) {
          totalCount
          edges {
            node {
              title
              description
            }
          }
        }
      }
    `;

    const res = await server.executeOperation(
      { query, variables: { search: 'Router' } },
      { contextValue: { db, dataLoaders: createDataLoaders(db) } }
    );

    if (res.body.kind === 'single') {
      const edges = (res.body.singleResult.data as any).products.edges;
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        const matches =
          edge.node.title.toLowerCase().includes('router') ||
          edge.node.description.toLowerCase().includes('router');
        expect(matches).toBe(true);
      }
    }
  });
});

