import { composeServices } from '@apollo/composition';
import { ApolloGateway, LocalGraphQLDataSource } from '@apollo/gateway';
import type { GraphQLSchema } from 'graphql';
import type { DatabaseSync } from 'node:sqlite';
import { createProductsSubgraph, productsTypeDefs } from './subgraphs/products.js';
import { createReviewsSubgraph, reviewsTypeDefs } from './subgraphs/reviews.js';
import { createInventorySubgraph, inventoryTypeDefs } from './subgraphs/inventory.js';

type SubgraphInputList = Parameters<typeof composeServices>[0];

export interface SupergraphSetup {
  gateway: InstanceType<typeof ApolloGateway>;
  supergraphSdl: string;
  subgraphNames: readonly string[];
  productsSchema: GraphQLSchema;
}

export function createSupergraphGateway(db: DatabaseSync): SupergraphSetup {
  const productsSchema = createProductsSubgraph(db);
  const reviewsSchema = createReviewsSubgraph(db);
  const inventorySchema = createInventorySubgraph(db);

  const subgraphs: SubgraphInputList = [
    { name: 'products', typeDefs: productsTypeDefs },
    { name: 'reviews', typeDefs: reviewsTypeDefs },
    { name: 'inventory', typeDefs: inventoryTypeDefs }
  ];

  const compositionResult = composeServices(subgraphs);
  if (compositionResult.errors && compositionResult.errors.length > 0) {
    const messages = compositionResult.errors.map((e: { message: string }) => e.message).join('\n');
    throw new Error(`Apollo Federation Supergraph composition failed:\n${messages}`);
  }

  const schemas: Record<string, GraphQLSchema> = {
    products: productsSchema,
    reviews: reviewsSchema,
    inventory: inventorySchema
  };

  const gateway = new ApolloGateway({
    supergraphSdl: compositionResult.supergraphSdl,
    buildService({ name }: { name: string }) {
      const schema = schemas[name];
      if (!schema) {
        throw new Error(`No local schema found for subgraph: ${name}`);
      }
      return new LocalGraphQLDataSource(schema);
    }
  });

  return {
    gateway,
    supergraphSdl: compositionResult.supergraphSdl || '',
    subgraphNames: ['products', 'reviews', 'inventory'] as const,
    productsSchema
  };
}
