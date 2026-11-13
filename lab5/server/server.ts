import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { getDatabase, type DatabaseSync } from './db.js';
import { runDataIngestion } from './collectors/ingestion.js';
import { createDataLoaders } from './dataloaders.js';
import { createComplexityPlugin } from './complexity.js';
import { createTracingPlugin, updateSubscriptionCount } from './tracing.js';
import { createSupergraphGateway } from './gateway.js';
import { pubsub } from './pubsub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(customDb?: DatabaseSync) {
  const db = customDb || getDatabase();

  await runDataIngestion(db);

  const app = express();
  app.use(cors());
  app.use(express.json());

  const httpServer = http.createServer(app);

  const { gateway } = createSupergraphGateway(db);

  const server = new ApolloServer({
    gateway,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      createComplexityPlugin({
        maxComplexity: 1000,
        maxDepth: 6
      }),
      createTracingPlugin()
    ]
  });

  await server.start();

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });

  useServer(
    {
      schema: gateway.schema!,
      context: async () => ({
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
    wsServer as any
  );

  app.use(
    '/graphql',
    expressMiddleware(server as any, {
      context: async () => ({
        db,
        dataLoaders: createDataLoaders(db)
      })
    }) as any
  );

  const clientDist = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/graphql')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  return { app, httpServer, server, db, wsServer };
}

function startRealtimeTickerGenerator(db: DatabaseSync) {
  setInterval(() => {
    try {
      const randomProduct = db.prepare(`
        SELECT id, title, price FROM products ORDER BY RANDOM() LIMIT 1
      `).get() as { id: string; title: string; price: number } | undefined;

      if (!randomProduct) return;

      const changePercent = Math.round((Math.random() * 4 - 2) * 10) / 10;
      if (changePercent === 0) return;

      const newPrice = Math.max(1, Math.round((randomProduct.price * (1 + changePercent / 100)) * 100) / 100);
      const now = new Date().toISOString();

      db.prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, randomProduct.id);
      db.prepare('INSERT INTO price_history (id, product_id, price, recorded_at) VALUES (?, ?, ?, ?)')
        .run(`ph-${randomProduct.id}-${Date.now()}`, randomProduct.id, newPrice, now);

      pubsub.publishTicker({
        productId: randomProduct.id,
        title: randomProduct.title,
        oldPrice: randomProduct.price,
        newPrice,
        changePercent,
        timestamp: now
      });
    } catch {
      // Ignore background errors
    }
  }, 4000);
}

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== 'test') {
  createApp().then(({ httpServer, db }) => {
    startRealtimeTickerGenerator(db);
    httpServer.listen(PORT, () => {
      console.log(`[Lab 5] Supergraph Gateway running at http://localhost:${PORT}/graphql`);
      console.log(`[Lab 5] GraphQL Subscriptions active at ws://localhost:${PORT}/graphql`);
    });
  }).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
