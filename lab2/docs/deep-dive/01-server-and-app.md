# Разбор файлов: src/server/server.ts и src/server/app.ts

**Пути к файлам**:
* [src/server/server.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/server.ts) – Точка входа в процесс Node.js, управление жизненным циклом и сетевым сокетом.
* [src/server/app.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/app.ts) – Конвейер Express, middleware, раздача SPA-клиента и централизованный перехватчик ошибок.

---

## 1. Построчный разбор `server.ts`

Файл `server.ts` запускает приложение. Его ключевая задача – подготовить инфраструктуру (подключиться к СУБД) перед тем, как открыть входящий сетевой порт для пользователей.

```typescript
1: import 'dotenv/config';
2: import { createApp } from './app.js';
3: import { initDb, pool } from './db.js';
4: 
5: const PORT = Number(process.env.PORT || '3000');
```
* **Строка 1**: Загружает переменные окружения из файла `.env` в системный объект `process.env`.
* **Строки 2–3**: Импортирует фабрику приложения `createApp` и модуль базы данных. Обратите внимание на расширение `.js`: в стандарте Node.js ES Modules (ESM) оно обязательно, даже когда код пишется на TypeScript.
* **Строка 5**: Читает порт из переменных окружения. Если переменная не задана, берется порт по умолчанию `3000`.

### Механизм отказоустойчивого запуска с повторными попытками (Retry Loop):

```typescript
7:  async function startServer(): Promise<void> {
8:    let retries = 5;
9:    while (retries > 0) {
10:     try {
11:       await initDb();
12:       break;
13:     } catch (err) {
14:       retries -= 1;
15:       if (retries === 0) {
16:         throw err;
17:       }
18:       await new Promise((res) => setTimeout(res, 2000));
19:     }
20:   }
```
* **Зачем здесь цикл `while (retries > 0)`?**  
  В контейнеризированных средах (Docker Compose) контейнер базы данных и контейнер приложения запускаются одновременно. PostgreSQL тратит 2–3 секунды на инициализацию файлов на диске. Если бы Node.js попытался подключиться мгновенно и один раз, приложение бы упало с фатальной ошибкой `ECONNREFUSED`.  
  Этот цикл делает до 5 попыток подключения с паузой в 2 секунды (`setTimeout`), гарантируя успешный старт даже при задержках запуска базы данных.

### Запуск HTTP-сервера и Graceful Shutdown:

```typescript
22:   const app = createApp();
23: 
24:   const server = app.listen(PORT, () => {
25:     console.log(`🚀 TaskFlow SPA API успешно запущен на порту ${PORT}`);
26:     console.log(`🌐 Доступен по адресу: http://localhost:${PORT}`);
27:   });
28: 
29:   const shutdown = async () => {
30:     server.close(async () => {
31:       await pool.end();
32:       process.exit(0);
33:     });
34:   };
35: 
36:   process.on('SIGINT', shutdown);
37:   process.on('SIGTERM', shutdown);
38: }
```
* **Строка 24**: `app.listen(PORT)` передает команду операционной системе открыть TCP-порт 3000 и слушать входящие сетевые пакеты.
* **Строки 29–37**: Мягкое завершение процесса (Graceful Shutdown). При нажатии `Ctrl + C` (сигнал `SIGINT`) или остановке контейнера (`SIGTERM`):
  1. `server.close()` прекращает прием новых сетевых запросов и ждет завершения тех запросов, которые уже выполняются.
  2. `await pool.end()` закрывает все открытые сокеты пула к PostgreSQL, освобождая память СУБД.
  3. `process.exit(0)` штатно завершает процесс с кодом успеха.

---

## 2. Построчный разбор `app.ts`

Файл `app.ts` собирает конвейер промежуточного ПО (Middleware Pipeline) Express:

```typescript
1: import fs from 'node:fs';
2: import path from 'node:path';
3: import { fileURLToPath } from 'node:url';
4: import express, { type Application, type Request, type Response, type NextFunction } from 'express';
5: import cors from 'cors';
6: import multer from 'multer';
7: import { apiRouter } from './routes.js';
8: 
9: const __filename = fileURLToPath(import.meta.url);
10: const __dirname = path.dirname(__filename);
```
* **Строки 9–10**: В стандартах ES Modules нет встроенных глобальных переменных `__dirname` и `__filename`. Они эмулируются через нативный объект метаданных `import.meta.url` и модуль `node:url`.

### Сборка приложения `createApp()`:

```typescript
12: export function createApp(): Application {
13:   const app = express();
14: 
15:   app.use(cors());
16:   app.use(express.json());
17:   app.use(express.urlencoded({ extended: true }));
18: 
19:   app.use('/api', apiRouter);
```
* **Строка 15: `app.use(cors())`**: Подключает Cross-Origin Resource Sharing. При локальной разработке React запускается на `http://localhost:5173`, а сервер на `http://localhost:3000`. Без заголовков CORS браузер блокировал бы запросы между разными портами из соображений безопасности.
* **Строка 16: `app.use(express.json())`**: Встроенный парсер. Если заголовок запроса `Content-Type: application/json`, он считывает входящий поток байт, вызывает `JSON.parse` и помещает готовый JavaScript-объект в `req.body`.
* **Строка 17: `express.urlencoded`**: Парсит стандартные формы.
* **Строка 19**: Подключает все эндпоинты задач по префиксу `/api`.

### Раздача скомпилированного React SPA в продакшене:

```typescript
21:   const clientDist = fs.existsSync(path.resolve(__dirname, '../client'))
22:     ? path.resolve(__dirname, '../client')
23:     : path.resolve(process.cwd(), 'dist/client');
24: 
25:   if (fs.existsSync(clientDist)) {
26:     app.use(express.static(clientDist));
27:     app.get('*', (_req: Request, res: Response) => {
28:       res.sendFile(path.join(clientDist, 'index.html'));
29:     });
30:   }
```
* **Зачем здесь `app.get('*', ...)`?**  
  Это так называемый **SPA Fallback Routing**.  
  В Single Page Application маршрутизация виртуальная (ее контролирует JavaScript в браузере). Если пользователь нажмет `F5` на любом внутреннем URL (например, `http://localhost:3000/tasks/123`), физического файла с таким именем на диске сервера нет.  
  Инструкция `app.get('*')` отдает главный `index.html` на любой незанятый маршрут. Браузер загружает React, а React сам разбирает URL и показывает нужную часть интерфейса.

### Централизованный обработчик ошибок (Error Handler):

```typescript
32:   app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
33:     let errorMessage = 'Внутренняя ошибка сервера';
34:     let statusCode = 500;
35: 
36:     if (err instanceof multer.MulterError) {
37:       statusCode = 400;
38:       if (err.code === 'LIMIT_FILE_SIZE') {
39:         errorMessage = 'Файл слишком большой. Максимальный размер: 5 МБ.';
40:       } else {
41:         errorMessage = `Ошибка загрузки файла: ${err.message}`;
42:       }
43:     } else if (err instanceof Error) {
44:       errorMessage = err.message;
45:       statusCode = 400;
46:     }
47: 
48:     res.status(statusCode).json({ error: errorMessage });
49:   });
```
* Функция с 4 параметрами `(err, req, res, next)` в Express является финальным звеном перехвата ошибок.
* Если во время загрузки файла сработал лимит размера библиотеки Multer (`LIMIT_FILE_SIZE`), сервер возвращает клиенту HTTP-статус `400 Bad Request` и чистый JSON: `{"error": "Файл слишком большой..."}`.
* Клиентский React SPA перехватывает этот JSON и выводит красивый баннер ошибки пользователю.
