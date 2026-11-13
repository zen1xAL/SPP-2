import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from '../shared/gql.js';
import type { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { getDatabaseStats, type ProductRecord, type PriceHistoryRecord } from '../db.js';
import { getServerMetrics } from '../tracing.js';
import { runDataIngestion } from '../collectors/ingestion.js';
import { pubsub, type TickerEvent, type NewReviewEvent, type StockUpdateEvent } from '../pubsub.js';
import type { GraphQLDataLoaders } from '../dataloaders.js';
import { encodeRelayCursor, decodeRelayCursor } from '../shared/cursor.js';
import { REVIEWS_CONFIG } from '../shared/constants.js';

export interface GraphQLContext {
  db: DatabaseSync;
  dataLoaders: GraphQLDataLoaders;
  queryComplexity?: number;
  queryDepth?: number;
}

export const productsTypeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  type PricePoint {
    id: ID!
    price: Float!
    recordedAt: String!
  }

  type Category {
    id: ID!
    name: String!
    slug: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type ProductEdge {
    cursor: String!
    node: Product!
  }

  type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type SystemMetrics {
    totalRequests: Int!
    totalErrors: Int!
    avgDurationMs: Float!
    uptimeSeconds: Int!
    activeSubscriptions: Int!
    memoryUsageMb: Float!
  }

  type DatabaseStats {
    productsCount: Int!
    reviewsCount: Int!
    priceHistoryCount: Int!
    stocksCount: Int!
    totalRecords: Int!
  }

  type TickerEvent {
    productId: ID!
    title: String!
    oldPrice: Float!
    newPrice: Float!
    changePercent: Float!
    timestamp: String!
  }

  type NewReviewEvent {
    id: ID!
    productId: ID!
    productTitle: String!
    author: String!
    rating: Int!
    comment: String!
    createdAt: String!
  }

  type StockUpdateEvent {
    productId: ID!
    warehouseName: String!
    city: String!
    quantity: Int!
    updatedAt: String!
  }

  type Product @key(fields: "id") {
    id: ID!
    title: String!
    description: String
    price: Float!
    category: String!
    brand: String!
    rating: Float!
    source: String!
    createdAt: String!
    priceHistory: [PricePoint!]!
  }

  type Query {
    products(
      first: Int
      after: String
      search: String
      category: String
      minPrice: Float
      maxPrice: Float
      sortBy: String
      sortOrder: String
    ): ProductConnection!

    product(id: ID!): Product
    categories: [Category!]!
    systemMetrics: SystemMetrics!
    databaseStats: DatabaseStats!
  }

  type Mutation {
    createProduct(
      title: String!
      description: String
      price: Float!
      category: String!
      brand: String!
    ): Product!

    triggerDataIngestion(forceRefresh: Boolean): DatabaseStats!
  }

  type Subscription {
    tickerUpdated: TickerEvent!
    reviewAdded: NewReviewEvent!
    stockUpdated: StockUpdateEvent!
  }
`;

interface ProductsQueryArgs {
  first?: number;
  after?: string;
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  sortOrder?: string;
}

interface CreateProductArgs {
  title: string;
  description?: string;
  price: number;
  category: string;
  brand: string;
}

const SORT_COLUMNS_MAP: Record<string, string> = {
  price: 'price',
  rating: 'rating',
  title: 'title',
  created_at: 'created_at'
};

const DEFAULT_SORT_COLUMN = 'created_at';
const DEFAULT_PAGE_LIMIT = 15;
const MAX_PAGE_LIMIT = 100;

interface FilterBuildResult {
  whereSql: string;
  params: (string | number)[];
}

function buildProductSearchFilter(args: ProductsQueryArgs): FilterBuildResult {
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (args.search && args.search.trim()) {
    whereClauses.push('(title LIKE ? OR description LIKE ? OR brand LIKE ?)');
    const term = `%${args.search.trim()}%`;
    params.push(term, term, term);
  }

  if (args.category && args.category !== 'all') {
    whereClauses.push('category = ?');
    params.push(args.category);
  }

  if (args.minPrice !== undefined && args.minPrice !== null) {
    whereClauses.push('price >= ?');
    params.push(args.minPrice);
  }

  if (args.maxPrice !== undefined && args.maxPrice !== null) {
    whereClauses.push('price <= ?');
    params.push(args.maxPrice);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params };
}

function buildRelayProductConnection(
  rows: ProductRecord[],
  limit: number,
  offset: number,
  totalCount: number
) {
  const hasNextPage = rows.length > limit;
  const nodes = hasNextPage ? rows.slice(0, limit) : rows;

  const edges = nodes.map((node, index) => {
    const itemOffset = offset + index;
    const cursor = encodeRelayCursor(itemOffset);
    return { cursor, node };
  });

  return {
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: offset > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null
    },
    totalCount
  };
}

export function createProductsSubgraph(db: DatabaseSync) {
  return buildSubgraphSchema([
    {
      typeDefs: productsTypeDefs,
      resolvers: {
        Product: {
          __resolveReference(ref: { id: string }): ProductRecord | undefined {
            const row = db.prepare('SELECT * FROM products WHERE id = ?').get(ref.id);
            return row as ProductRecord | undefined;
          },
          createdAt(product: ProductRecord): string {
            return product.created_at;
          },
          async priceHistory(product: ProductRecord, _: unknown, context: GraphQLContext) {
            const history = await context.dataLoaders.priceHistoryByProductId.load(product.id);
            return history.map((h: PriceHistoryRecord) => ({
              id: h.id,
              price: h.price,
              recordedAt: h.recorded_at
            }));
          }
        },
        Query: {
          product(_: unknown, { id }: { id: string }): ProductRecord | undefined {
            const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
            return row as ProductRecord | undefined;
          },
          categories() {
            return db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
          },
          systemMetrics() {
            return getServerMetrics();
          },
          databaseStats() {
            return getDatabaseStats(db);
          },
          products(_: unknown, args: ProductsQueryArgs) {
            const limit = Math.min(Math.max(args.first ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
            const decodedOffset = decodeRelayCursor(args.after);
            const offset = decodedOffset !== null ? decodedOffset + 1 : 0;

            const { whereSql, params } = buildProductSearchFilter(args);

            const sortKey = args.sortBy ?? DEFAULT_SORT_COLUMN;
            const sortColumn = SORT_COLUMNS_MAP[sortKey] ?? DEFAULT_SORT_COLUMN;
            const sortDir = args.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            const countSql = `SELECT COUNT(*) as count FROM products ${whereSql}`;
            const countRow = db.prepare(countSql).get(...params) as { count: number } | undefined;
            const totalCount = countRow?.count ?? 0;

            const querySql = `
              SELECT * FROM products
              ${whereSql}
              ORDER BY ${sortColumn} ${sortDir}
              LIMIT ? OFFSET ?
            `;
            const rows = db.prepare(querySql).all(...params, limit + 1, offset) as unknown as ProductRecord[];

            return buildRelayProductConnection(rows, limit, offset, totalCount);
          }
        },
        Mutation: {
          createProduct(_: unknown, { title, description, price, category, brand }: CreateProductArgs): ProductRecord {
            const id = `prod-${uuidv4().slice(0, REVIEWS_CONFIG.ID_HASH_LENGTH)}`;
            const createdAt = new Date().toISOString();
            const rating = 4.5;
            const source = 'manual';

            db.prepare(`
              INSERT INTO products (id, title, description, price, category, brand, rating, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, title, description ?? '', price, category, brand, rating, source, createdAt);

            db.prepare(`
              INSERT INTO price_history (id, product_id, price, recorded_at)
              VALUES (?, ?, ?, ?)
            `).run(`ph-${id}-init`, id, price, createdAt);

            pubsub.publishTicker({
              productId: id,
              title,
              oldPrice: price,
              newPrice: price,
              changePercent: 0,
              timestamp: createdAt
            });

            return {
              id,
              title,
              description: description ?? '',
              price,
              category,
              brand,
              rating,
              source,
              created_at: createdAt
            };
          },
          async triggerDataIngestion(_: unknown, { forceRefresh }: { forceRefresh?: boolean }) {
            return await runDataIngestion(db, forceRefresh ?? false);
          }
        },
        Subscription: {
          tickerUpdated: {
            subscribe: () => pubsub.subscribeTicker(),
            resolve: (payload: TickerEvent): TickerEvent => payload
          },
          reviewAdded: {
            subscribe: () => pubsub.subscribeReview(),
            resolve: (payload: NewReviewEvent): NewReviewEvent => payload
          },
          stockUpdated: {
            subscribe: () => pubsub.subscribeStock(),
            resolve: (payload: StockUpdateEvent): StockUpdateEvent => payload
          }
        }
      }
    }
  ]);
}
