# Полный технический разбор Лабораторной работы №2

**Назначение документа**: Исчерпывающее фундаментальное руководство по архитектуре, работе с базой данных PostgreSQL, устройству Dockerfile, Docker Compose и взаимодействию компонентов приложения (React SPA + Express REST API).

---

## 1. Общая архитектура системы

Приложение построено по архитектуре **разделённого клиента и сервера**:

```
                       [ Браузер пользователя ]
                                  │
                                  │ HTTP (JSON / multipart)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ КОНТЕЙНЕР 1: taskflow_app (Node.js / Express)                          │
│                                                                        │
│ 1. Статический сервер: отдает скомпилированный React SPA (HTML/JS/CSS) │
│ 2. REST API эндпоинты (/api/tasks, /api/tasks/:id/attachments)         │
│ 3. Multer: прием и сохранение файлов в том uploads_data                │
│ 4. Драйвер pg: пул TCP-соединений к базе данных                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   │ Внутренняя сеть Docker (порт 5432)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ КОНТЕЙНЕР 2: taskflow_postgres (PostgreSQL 16)                         │
│                                                                        │
│ 1. Таблица tasks: задачи, статусы, дедлайны                            │
│ 2. Таблица attachments: метаданные файлов (связь ON DELETE CASCADE)    │
│ 3. Хранилище на диске: том postgres_data                               │
└────────────────────────────────────────────────────────────────────────┘
```

В системе работают **ровно 2 изолированных контейнера**:
1. `taskflow_postgres` – сервер реляционной СУБД PostgreSQL 16.
2. `taskflow_app` – веб-сервер Node.js, объединяющий REST API и раздачу клиентского SPA-приложения.

---

## 2. Построчный анатомический разбор Dockerfile

