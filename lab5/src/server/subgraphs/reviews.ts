import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from '../shared/gql.js';
import type { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import type { ReviewRecord, ProductRecord } from '../db.js';
import { pubsub } from '../pubsub.js';
import type { GraphQLContext } from './products.js';

export const reviewsTypeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  type Review @key(fields: "id") {
    id: ID!
    productId: ID!
    author: String!
    rating: Int!
    comment: String!
    createdAt: String!
  }

  extend type Product @key(fields: "id") {
    id: ID!
    reviews: [Review!]!
    reviewCount: Int!
    averageRating: Float!
  }

  type Mutation {
    addReview(productId: ID!, author: String!, rating: Int!, comment: String!): Review!
  }
`;

export function createReviewsSubgraph(db: DatabaseSync) {
  return buildSubgraphSchema([
    {
      typeDefs: reviewsTypeDefs,
      resolvers: {
        Review: {
          __resolveReference(ref: { id: string }) {
            return db.prepare('SELECT * FROM reviews WHERE id = ?').get(ref.id) as ReviewRecord | undefined;
          },
          createdAt(review: ReviewRecord) {
            return review.created_at;
          },
          productId(review: ReviewRecord) {
            return review.product_id;
          }
        },
        Product: {
          async reviews(product: ProductRecord, _: unknown, context: GraphQLContext) {
            return await context.dataLoaders.reviewsByProductId.load(product.id);
          },
          async reviewCount(product: ProductRecord, _: unknown, context: GraphQLContext) {
            const list = await context.dataLoaders.reviewsByProductId.load(product.id);
            return list.length;
          },
          async averageRating(product: ProductRecord, _: unknown, context: GraphQLContext) {
            const list = await context.dataLoaders.reviewsByProductId.load(product.id);
            if (list.length === 0) return product.rating || 0;
            const sum = list.reduce((acc, r) => acc + r.rating, 0);
            return Math.round((sum / list.length) * 10) / 10;
          }
        },
        Mutation: {
          addReview(
            _: unknown,
            {
              productId,
              author,
              rating,
              comment
            }: {
              productId: string;
              author: string;
              rating: number;
              comment: string;
            }
          ) {
            // Проверяем существование товара
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as ProductRecord | undefined;
            if (!product) {
              throw new Error(`Product with ID "${productId}" not found.`);
            }

            const id = `rev-${uuidv4().slice(0, 8)}`;
            const createdAt = new Date().toISOString();
            const safeRating = Math.max(1, Math.min(5, Math.round(rating)));

            db.prepare(`
              INSERT INTO reviews (id, product_id, author, rating, comment, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(id, productId, author, safeRating, comment, createdAt);

            // Обновляем средний рейтинг товара
            const avgRow = db.prepare(`
              SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ?
            `).get(productId) as { avg_rating: number };

            if (avgRow && avgRow.avg_rating) {
              db.prepare('UPDATE products SET rating = ? WHERE id = ?')
                .run(Math.round(avgRow.avg_rating * 10) / 10, productId);
            }

            // Публикуем событие для WebSocket-подписчиков
            pubsub.publishReview({
              id,
              productId,
              productTitle: product.title,
              author,
              rating: safeRating,
              comment,
              createdAt
            });

            return {
              id,
              product_id: productId,
              author,
              rating: safeRating,
              comment,
              created_at: createdAt
            };
          }
        }
      }
    }
  ]);
}
