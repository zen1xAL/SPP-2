import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { TaskController } from './controllers/task-controller.js';
import { createTaskRouter } from './routes/task-routes.js';
import { TaskService } from './services/task-service.js';
import { JsonTaskRepository } from './storage/json-task-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Application {
  const app = express();

  const viewsPath = fs.existsSync(path.join(__dirname, 'views'))
    ? path.join(__dirname, 'views')
    : path.resolve(process.cwd(), 'src/views');

  const publicPath = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : path.resolve(process.cwd(), 'src/public');

  app.set('view engine', 'ejs');
  app.set('views', viewsPath);

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/public', express.static(publicPath));

  const dataFile = process.env.DATA_FILE || './data/tasks.json';
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const repository = new JsonTaskRepository(dataFile);
  const service = new TaskService(repository, uploadDir);
  const controller = new TaskController(service);

  app.use('/', createTaskRouter(controller));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let errorMessage = 'Внутренняя ошибка сервера';
    let statusCode = 500;

    if (err instanceof multer.MulterError) {
      statusCode = 400;
      if (err.code === 'LIMIT_FILE_SIZE') {
        const limitMb = process.env.MAX_FILE_SIZE_MB || '5';
        errorMessage = `Файл слишком большой. Максимальный размер: ${limitMb} МБ.`;
      } else {
        errorMessage = `Ошибка загрузки файла: ${err.message}`;
      }
    } else if (err instanceof Error) {
      errorMessage = err.message;
      statusCode = 400;
    }

    res.status(statusCode);
    res.redirect(`/?error=${encodeURIComponent(errorMessage)}`);
  });

  return app;
}
