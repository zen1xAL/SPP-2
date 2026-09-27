import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import { apiRouter } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', apiRouter);

  const clientDist = fs.existsSync(path.resolve(__dirname, '../client'))
    ? path.resolve(__dirname, '../client')
    : path.resolve(process.cwd(), 'dist/client');

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let errorMessage = 'Внутренняя ошибка сервера';
    let statusCode = 500;

    if (err instanceof multer.MulterError) {
      statusCode = 400;
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = 'Файл слишком большой. Максимальный размер: 5 МБ.';
      } else {
        errorMessage = `Ошибка загрузки файла: ${err.message}`;
      }
    } else if (err instanceof Error) {
      errorMessage = err.message;
      statusCode = 400;
    }

    res.status(statusCode).json({ error: errorMessage });
  });

  return app;
}
