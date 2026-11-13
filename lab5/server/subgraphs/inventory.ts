import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from '../shared/gql.js';
import type { DatabaseSync } from 'node:sqlite';
import type { StockRecord, ProductRecord, WarehouseRecord } from '../db.js';
import { pubsub } from '../pubsub.js';
import { INVENTORY_CONFIG } from '../shared/constants.js';
import type { GraphQLContext } from './products.js';

export const inventoryTypeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  type Warehouse {
    id: ID!
    name: String!
    city: String!
  }

  type WarehouseStock {
    id: ID!
    productId: ID!
    warehouseId: ID!
    warehouseName: String!
    city: String!
    quantity: Int!
    updatedAt: String!
  }

  extend type Product @key(fields: "id") {
    id: ID!
    inventory: [WarehouseStock!]!
    totalStock: Int!
    inStock: Boolean!
  }

  type Query {
    warehouses: [Warehouse!]!
  }

  type Mutation {
    updateStock(productId: ID!, warehouseId: ID!, quantity: Int!): WarehouseStock!
  }
`;

interface UpdateStockArgs {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export function createInventorySubgraph(db: DatabaseSync) {
  return buildSubgraphSchema([
    {
      typeDefs: inventoryTypeDefs,
      resolvers: {
        WarehouseStock: {
          productId(stock: StockRecord): string {
            return stock.product_id;
          },
          warehouseId(stock: StockRecord): string {
            return stock.warehouse_id;
          },
          warehouseName(stock: StockRecord): string {
            return stock.warehouse_name || INVENTORY_CONFIG.DEFAULT_WAREHOUSE_NAME;
          },
          updatedAt(stock: StockRecord): string {
            return stock.updated_at;
          }
        },
        Product: {
          async inventory(product: ProductRecord, _: unknown, context: GraphQLContext): Promise<StockRecord[]> {
            return await context.dataLoaders.stocksByProductId.load(product.id);
          },
          async totalStock(product: ProductRecord, _: unknown, context: GraphQLContext): Promise<number> {
            const list = await context.dataLoaders.stocksByProductId.load(product.id);
            return list.reduce((sum, s) => sum + s.quantity, 0);
          },
          async inStock(product: ProductRecord, _: unknown, context: GraphQLContext): Promise<boolean> {
            const list = await context.dataLoaders.stocksByProductId.load(product.id);
            return list.some((s) => s.quantity > 0);
          }
        },
        Query: {
          warehouses(): WarehouseRecord[] {
            const rows = db.prepare('SELECT * FROM warehouses ORDER BY name ASC').all();
            return rows as unknown as WarehouseRecord[];
          }
        },
        Mutation: {
          updateStock(_: unknown, { productId, warehouseId, quantity }: UpdateStockArgs): StockRecord {
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as ProductRecord | undefined;
            if (!product) {
              throw new Error(`Product with ID "${productId}" not found.`);
            }

            const warehouse = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(warehouseId) as WarehouseRecord | undefined;
            if (!warehouse) {
              throw new Error(`Warehouse with ID "${warehouseId}" not found.`);
            }

            const safeQty = Math.max(0, Math.round(quantity));
            const now = new Date().toISOString();

            const existing = db.prepare(
              'SELECT * FROM stocks WHERE product_id = ? AND warehouse_id = ?'
            ).get(productId, warehouseId) as StockRecord | undefined;

            const stockId = existing ? existing.id : `stock-${productId}-${warehouseId}`;

            if (existing) {
              db.prepare('UPDATE stocks SET quantity = ?, updated_at = ? WHERE id = ?')
                .run(safeQty, now, stockId);
            } else {
              db.prepare(`
                INSERT INTO stocks (id, product_id, warehouse_id, quantity, updated_at)
                VALUES (?, ?, ?, ?, ?)
              `).run(stockId, productId, warehouseId, safeQty, now);
            }

            pubsub.publishStock({
              productId,
              warehouseName: warehouse.name,
              city: warehouse.city,
              quantity: safeQty,
              updatedAt: now
            });

            return {
              id: stockId,
              product_id: productId,
              warehouse_id: warehouseId,
              warehouse_name: warehouse.name,
              city: warehouse.city,
              quantity: safeQty,
              updated_at: now
            };
          }
        }
      }
    }
  ]);
}
