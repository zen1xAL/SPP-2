import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { initDb, pool } from './db.js';
import { logger } from './logger.js';

const PORT = Number(process.env.PORT || 3000);

async function initDbWithRetry(retries = 10, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      logger.info(`Попытка подключения к базе данных (${i}/${retries})...`);
      await initDb();
      logger.info('База данных успешно инициализирована');
      return;
    } catch (err) {
      logger.warn(`Ошибка подключения к БД (${i}/${retries}): ${err instanceof Error ? err.message : String(err)}`);
      if (i === retries) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

async function startServer(): Promise<void> {
  try {
    await initDbWithRetry();

    const app = createApp();
    const server = app.listen(PORT, () => {
      logger.info(`TaskFlow RBAC сервер успешно запущен на порту ${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development'
      });
    });

    const shutdown = async (signal: string) => {
      logger.info(`Получен сигнал ${signal}. Завершение работы сервера...`);
      server.close(async () => {
        await pool.end();
        logger.info('Пул соединений PostgreSQL закрыт. Процесс завершен.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Критический сбой старта сервера', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    process.exit(1);
  }
}

startServer();
