import 'dotenv/config';
import { createApp } from './app.js';
import { initDb, pool } from './db.js';

const PORT = Number(process.env.PORT || '3000');

async function startServer(): Promise<void> {
  let retries = 5;
  while (retries > 0) {
    try {
      await initDb();
      break;
    } catch (err) {
      retries -= 1;
      if (retries === 0) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
  }

  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`🚀 TaskFlow SPA API успешно запущен на порту ${PORT}`);
    console.log(`🌐 Доступен по адресу: http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Ошибка запуска сервера:', err);
  process.exit(1);
});
