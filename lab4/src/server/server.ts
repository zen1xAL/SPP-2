import http from 'node:http';
import { createApp } from './app.js';
import { CONFIG } from './config.js';
import { initDatabase, closeDatabase } from './db.js';
import { WebSocketHandler } from './ws/handler.js';

async function bootstrap(): Promise<void> {
  await initDatabase();

  let wsHandler: WebSocketHandler | null = null;
  const app = createApp(() => wsHandler!.getRoom());
  const server = http.createServer(app);

  wsHandler = new WebSocketHandler(server);

  server.listen(CONFIG.PORT, () => {
    process.stdout.write(`[CyberTanks] Сервер запущен на http://localhost:${CONFIG.PORT}\n`);
    process.stdout.write(`[CyberTanks] WebSocket эндпоинт ws://localhost:${CONFIG.PORT}/ws\n`);
  });

  const shutdown = async () => {
    process.stdout.write('[CyberTanks] Остановка сервера...\n');
    if (wsHandler) {
      wsHandler.close();
    }
    await closeDatabase();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  process.stderr.write(`Ошибка старта сервера: ${String(err)}\n`);
  process.exit(1);
});