Файл [lab2/Dockerfile](file:///d:/SPP/7sem/SPP/lab2/Dockerfile) – это декларативная инструкция по сборке неизменяемого образа (**Docker Image**).  
В проекте применен паттерн **многоэтапной сборки (Multi-stage Build)**. Его цель – разделить процесс компиляции (где нужны тяжелые компиляторы и dev-зависимости) и процесс выполнения (где нужен только чистый Node.js рантайм).

### Исходный код Dockerfile:

```dockerfile
1:  FROM node:20-alpine AS builder
2:  
3:  WORKDIR /app
4:  
5:  COPY package*.json ./
6:  RUN npm ci
7:  
8:  COPY src/ ./src/
9:  COPY tsconfig*.json ./
10: 
11: RUN npm run build:client
12: RUN npm run build:server
13: 
14: FROM node:20-alpine AS runner
15: 
16: WORKDIR /app
17: 
18: ENV NODE_ENV=production
19: ENV PORT=3000
20: ENV UPLOAD_DIR=/app/uploads
21: 
22: COPY package*.json ./
23: RUN npm ci --only=production
24: 
25: COPY --from=builder /app/dist/server ./dist/server
26: COPY --from=builder /app/dist/client ./dist/client
27: 
28: RUN mkdir -p /app/uploads
29: 
30: EXPOSE 3000
31: 
32: CMD ["node", "dist/server/server.js"]
```

### Построчное объяснение каждой инструкции:

* **Строка 1: `FROM node:20-alpine AS builder`**  
  * `FROM node:20-alpine`: Базовым образом берется официальный дистрибутив Node.js версии 20 на базе **Alpine Linux**. Alpine – это ультралегковесный Linux размером всего ~5 МБ (вместо стандартного Ubuntu размером ~100+ МБ).  
  * `AS builder`: Присваивает первому этапу сборки имя `builder`. Все временные файлы этого этапа будут уничтожены после завершения сборки.

* **Строка 3: `WORKDIR /app`**  
  * Задает рабочую директорию внутри файловой системы контейнера. Все последующие команды (`COPY`, `RUN`) будут выполняться в каталоге `/app`.

* **Строка 5: `COPY package*.json ./`**  
  * Копирует файлы манифестов (`package.json` и `package-lock.json`) с вашего компьютера внутрь контейнера.  
  * **Почему они копируются отдельно до исходного кода?** Это критически важный механизм **кэширования слоев Docker (Layer Caching)**. Установка пакетов `npm ci` занимает десятки секунд. Если вы измените строчку в React-компоненте, но не меняли `package.json`, Docker пропустит шаг скачивания зависимостей и мгновенно возьмет готовый кэш.

* **Строка 6: `RUN npm ci`**  
  * Выполняет команду чистой установки (Clean Install). В отличие от `npm install`, команда `npm ci` строго устанавливает зависимости по зафиксированным хэшам из `package-lock.json`, гарантируя 100% идентичность версий пакетов в любой среде.

* **Строка 8–9: `COPY src/ ./src/` и `COPY tsconfig*.json ./`**  
  * Копирует исходный код клиента и сервера, а также файлы конфигурации TypeScript (`tsconfig.json`, `tsconfig.server.json`).

* **Строка 11: `RUN npm run build:client`**  
  * Запускает бандлер **Vite**. Vite берет исходный React-код (`.tsx`), компилирует его, оптимизирует и складывает итоговые статические минифицированные файлы (HTML, JS, CSS) в папку `dist/client`.

* **Строка 12: `RUN npm run build:server`**  
  * Запускает компилятор TypeScript `tsc`. Он транспилирует серверный код Node.js из `src/server/*.ts` в исполняемый JavaScript в папке `dist/server/*.js`.

* **Строка 14: `FROM node:20-alpine AS runner`**  
  * **СТАРТ ВТОРОГО ЭТАПА**. Docker отбрасывает всё, что было на этапе `builder` (гигабайты dev-зависимостей, TypeScript-компилятор, исходники), и начинает с абсолютно чистого, стерильного образа Alpine. Этот этап называется `runner` и пойдет в продакшен.

* **Строка 16: `WORKDIR /app`**  
  * Устанавливает рабочую директорию чистого контейнера.

* **Строки 18–20: `ENV NODE_ENV=production`, `PORT=3000`, `UPLOAD_DIR=/app/uploads`**  
  * Задает системные переменные окружения (`process.env`) внутри контейнера. `NODE_ENV=production` переключает Express и Node.js в режим максимальной производительности (включается кэширование, отключаются отладочные трассировки).

* **Строки 22–23: `COPY package*.json ./` и `RUN npm ci --only=production`**  
  * Снова устанавливает зависимости, но флаг `--only=production` игнорирует блок `devDependencies`. Устанавливаются только жизненно необходимые для рантайма библиотеки (`express`, `pg`, `multer`, `uuid`, `cors`, `dotenv`).

* **Строки 25–26: `COPY --from=builder /app/dist/server ./dist/server` и `COPY --from=builder .../client ./dist/client`**  
  * Инструкция копирует **только готовые результаты сборки** из первого этапа (`builder`) в финальный контейнер. Исходники `.tsx` и компилятор `tsc` в итоговый образ не попадают.  
  * **Результат**: образ весит всего ~150 МБ вместо ~800+ МБ.

* **Строка 28: `RUN mkdir -p /app/uploads`**  
  * Создает пустую директорию внутри контейнера для хранения загружаемых пользователями файлов.

* **Строка 30: `EXPOSE 3000`**  
  * Документирует, что контейнер слушает сетевой порт 3000.

* **Строка 32: `CMD ["node", "dist/server/server.js"]`**  
  * Главная инструкция запуска. При старте контейнера операционная система внутри него исполнит команду `node dist/server/server.js`. Если этот процесс завершится – контейнер остановится.

---

## 3. Разбор Docker Compose и оркестрации контейнеров

Файл [lab2/docker-compose.yml](file:///d:/SPP/7sem/SPP/lab2/docker-compose.yml) объединяет два изолированных контейнера в единую рабочую систему:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: taskflow_postgres
    restart: always
    environment:
      POSTGRES_DB: taskdb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d taskdb"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    container_name: taskflow_app
    restart: always
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DATABASE_URL: postgresql://postgres:postgres@db:5432/taskdb
      UPLOAD_DIR: /app/uploads
      NODE_ENV: production
      MAX_FILE_SIZE_MB: 5
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - uploads_data:/app/uploads

volumes:
  postgres_data:
  uploads_data:
```

### Ключевые механизмы Docker Compose:

1. **Внутренняя сеть (Docker DNS)**:
   * Обратите внимание на строку:  
     `DATABASE_URL: postgresql://postgres:postgres@db:5432/taskdb`
   * В качестве хоста указан не `localhost` и не IP-адрес, а имя сервиса **`db`**. Docker автоматически поднимает внутренний DNS-сервер: когда контейнер `app` обращается к имени `db`, Docker преобразует его во внутренний IP-адрес контейнера базы данных.
2. **Проверка готовности (Healthcheck)**:
   * База данных PostgreSQL после старта контейнера еще 2–3 секунды инициализирует файлы на диске. Если Express запустится раньше, он упадет с ошибкой `Connection refused`.
   * Команда `pg_isready -U postgres -d taskdb` опрашивает СУБД каждые 5 секунд.
   * Конструкция `depends_on: db: condition: service_healthy` блокирует запуск контейнера `app` до тех пор, пока PostgreSQL не подтвердит статус полной готовности.
3. **Сохранность данных (Persistent Volumes)**:
   * Контейнеры по своей природе эфемерны: если удалить контейнер, все файлы внутри него стираются.
   * Блок `volumes`:
     * `postgres_data:/var/lib/postgresql/data` – монтирует системную папку БД во внешний независимый том. Все созданные задачи останутся на месте даже при полном пересоздании контейнеров.
     * `uploads_data:/app/uploads` – сохраняет загруженные бинарные файлы вложений.

---

## 4. Глубокий разбор работы с PostgreSQL

Работа с базой данных в коде сосредоточена в файлах [lab2/src/server/db.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/db.ts) и [lab2/src/server/routes.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/routes.ts).

### 4.1. Пул соединений (Connection Pool)
В коде используется не одиночное соединение `Client`, а пул `Pool`:
```typescript
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
```
* **Зачем нужен пул?** Установка TCP-соединения с СУБД требует авторизации, шифрования и выделения памяти на стороне PostgreSQL, что занимает 20–50 миллисекунд.  
* Пул заранее держит открытыми несколько сокетов. Когда в Express приходит HTTP-запрос, драйвер мгновенно берет свободное соединение из пула, выполняет SQL-запрос за доли миллисекунды и возвращает сокет обратно в пул.

### 4.2. Схема базы данных и каскадное удаление (CASCADE)
Метод `initDb()` создает две связанные таблицы:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size BIGINT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

* **Связь `FOREIGN KEY ... ON DELETE CASCADE`**:  
  Поле `task_id` в таблице `attachments` ссылается на `id` в таблице `tasks`.  
  Директива `ON DELETE CASCADE` означает: если из таблицы `tasks` удаляется строка с идентификатором задачи, ядро PostgreSQL **автоматически на уровне СУБД удаляет все связанные строки из таблицы `attachments`**. Не нужно писать отдельные запросы на удаление вложений в БД.

### 4.3. Атомарные транзакции (ACID) при создании задачи
В эндпоинте `POST /api/tasks` ([lab2/src/server/routes.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/routes.ts), строки 123–169) выполняется вставка в две разные таблицы. Если задача создалась, а запись о файле завершилась сбоем, база окажется в несогласованном состоянии. Для защиты используется транзакция:

```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN'); // Старт транзакции

  // 1. Вставляем задачу
  const taskRes = await client.query('INSERT INTO tasks ...');

  // 2. Вставляем вложение (если файл прикреплен)
  if (req.file) {
    await client.query('INSERT INTO attachments ...');
  }

  await client.query('COMMIT'); // Фиксация: обе записи сохранены
} catch (dbErr) {
  await client.query('ROLLBACK'); // Откат: если была ошибка, ничего не сохранится
  if (req.file) {
    await deletePhysicalFile(req.file.filename); // Чистим бинарный файл с диска
  }
  throw dbErr;
} finally {
  client.release(); // Обязательно возвращаем клиента в пул
}
```

### 4.4. Извлечение задач и вложений за 1 запрос (Решение проблемы N+1)
В наивной реализации программисты часто делают 1 запрос на получение задач, а потом в цикле делают по запросу на вложения для каждой задачи. Если задач 100 – это 101 запрос к базе данных (проблема N+1).

В проекте используется мощная возможность PostgreSQL – **JSON-агрегация**:

```sql
SELECT 
  t.id, 
  t.title, 
  t.description, 
  t.status, 
  to_char(t.due_date, 'YYYY-MM-DD') as "dueDate", 
  t.created_at as "createdAt", 
  t.updated_at as "updatedAt",
  COALESCE(
    json_agg(
      json_build_object(
        'id', a.id,
        'originalName', a.original_name,
        'storedName', a.stored_name,
        'mimeType', a.mime_type,
        'size', a.size::text,
        'uploadedAt', a.uploaded_at
      )
    ) FILTER (WHERE a.id IS NOT NULL), '[]'
  ) as attachments
FROM tasks t
LEFT JOIN attachments a ON t.id = a.task_id
GROUP BY t.id
ORDER BY t.created_at DESC;
```

* `LEFT JOIN attachments a`: присоединяет строки вложений к задачам.
* `json_build_object(...)`: собирает метаданные файла в JSON-объект.
* `json_agg(...)`: упаковывает все вложения конкретной задачи в JSON-массив прямо внутри ядра PostgreSQL.
* `COALESCE(..., '[]')`: если у задачи нет файлов, возвращает пустой массив `[]` вместо `null`.  
* **Результат**: ВСЕ задачи вместе со ВСЕМИ вложениями возвращаются из базы данных за **1 единственный сетевой запрос**.

---

## 5. Как устроен React SPA и почему страница не перезагружается?

1. **Единственный HTML-документ**:
   * При открытии сайта браузер загружает ровно один файл `index.html`.
2. **Управление состоянием в памяти (React State)**:
   * В [lab2/src/client/src/App.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/App.tsx) массив задач хранится в хуке `const [tasks, setTasks] = useState<Task[]>([])`.
   * Когда вы меняете статус задачи в выпадающем списке, компонент вызывает асинхронную функцию:
     ```typescript
     await updateTask(id, { status: newStatus });
     ```
   * Браузер выполняет фоновый HTTP-запрос `PUT /api/tasks/:id` через нативный `fetch()`. Вкладка браузера не мигает и не перезагружается.
   * Сервер возвращает ответ со статусом `200 OK`. React обновляет локальное состояние `setTasks(...)`, и Virtual DOM перерисовывает **только одну карточку задачи**, не трогая остальную часть экрана.
3. **Загрузка файлов без формы**:
   * Для отправки файла на сервер используется браузерный API `FormData`:
     ```typescript
     const formData = new FormData();
     formData.append('title', title);
     formData.append('attachment', file);
     await fetch('/api/tasks', { method: 'POST', body: formData });
     ```
   * Браузер сам формирует заголовок `multipart/form-data; boundary=...` и отправляет файл в фоне.

---

## 6. Практический справочник команд управления Docker

Все команды выполняются в директории `lab2/`:

```bash
# 1. Запуск всей системы (сборка образов + запуск в фоне)
docker compose up --build -d

# 2. Проверка запущенных контейнеров (их должно быть ровно 2)
docker compose ps

# 3. Просмотр живых логов обоих сервисов
docker compose logs -f

# 4. Просмотр логов только приложения Express
docker compose logs -f app

# 5. Просмотр логов только базы данных PostgreSQL
docker compose logs -f db

# 6. Остановка контейнеров без удаления сохраненных данных
docker compose down

# 7. Полная очистка контейнеров и томов базы данных (сброс к нулевому состоянию)
docker compose down -v
```
