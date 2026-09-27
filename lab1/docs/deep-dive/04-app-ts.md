# Разбор файла: src/app.ts

**Путь к файлу**: [src/app.ts](file:///d:/SPP/7sem/SPP/src/app.ts)  
**Роль в архитектуре**: Композиционный корень приложения (Composition Root), фабрика экземпляра Express (`createApp`), настройка цепочки middleware и глобальный перехватчик ошибок.

---

## 1. Концептуальное и архитектурное назначение

Файл [src/app.ts](file:///d:/SPP/7sem/SPP/src/app.ts) инкапсулирует сборку всего HTTP-приложения без привязки к конкретному сетевому порту. Это архитектурное решение (паттерн «Application Factory») дает ключевые преимущества:
1. **Изоляция для интеграционных тестов**: тестовый фреймворк `supertest` может передавать экземпляр `app` напрямую в виртуальный сервер Node.js без необходимости занимать реальный порт операционной системы.
2. **Централизованный Composition Root**: именно здесь создаются и соединяются между собой все уровни Clean Architecture: репозиторий (`JsonTaskRepository`), сервис (`TaskService`), контроллер (`TaskController`) и маршруты (`TaskRouter`).
3. **Единый конвейер промежуточного ПО (Middleware Pipeline)**: строгий порядок регистрации парсеров тела запроса, раздачи статических файлов и обработки непредвиденных исключений.

---

## 2. Ключевые концепции Node.js и особенности среды выполнения

### 2.1. Эмуляция `__dirname` и `__filename` в ES Modules
В классическом CommonJS переменные `__dirname` и `__filename` предоставлялись средой исполнения автоматически. В стандарте ECMAScript Modules (ESM) они отсутствуют. Для их получения используется глобальный объект метаданных модуля `import.meta.url` (формата `file:///...`) и системная утилита `fileURLToPath`:
```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```
Это гарантирует платформонезависимое определение путей к шаблонам и статическим ресурсам как на Windows, так и на Linux/macOS.

### 2.2. Конвейер Middleware и паттерн «Цепочка обязанностей» (Chain of Responsibility)
Express обрабатывает входящие HTTP-запросы через последовательность функций middleware. Каждая функция принимает аргументы `(req, res, next)`. Если функция завершает обработку, она отсылает ответ (`res.render`, `res.redirect`); если нет – передает управление дальше вызовом `next()`.

### 2.3. Механизм 4-аргументного Error Handling Middleware
В Express специальный статус имеют функции промежуточного ПО с ровно **четырьмя** аргументами: `(err, req, res, next)`. Движок Express анализирует свойство `.length` переданной функции: если `length === 4`, эта функция исключается из стандартного конвейера и вызывается только тогда, когда любой предыдущий обработчик передал ошибку в `next(err)` или выбросил исключение в синхронном блоке.

---

## 3. Построчный разбор кода

### Строки 1–10: Импорты стандартных модулей и слоев приложения
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { TaskController } from './controllers/task-controller.js';
import { createTaskRouter } from './routes/task-routes.js';
import { TaskService } from './services/task-service.js';
import { JsonTaskRepository } from './storage/json-task-repository.js';
```
- **Строки 1–3**: Префикс `node:` указывает на встроенные модули Node.js (`fs`, `path`, `url`), предотвращая конфликт с одноименными npm-пакетами.
- **Строка 4**: Импорт функции `express` по умолчанию и чистых типов TypeScript (`type Application`, `type Request` и т.д.). Использование ключевого слова `type` позволяет компилятору `tsc` полностью вырезать эти импорты из результирующего JS-кода (type-only import), оптимизируя размер бандла и скорость загрузки.
- **Строка 5**: Импорт библиотеки `multer` для проверки ошибок загрузки файлов через `instanceof multer.MulterError`.
- **Строки 6–9**: Импорт компонентов слоев архитектуры приложения.

### Строки 11–12: Определение путей текущего модуля
```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```
- Преобразует URL модуля в абсолютный путь к файлу в локальной файловой системе и определяет родительский каталог (`src/` при запуске через tsx или `dist/` при запуске скомпилированного кода).

### Строка 14–15: Фабричная функция `createApp`
```typescript
export function createApp(): Application {
  const app = express();
```
- Экспортирует функцию, возвращающую строго типизированный экземпляр приложения Express.

### Строки 17–23: Разрешение путей к представлениям и статике с поддержкой разработки и продакшена
```typescript
  const viewsPath = fs.existsSync(path.join(__dirname, 'views'))
    ? path.join(__dirname, 'views')
    : path.resolve(process.cwd(), 'src/views');

  const publicPath = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : path.resolve(process.cwd(), 'src/public');
```
- **Проблема сборки**: при локальной разработке (`tsx`) исполняемый файл находится в `src/`, а директории `views` и `public` лежат рядом. При компиляции TypeScript в папку `dist/` файлы `.ejs` и `.css` не компилируются `tsc` и остаются в `src/`.
- **Решение**: тернарная проверка с помощью синхронного вызова `fs.existsSync`. Если папка существует рядом с исполняемым файлом (в `dist`), берется она, иначе происходит возврат к путям в корне проекта (`src/views`, `src/public`).

### Строки 25–26: Настройка шаблонизатора EJS
```typescript
  app.set('view engine', 'ejs');
  app.set('views', viewsPath);
```
- Указывает Express использовать движок EJS при вызовах `res.render(...)` и задает базовую директорию поиска шаблонов.

### Строки 28–30: Подключение стандартных парсеров и раздачи статики
```typescript
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/public', express.static(publicPath));
```
- **Строка 28**: `express.urlencoded({ extended: true })` парсит тела входящих POST-запросов от HTML-форм со стандартным заголовком `Content-Type: application/x-www-form-urlencoded`. Параметр `extended: true` активирует библиотеку `qs`, позволяющую корректно парсить вложенные объекты и массивы.
- **Строка 29**: `express.json()` парсит входящие JSON-пейлоады (`application/json`).
- **Строка 30**: Раздает статические файлы (CSS, шрифты) по URL-префиксу `/public`.

### Строки 32–38: Композиционный корень (Dependency Injection)
```typescript
  const dataFile = process.env.DATA_FILE || './data/tasks.json';
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const repository = new JsonTaskRepository(dataFile);
  const service = new TaskService(repository, uploadDir);
  const controller = new TaskController(service);

  app.use('/', createTaskRouter(controller));
```
- Конфигурационные параметры путей читаются из `process.env` с безопасными значениями по умолчанию.
- Создаются экземпляры классов снизу вверх в соответствии с принципом инверсии зависимостей (Dependency Inversion):
  1. `JsonTaskRepository` инициализируется путем к JSON-файлу.
  2. `TaskService` принимает абстракцию репозитория и путь к папке загрузок.
  3. `TaskController` получает сервис бизнес-логики.
  4. `createTaskRouter(controller)` создает маршруты и регистрирует их в корневом пути `/`.

### Строки 40–59: Централизованный обработчик ошибок (Global Error Handler)
```typescript
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
```
- **Строка 40**: Сигнатура из 4 параметров перехватывает любые необработанные ошибки конвейера.
- **Строки 44–51**: Сужение типа (Type Narrowing) через `err instanceof multer.MulterError`. Если загружаемый файл превысил лимит размера (код `'LIMIT_FILE_SIZE'`), формируется понятное сообщение на русском языке со статусом `400 Bad Request`.
- **Строки 52–55**: Если ошибка является стандартным экземпляром `Error`, извлекается ее сообщение.
- **Строки 57–58**: В соответствии с паттерном PRG (Post-Redirect-Get) пользователю не отдается «сухая» страница 500 с трейсом стека. Вместо этого выставляется статус и происходит редирект на главную страницу с передачей безопасного закодированного сообщения об ошибке через query-параметр `?error=...`.

### Строки 61–62: Завершение фабрики
```typescript
  return app;
}
```
- Возвращает полностью готовый к работе экземпляр приложения.
