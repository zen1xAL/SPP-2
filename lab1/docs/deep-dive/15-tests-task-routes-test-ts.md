# Разбор файла: tests/task-routes.test.ts

**Путь к файлу**: [tests/task-routes.test.ts](file:///d:/SPP/7sem/SPP/tests/task-routes.test.ts)  
**Роль в архитектуре**: Набор сквозных интеграционных тестов (HTTP Integration Tests), имитация сетевых запросов через библиотеку Supertest, верификация конвейера Express, рендеринга EJS и паттерна Post-Redirect-Get.

---

## 1. Концептуальное и архитектурное назначение

Файл [tests/task-routes.test.ts](file:///d:/SPP/7sem/SPP/tests/task-routes.test.ts) тестирует всю вертикаль приложения целиком (End-to-End на уровне HTTP):
`HTTP-запрос -> Маршрутизатор -> Middleware (Multer) -> Контроллер -> Сервис -> Репозиторий -> Шаблонизатор EJS -> HTML-ответ`

Ключевые аспекты интеграционного тестирования:
1. **Тестирование без открытия реального сетевого порта**: использование библиотеки `supertest` позволяет передавать объект `app` напрямую во внутренний интерфейс `http.Server` среды Node.js, выполняя тесты мгновенно без сетевых коллизий портов.
2. **Проверка соблюдения паттерна PRG**: проверка того, что POST-запросы возвращают статус перенаправления `303 See Other` и заголовок `Location`, а последующий запрос `GET /` отдает обновленный HTML-код.
3. **Эмуляция загрузки multipart-файлов**: проверка сквозной передачи файлов через `.attach()`, их парсинг Multer, сохранение на диск и выдача для скачивания с корректным заголовком `Content-Disposition`.

---

## 2. Ключевые концепции Supertest и протокола HTTP

### 2.1. Имитация HTTP-клиента через Supertest
Библиотека `supertest` оборачивает методы библиотеки `superagent`. Конструкция `request(app).post('/tasks')` компилирует HTTP-пакет в памяти и вызывает метод `app.handle(req, res)` Express. Это позволяет перехватывать заголовки (`res.headers`), тело (`res.text`) и статус-коды (`res.status`).

### 2.2. Заголовок `Content-Disposition` при скачивании
При скачивании файла сервер обязан передать заголовок вида:
```http
Content-Disposition: attachment; filename="sample-upload.txt"
```
Директива `attachment` указывает браузеру открыть диалоговое окно сохранения файла, а не пытаться отобразить его прямо во вкладке.

---

## 3. Построчный разбор тестов

### Строки 1–6: Импорты
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
```
- Импорт стандартных модулей, функций Vitest, библиотеки `supertest` и фабрики приложения `createApp`.

### Строки 8–27: Инициализация тестовой среды
```typescript
describe('HTTP SSR Task Routes Integration Tests', () => {
  const testDir = path.resolve('./data/test-routes');
  const testDataFile = path.join(testDir, 'tasks.json');
  const testUploadDir = path.join(testDir, 'uploads');

  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.DATA_FILE = testDataFile;
    process.env.UPLOAD_DIR = testUploadDir;

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testUploadDir, { recursive: true });
    await fs.writeFile(testDataFile, JSON.stringify([], null, 2), 'utf-8');

    app = createApp();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });
```
- **Строки 15–16**: Переопределяет переменные окружения `DATA_FILE` и `UPLOAD_DIR`, перенаправляя работу тестового экземпляра приложения в папку `./data/test-routes`.
- **Строки 18–22**: Создает папки, пишет пустой JSON-файл и вызывает `createApp()`.
- **Строки 25–27**: Хук `afterAll` удаляет всю временную директорию после выполнения всех тестов набора.

### Строки 29–36: Тест рендеринга главной страницы (GET /)
```typescript
  it('GET / should return 200 OK with rendered HTML', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('TaskFlow SSR');
    expect(res.text).toContain('Всего задач');
  });
```
- Выполняет GET-запрос к корню. Проверяет статус `200`, заголовок `text/html` и присутствие ключевых текстовых маркеров EJS-шаблона в сгенерированном HTML.

### Строки 38–43: Тест фильтрации по query-параметру
```typescript
  it('GET /?status=pending should filter correctly and return 200 OK', async () => {
    const res = await request(app).get('/?status=pending');

    expect(res.status).toBe(200);
    expect(res.text).toContain('filter-pill active');
  });
