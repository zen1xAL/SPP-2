import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { getDatabase, type DatabaseSync } from './db.js';
import { runDataIngestion } from './collectors/ingestion.js';
import { createDataLoaders } from './dataloaders.js';
import { createComplexityPlugin, type ComplexityContext } from './complexity.js';
import { createTracingPlugin, updateSubscriptionCount } from './tracing.js';
import { createSupergraphGateway } from './gateway.js';
import { RealtimeTickerService } from './services/ticker-service.js';
import { SERVER_CONFIG, COMPLEXITY_CONFIG } from './shared/constants.js';

export interface ServerContext extends ComplexityContext {
  db: DatabaseSync;
  dataLoaders: ReturnType<typeof createDataLoaders>;
}

export async function createApp(customDb?: DatabaseSync) {
  const db = customDb || getDatabase();

  await runDataIngestion(db);

  const app = express();
  app.use(cors());
  app.use(express.json());

  const httpServer = http.createServer(app);

  const { gateway, productsSchema } = createSupergraphGateway(db);

  const server = new ApolloServer<ServerContext>({
    gateway,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      createComplexityPlugin({
        maxComplexity: COMPLEXITY_CONFIG.DEFAULT_MAX_COMPLEXITY,
        maxDepth: COMPLEXITY_CONFIG.DEFAULT_MAX_DEPTH
      }),
      createTracingPlugin()
    ]
  });

  await server.start();

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: SERVER_CONFIG.SUBSCRIPTIONS_PATH
  });

  useServer(
    {
      schema: productsSchema,
      context: async (): Promise<ServerContext> => ({
        db,
        dataLoaders: createDataLoaders(db)
      }),
      onConnect: () => {
        updateSubscriptionCount(1);
      },
      onDisconnect: () => {
        updateSubscriptionCount(-1);
      }
    },
    wsServer as unknown as Parameters<typeof useServer>[1]
  );

  const apolloHandler = expressMiddleware(server, {
    context: async (): Promise<ServerContext> => ({
      db,
      dataLoaders: createDataLoaders(db)
    })
  });

  app.use(SERVER_CONFIG.GRAPHQL_ENDPOINT, apolloHandler as unknown as express.RequestHandler);

  const clientDist = path.resolve(process.cwd(), SERVER_CONFIG.CLIENT_DIST_PATH);
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith(SERVER_CONFIG.GRAPHQL_ENDPOINT)) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  const tickerService = new RealtimeTickerService(db);

  return { app, httpServer, server, db, wsServer, tickerService };
}

const PORT = process.env.PORT || SERVER_CONFIG.DEFAULT_PORT;

if (process.env.NODE_ENV !== 'test') {
  createApp()
    .then(({ httpServer, tickerService }) => {
      tickerService.start();
      httpServer.listen(PORT, () => {
        console.log(`[Lab 5] Supergraph Gateway running at http://localhost:${PORT}${SERVER_CONFIG.GRAPHQL_ENDPOINT}`);
        console.log(`[Lab 5] GraphQL Subscriptions active at ws://localhost:${PORT}${SERVER_CONFIG.SUBSCRIPTIONS_PATH}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