```
- Проверяет, что сервер отдает статус `200` и активирует CSS-класс `filter-pill active` для соответствующей вкладки навигации.

### Строки 45–62: Сквозной тест создания задачи по паттерну PRG
```typescript
  it('POST /tasks should implement PRG pattern (redirect 303) on task creation', async () => {
    const res = await request(app)
      .post('/tasks')
      .field('title', 'Интеграционный тест создания задачи')
      .field('description', 'Тестовое описание')
      .field('status', 'in_progress')
      .field('dueDate', '2026-12-31')
      .field('currentFilter', 'all');

    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/?status=all');
    expect(res.headers.location).toContain('success=');

    const followRes = await request(app).get('/');
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain('Интеграционный тест создания задачи');
    expect(followRes.text).toContain('31.12.2026');
  });
```
- **Строки 46–52**: Метод `.field(key, value)` формирует multipart-запрос с полями формы.
- **Строки 54–56**: Проверяет соблюдение стандарта PRG: сервер отвечает статусом `303`, а в заголовке `Location` содержится редирект на главную страницу с сообщением об успехе.
- **Строки 58–61**: Имитирует переход браузера по редиректу (GET `/`). Проверяет, что созданная задача действительно отображается в разметке и дата отформатирована как `31.12.2026`.

### Строки 64–72: Тест отклонения пустой задачи
```typescript
  it('POST /tasks with empty title should reject with redirect to error', async () => {
    const res = await request(app)
      .post('/tasks')
      .field('title', '   ')
      .field('currentFilter', 'all');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
  });
```
- Проверяет, что попытка создать задачу без названия немедленно перенаправляет пользователя с параметром ошибки `error=`.

### Строки 74–90: Тест создания задачи с прикреплением файла
```typescript
  it('POST /tasks with file attachment should upload and bind file to task', async () => {
    const dummyFilePath = path.join(testDir, 'sample-upload.txt');
    await fs.writeFile(dummyFilePath, 'Файл вложения для теста SSR');

    const res = await request(app)
      .post('/tasks')
      .field('title', 'Задача с прикрепленным файлом')
      .field('currentFilter', 'all')
      .attach('attachment', dummyFilePath);

    expect(res.status).toBe(303);

    const followRes = await request(app).get('/');
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain('Задача с прикрепленным файлом');
    expect(followRes.text).toContain('sample-upload.txt');
  });
```
- Метод `.attach('attachment', dummyFilePath)` имитирует выбор файла в `<input type="file">`.
- Проверяет успешный PRG-редирект (303) и появление имени файла `sample-upload.txt` в блоке вложений на главной странице.

### Строки 92–107: Тест скачивания бинарного вложения
```typescript
  it('GET /tasks/:id/attachments/:attachmentId/download should download file', async () => {
    const rawData = await fs.readFile(testDataFile, 'utf-8');
    const tasks = JSON.parse(rawData);
    const taskWithAtt = tasks.find((t: { attachments: unknown[] }) => t.attachments.length > 0);

    expect(taskWithAtt).toBeDefined();
    const att = taskWithAtt.attachments[0];

    const res = await request(app).get(
      `/tasks/${taskWithAtt.id}/attachments/${att.id}/download`
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toBe('Файл вложения для теста SSR');
  });
```
- Находит в JSON-хранилище задачу с прикрепленным файлом.
- Выполняет GET-запрос к эндпоинту скачивания `/tasks/:id/attachments/:attachmentId/download`.
- Проверяет статус `200`, заголовок `content-disposition: attachment` и совпадение содержимого файла.

### Строки 109–115: Тест обработки запроса несуществующего файла
```typescript
  it('GET /tasks/:id/attachments/non-existent/download should return 404', async () => {
    const res = await request(app).get(
      '/tasks/some-task/attachments/non-existent-id/download'
    );
    expect(res.status).toBe(404);
  });
```
- Проверяет отдачу статуса `404 Not Found` при попытке скачать несуществующий файл.
