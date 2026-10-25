# Полное руководство для защиты Лабораторной работы №3 (TaskFlow RBAC)

Данный документ содержит исчерпывающий технический разбор кодовой базы, архитектуры, механизмов безопасности и принципов развертывания проекта в Docker. Материал структурирован строго академически и технически – без поверхностных упрощений.

---

## Содержание

1. [Глобальная архитектура и назначение проекта](#1-глобальная-архитектура-и-назначение-проекта)
2. [Развертывание и инфраструктура (Docker & Local)](#2-развертывание-и-инфраструктура-docker--local)
3. [Сквозные сценарии работы (Full Lifecycles с трассировкой кода)](#3-сквозные-сценарии-работы-full-lifecycles-с-трассировкой-кода)
   - [3.1. Регистрация пользователя](#31-регистрация-пользователя)
   - [3.2. Аутентификация (Логин) и защита от брутфорса](#32-аутентификация-логин-и-защита-от-брутфорса)
   - [3.3. Ролевая модель (RBAC) и выполнение операций с задачами](#33-ролевая-модель-rbac-и-выполнение-операций-с-задачами)
   - [3.4. Мониторинг и удаленный отзыв активных сессий](#34-мониторинг-и-удаленный-отзыв-активных-сессий)
   - [3.5. Сброс пароля через одноразовый токен Email](#35-сброс-пароля-через-одноразовый-токен-email)
4. [Детальный разбор серверной части (Каждый файл и функция)](#4-детальный-разбор-серверной-части-каждый-файл-и-функция)
5. [Детальный разбор клиентской части (Каждый компонент и модуль)](#5-детальный-разбор-клиентской-части-каждый-компонент-и-модуль)
6. [База данных: схема и связи](#6-база-данных-схема-и-связи)
7. [Чеклист типичных вопросов преподавателя на защите](#7-чеклист-типичных-вопросов-преподавателя-на-защите)

---

## 1. Глобальная архитектура и назначение проекта

**TaskFlow RBAC** – это веб-приложение для коллективного управления задачами с жестким разграничением прав на основе ролей (Role-Based Access Control, RBAC), контролем безопасности сессий и загрузкой вложений.

### Ключевые архитектурные решения
* **Архитектурный шаблон**: Client-Server SPA (Single Page Application). Сервер предоставляет RESTful API, клиент работает в браузере на React 18.
* **Backend**: Express.js на TypeScript (Node.js 20+ LTS, strict mode, ES-модули).
* **Frontend**: React 18 + TypeScript + сборщик Vite.
* **База данных**: PostgreSQL 16 (реляционная модель с внешними ключами и каскадным удалением).
* **Безопасность**:
  - Пароли хэшируются через **bcrypt** с солью (cost factor 10).
  - Временные ключи доступа **JWT** со сроком жизни 15 минут.
  - **Гибридный контроль сессий**: JWT проверяется криптографически + валидируется по таблице `sessions` в БД для поддержки мгновенного удаленного отзыва (Revocation).
  - **Защита от подбора паролей (Rate Limiting)**: блокировка при 5 неудачных попытках на 15 минут с отдачей HTTP 429 Too Many Requests и заголовка `Retry-After`.
  - **Безопасность файлов**: проверка расширений (whitelist), ограничение размера до 5 МБ, рандомизация имен через UUIDv4 (защита от Path Traversal).
  - **Структурированное логирование**: формат JSON, сквозной `X-Request-Id` (UUIDv4) для корреляции логов.

```
┌────────────────────────────────────────────────────────┐
│                   Клиент (React SPA)                   │
│   App ──► AuthModal / TaskForm / SessionsModal / ...   │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON / Multipart
                           │ Заголовок: Authorization: Bearer <jwt>
                           ▼
┌────────────────────────────────────────────────────────┐
│               Express API Сервер (:3000)               │
│                                                        │
│  [requestLogger] ──► Сквозной X-Request-Id, JSON-логи  │
│  [rateLimiter]   ──► Ограничение брутфорса (429)       │
│  [authenticate]  ──► Проверка подписи JWT + БД сессии  │
│  [requireRole]   ──► RBAC: admin / manager / viewer    │
│  [multer upload] ──► Санитизация и сохранение вложений │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
                ▼                        ▼
┌──────────────────────────────┐  ┌──────────────────────┐
│        PostgreSQL 16         │  │   Файловая система   │
│  users, sessions, tasks,     │  │   /app/uploads/      │
│  attachments, password_resets│  │   (UUID-имена)       │
└──────────────────────────────┘  └──────────────────────┘
```

---

## 2. Развертывание и инфраструктура (Docker & Local)

### 2.1. Как устроен [Dockerfile](file:///d:/SPP/7sem/SPP/lab3/Dockerfile)
В проекте реализован **Multi-stage build** (многоэтапная сборка), состоящий из двух стадий:

1. **Стадия `builder` (образ `node:20-alpine`)**:
   - Копируются манифесты `package*.json` и устанавливаются все зависимости, включая `devDependencies` (`RUN npm ci`).
   - Копируется исходный код (`src/`) и конфигурации TypeScript (`tsconfig*.json`).
   - Выполняется компиляция клиента в статику: `npm run build:client` (Vite собирает bundle в `dist/client`).
   - Выполняется транспиляция TypeScript сервера: `npm run build:server` (tsc компилирует код в `dist/server`).
2. **Стадия `runner` (чистый образ `node:20-alpine`)**:
   - Устанавливаются **только production-зависимости** (`RUN npm ci --only=production`), отсекая тяжелые компиляторы (Vite, TypeScript, типы).
   - Из стадии `builder` копируются только готовые скомпилированные артефакты:
     ```dockerfile
     COPY --from=builder /app/dist/server ./dist/server
     COPY --from=builder /app/dist/client ./dist/client
     ```
   - Создается каталог для загрузок `/app/uploads`.
   - Запускается сервер: `CMD ["node", "dist/server/server.js"]`.

**Зачем нужен multi-stage build?**
- **Минимизация размера**: итоговый контейнер не содержит исходников TypeScript, Vite и dev-пакетов.
- **Безопасность**: в продакшн-окружении отсутствуют инструменты сборки, что снижает вектор возможных атак.

### 2.2. Как устроен [docker-compose.yml](file:///d:/SPP/7sem/SPP/lab3/docker-compose.yml)
Файл оркеструет два сервиса:
1. **`db` (PostgreSQL 16 Alpine)**:
   - Переменные окружения: `POSTGRES_DB: taskdb_lab3`, `POSTGRES_USER: postgres`, `POSTGRES_PASSWORD: postgres`.
   - Проброс порта: `5432:5432`.
   - Именованный volume: `lab3_postgres_data` монтируется в `/var/lib/postgresql/data` (данные не теряются при перезапуске).
   - **Healthcheck**: проверка готовности БД через команду `pg_isready -U postgres -d taskdb_lab3`. Опрос каждые 5 секунд.
2. **`app` (Node.js Express + React)**:
   - Собирается из контекста текущей директории (`build: .`).
   - Порт `3000:3000`.
   - Переменная `DATABASE_URL`: `postgresql://postgres:postgres@db:5432/taskdb_lab3` (обращение к сервису БД по имени контейнера в общей docker-сети).
   - Зависимость: `depends_on: db: condition: service_healthy`. Контейнер приложения **не запустится**, пока PostgreSQL не пройдет проверку готовности.
   - Именованный volume: `lab3_uploads_data` монтируется в `/app/uploads` (сохранность файлов пользователей).

### 2.3. Команды для терминала

```bash
# 1. Запуск через Docker Compose (полный стек: БД + Приложение)
docker compose up --build

# Остановка контейнеров
docker compose down

# 2. Локальный запуск без Docker (требуется локальный PostgreSQL на порту 5432)
# Установка зависимостей
npm install

# Проверка статической типизации TypeScript
cmd.exe /c "npm run typecheck"

# Запуск автоматических тестов (Vitest)
cmd.exe /c "npm test"

# Запуск в режиме разработки (одновременно запускается Express на 3000 и Vite на 5173)
npm run dev

# Сборка проекта
npm run build

# Запуск скомпилированного сервера
npm start
```

---

## 3. Сквозные сценарии работы (Full Lifecycles с трассировкой кода)

### 3.1. Регистрация пользователя
1. **Клиент**:
   - Пользователь заполняет форму в [AuthModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/AuthModal.tsx) (вкладка «Регистрация»): `email`, `password`, `role`.
   - Нажатие кнопки отправляет запрос через функцию [api.ts:register](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L124).
   - Выполняется HTTP `POST /api/auth/register` с телом `{ email, password, role }`.
2. **Сервер**:
   - Маршрут перехватывается в [routes.ts:apiRouter.post('/auth/register')](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L40).
   - **Валидация**: проверяется наличие символа `@` в email и длина пароля $\ge 6$ символов. При ошибке возвращается HTTP 400 Bad Request (`VALIDATION_ERROR`).
   - Роль валидируется по множеству `['admin', 'manager', 'viewer']`. Если указана некорректная роль, назначается дефолтная: `'viewer'`.
   - **Проверка уникальности**: SQL-запрос `SELECT id FROM users WHERE email = $1`. Если запись найдена – возврат HTTP 409 Conflict (`EMAIL_ALREADY_EXISTS`).
   - **Хэширование**: пароль хэшируется через `bcrypt.hashSync(password, 10)`. Открытый пароль нигде не сохраняется.
   - **Сохранение**: генерируется `userId = uuidv4()`, выполняется `INSERT INTO users (id, email, password_hash, role) ...`.
   - Логируется структурированное событие `auth.register` и клиенту возвращается статус **201 Created**.

---

### 3.2. Аутентификация (Логин) и защита от брутфорса
1. **Клиент**:
   - Пользователь вводит учетные данные в [AuthModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/AuthModal.tsx) (или нажимает кнопку быстрой авторизации Seed-пользователя).
   - Вызывается [api.ts:login](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L112) $\to$ `POST /api/auth/login`.
2. **Сервер (Шаг 1: Rate Limiter)**:
   - Запрос проходит через middleware [rateLimiter.ts:checkLoginRateLimit](file:///d:/SPP/7sem/SPP/lab3/src/server/rateLimiter.ts#L16).
   - Извлекается IP клиента (`req.ip` или заголовок `X-Forwarded-For`).
   - Проверяется `Map<string, AttemptRecord>`: если данный IP заблокирован (`lockedUntil > now`), запрос **немедленно отсекается**:
     - Устанавливается HTTP-заголовок `Retry-After: <секунды>`.
     - Возвращается статус **HTTP 429 Too Many Requests** с кодом `TOO_MANY_REQUESTS`.
3. **Сервер (Шаг 2: Проверка пользователя и пароля)**:
   - В [routes.ts:116](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L116) из БД запрашивается пользователь:
     `SELECT id, email, password_hash, role, failed_attempts, locked_until FROM users WHERE email = $1`.
   - Если пользователь не найден: вызывается `recordFailedLogin(clientIp)` и отдается HTTP 401 Unauthorized (`INVALID_CREDENTIALS`).
   - Если учетная запись заблокирована по полю `locked_until`: отдается HTTP 429 (`ACCOUNT_LOCKED`).
   - Проверка хэша пароля: `bcrypt.compareSync(password, user.password_hash)`.
   - **В случае неверного пароля**:
     - Вызывается `recordFailedLogin(clientIp)`.
     - Инкрементируется `failed_attempts` в БД.
     - Если попыток $\ge 5$, устанавливается `locked_until = NOW() + 15 минут`.
     - Возвращается HTTP 401.
4. **Сервер (Шаг 3: Успешный вход и создание сессии)**:
   - При совпадении пароля: сбрасываются счетчики неудачных попыток в БД (`failed_attempts = 0, locked_until = NULL`) и в памяти (`resetFailedLogin(clientIp)`).
   - Генерируется уникальный `sessionId = uuidv4()`.
   - Формируется JWT токен через [auth.ts:generateAccessToken](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L37):
     ```typescript
     jwt.sign({ userId, email, role, sessionId }, JWT_SECRET, { expiresIn: '15m' })
     ```
   - Вычисляется криптографический SHA-256 хэш токена `tokenHashed = hashToken(token)`.
   - В таблицу `sessions` вставляется запись:
     `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at) ...`.
   - Возвращается **HTTP 200 OK** с объектом `{ message, token, user, session }`.
5. **Клиент**:
   - `api.ts` сохраняет токен и профиль в `localStorage` (`taskflow_token`, `taskflow_user`).
   - `App.tsx` обновляет состояние `currentUser`, закрывает модальное окно и запрашивает задачи.

---

### 3.3. Ролевая модель (RBAC) и выполнение операций с задачами

Таблица разграничения прав доступа:

| Операция | HTTP Метод | URL | Роль `viewer` | Роль `manager` | Роль `admin` |
| :--- | :--- | :--- | :---: | :---: | :---: |
| Просмотр списка задач | `GET` | `/api/tasks` | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено |
| Просмотр одной задачи | `GET` | `/api/tasks/:id` | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено |
| Скачивание файла | `GET` | `/api/tasks/:id/attachments/:aid/download` | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено |
| Создание задачи | `POST` | `/api/tasks` | ❌ **403 Forbidden** | ✅ Разрешено | ✅ Разрешено |
| Редактирование задачи | `PUT` | `/api/tasks/:id` | ❌ **403 Forbidden** | ✅ Разрешено | ✅ Разрешено |
| Удаление задачи | `DELETE` | `/api/tasks/:id` | ❌ **403 Forbidden** | ✅ Разрешено | ✅ Разрешено |
| Прикрепление файла | `POST` | `/api/tasks/:id/attachments` | ❌ **403 Forbidden** | ✅ Разрешено | ✅ Разрешено |
| Удаление файла | `DELETE` | `/api/tasks/:id/attachments/:aid` | ❌ **403 Forbidden** | ✅ Разрешено | ✅ Разрешено |
| Просмотр своих сессий | `GET` | `/api/auth/sessions` | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено |
| Просмотр чужих сессий | `GET` | `/api/auth/sessions` | ❌ Скрыты | ❌ Скрыты | ✅ Видит все |
| Отзыв своей сессии | `DELETE` | `/api/auth/sessions/:id` | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено |
| Отзыв чужой сессии | `DELETE` | `/api/auth/sessions/:id` | ❌ **403 Forbidden** | ❌ **403 Forbidden** | ✅ Разрешено |

#### Как это работает в коде на каждом запросе:
1. Запрос приходит с заголовком: `Authorization: Bearer <token>`.
2. **Middleware 1: [auth.ts:authenticateToken](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L49)**:
   - Проверяет наличие токена (если нет – HTTP 401 `UNAUTHORIZED`).
   - Верифицирует подпись и срок действия JWT через `jwt.verify(token, JWT_SECRET)`. Если просрочен – HTTP 401 `TOKEN_EXPIRED`.
   - Запрашивает статус сессии из БД: `SELECT is_revoked, expires_at FROM sessions WHERE id = $1`.
   - Если `is_revoked === true` – HTTP 401 `SESSION_REVOKED`.
   - Наполняет объект `req.user = { id, email, role, sessionId }`.
   - Вызывает `next()`.
3. **Middleware 2: [auth.ts:requireRole('admin', 'manager')](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L125)**:
   - Сверяет `req.user.role`: если роль не входит в список разрешенных, возвращает **HTTP 403 Forbidden** с сообщением:
     `Недостаточно прав. Требуются роли: admin, manager. Ваша роль: viewer`.
4. **Контроллер**:
   - При успешном прохождении middleware выполняется бизнес-логика (например, создание задачи с вложением в транзакции через `BEGIN ... COMMIT`).

---

### 3.4. Мониторинг и удаленный отзыв активных сессий
1. Пользователь открывает окно сессий кнопкой «Сессии» в [Header.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/Header.tsx).
2. [SessionsModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/SessionsModal.tsx) запрашивает `GET /api/auth/sessions`:
   - Если пользователь `admin` – сервер возвращает последние 50 сессий всех пользователей системы.
   - Если `manager` или `viewer` – возвращаются только сессии текущего пользователя (`WHERE s.user_id = $1`).
   - Клиент парсит User-Agent строкой `parseUserAgent()` и отображает понятное название браузера (Chrome, Edge, Firefox, Safari) и ОС (Windows, macOS, Linux, iOS, Android).
   - Текущая сессия подсвечивается тегом «Текущая сессия» (`row.id === req.user.sessionId`).
3. Пользователь нажимает «Отозвать» на другой сессии:
   - Отправляется запрос `DELETE /api/auth/sessions/:id`.
   - Сервер в [routes.ts:283](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L283) проверяет права: если сессия принадлежит другому пользователю, а инициатор не администратор – возврат **HTTP 403 Forbidden**.
   - Сервер выполняет `UPDATE sessions SET is_revoked = true WHERE id = $1` и возвращает **204 No Content**.
4. **Что происходит на устройстве с отозванной сессией?**
   - При следующей попытке любого действия (открытие страницы, клик фильтра, создание задачи) middleware `authenticateToken` проверяет БД, обнаруживает `is_revoked = true` и возвращает **HTTP 401 SESSION_REVOKED**.
   - Клиентский перехватчик в [api.ts:101](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L101) перехватывает код `SESSION_REVOKED`, стирает токен из `localStorage` и выбрасывает модальное окно авторизации с предупреждением.

---

### 3.5. Сброс пароля через одноразовый токен Email
1. В окне входа пользователь нажимает «Сброс пароля» и вводит свой email.
2. Отправляется `POST /api/auth/forgot-password`.
3. В [email.ts:17](file:///d:/SPP/7sem/SPP/lab3/src/server/email.ts#L17) генерируется 32-байтный криптографически стойкий токен: `crypto.randomBytes(32).toString('hex')`.
4. В базу `password_resets` записывается **SHA-256 хэш** токена (открытый токен в БД не хранится), со сроком действия 15 минут:
   `INSERT INTO password_resets (id, user_id, token_hash, expires_at) ...`.
5. Имитируется отправка письма (объект сохраняется в памяти и возвращается `previewToken` для демонстрации).
6. Открывается [ResetPasswordModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/ResetPasswordModal.tsx), куда подставляется токен.
7. Пользователь вводит новый пароль $\ge 6$ символов и отправляет `POST /api/auth/reset-password`.
8. Сервер в [routes.ts:350](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L350):
   - Хэширует полученный токен через SHA-256 и ищет его в таблице `password_resets`.
   - Проверяет: существует ли запись, не был ли токен уже использован (`used_at IS NOT NULL`), не истек ли срок (`expires_at < NOW()`). При нарушении – HTTP 422 Unprocessable Entity.
   - **В атомарной транзакции БД (`BEGIN ... COMMIT`)**:
     1. Обновляет хэш пароля пользователя: `UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2`.
     2. Помечает токен сброса использованным: `UPDATE password_resets SET used_at = NOW() WHERE id = $1`.
     3. **Отзывает абсолютно все существующие сессии пользователя**:
        `UPDATE sessions SET is_revoked = true WHERE user_id = $1`.
9. Теперь со старыми токенами войти невозможно – требуется заново авторизоваться с новым паролем.

---

## 4. Детальный разбор серверной части (Каждый файл и функция)

### 4.1. [server.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/server.ts) – Точка входа приложения
- **Назначение**: инициализирует переменные окружения, управляет подключением к базе данных, поднимает HTTP-сервер Express и обеспечивает плавное завершение работы (Graceful Shutdown).
- **Ключевые функции**:
  - `initDbWithRetry(retries = 10, delayMs = 2000)`: цикл подключения к PostgreSQL с повторными попытками. Критически необходим при запуске в Docker, так как контейнер приложения может стартовать быстрее, чем PostgreSQL успеет инициализировать таблицы.
  - `startServer()`: вызывает `initDbWithRetry()`, создает экземпляр приложения через `createApp()` и запускает прослушивание порта (по умолчанию 3000).
  - `shutdown(signal)`: перехватывает сигналы операционной системы `SIGTERM` и `SIGINT` (например, при вызове `docker stop` или `Ctrl+C`). Закрывает прием новых HTTP-соединений, корректно гасит пул соединений к базе (`await pool.end()`) и завершает процесс с кодом `0`.

### 4.2. [app.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/app.ts) – Конфигурация Express
- **Назначение**: фабрика приложения `createApp()`, настройка middleware и единого перехватчика ошибок.
- **Состав middleware**:
  - `cors()`: разрешает кросс-доменные запросы.
  - `express.json()`: парсинг входящих тел запросов в формате JSON.
  - `express.urlencoded({ extended: true })`: парсинг URL-encoded данных форм.
  - `requestLogger`: сквозное логирование входящих запросов в формате JSON.
  - `app.use('/api', apiRouter)`: подключение всех маршрутов API.
  - Раздача статики: если собран клиент (`dist/client`), подключается `express.static` и SPA-маршрутизация с возвратом `index.html` на любые неизвестные маршруты.
  - **Централизованный обработчик ошибок (Global Error Handler)**:
    - Перехватывает ошибки загрузки Multer (`err instanceof multer.MulterError`), например превышение лимита размера `LIMIT_FILE_SIZE` $\to$ статус 400 и понятное сообщение.
    - Перехватывает любые непредвиденные исключения, логирует их уровень `error` с трассировкой стека и возвращает структурированный JSON: `{ error, code, statusCode }`.

### 4.3. [db.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/db.ts) – Слой данных PostgreSQL
- **Назначение**: управление пулом соединений `pg.Pool` и автоматическая миграция/сидирование таблиц.
- **Функции**:
  - `pool`: экспортируемый синглтон пула подключений к PostgreSQL.
  - `initDb()`: выполняет DDL-скрипт создания 5 таблиц (`users`, `sessions`, `password_resets`, `tasks`, `attachments`). Если таблица пользователей пуста, выполняет начальное сидирование 3 пользователей:
    - `admin@taskflow.local` (пароль `AdminPass123!`, роль `admin`)
    - `manager@taskflow.local` (пароль `ManagerPass123!`, роль `manager`)
    - `viewer@taskflow.local` (пароль `ViewerPass123!`, роль `viewer`)
    - Создает 3 демонстрационные задачи с разными статусами (`completed`, `in_progress`, `pending`).

### 4.4. [auth.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts) – Аутентификация и RBAC
- **Назначение**: работа с токенами JWT, хэширование SHA-256 и middleware проверки ролей.
- **Функции**:
  - `hashToken(token: string): string`: хэширует произвольную строку алгоритмом SHA-256 через модуль `node:crypto`.
  - `generateAccessToken(payload: TokenPayload): string`: генерирует подписанный JWT с полезной нагрузкой (`userId`, `email`, `role`, `sessionId`) и временем жизни 15 минут (`process.env.JWT_EXPIRES_IN || '15m'`).
  - `verifyAccessToken(token: string): TokenPayload | null`: валидирует подпись токена секретным ключом `JWT_SECRET`. При ошибке или истечении срока возвращает `null`.
  - `authenticateToken(req, res, next)`: middleware защиты маршрутов. Извлекает токен из заголовка `Authorization: Bearer <token>` или query-параметра `?token=` (используется для ссылки скачивания файлов). Проверяет подпись JWT, затем проверяет в таблице `sessions` флаг `is_revoked` и дату `expires_at`. Помещает профиль пользователя в `req.user`.
  - `requireRole(...allowedRoles: UserRole[])`: фабрика middleware ролевого доступа (RBAC). Если `req.user.role` отсутствует в списке `allowedRoles`, прерывает цепочку со статусом HTTP 403 Forbidden.

### 4.5. [rateLimiter.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/rateLimiter.ts) – Защита от брутфорса
- **Назначение**: ограничение частоты запросов на вход по IP-адресу в оперативной памяти сервера.
- **Параметры**: `MAX_FAILED_ATTEMPTS = 5`, `WINDOW_MS = 15 мин`, `LOCKOUT_MS = 15 мин`.
- **Функции**:
  - `checkLoginRateLimit(req, res, next)`: middleware для маршрута `/api/auth/login`. Если для IP зафиксирован активный lockout, возвращает HTTP 429 Too Many Requests с заголовком `Retry-After: <секунды>` и телом `{ code: 'TOO_MANY_REQUESTS', retryAfterSeconds }`.
  - `recordFailedLogin(ip: string)`: вызывается при неверном пароле. Увеличивает счетчик попыток. При достижении 5 попыток устанавливает `lockedUntil = Date.now() + LOCKOUT_MS`.
  - `resetFailedLogin(ip: string)`: вызывается при успешном входе. Удаляет IP из карты `ipAttempts`.

### 4.6. [upload.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/upload.ts) – Обработка и безопасность файлов
- **Назначение**: загрузка, валидация и хранение файлов на диске с помощью библиотеки `multer`.
- **Конфигурация**:
  - `storage`: сохраняет файлы в каталог `UPLOAD_DIR` (`/app/uploads` или `./uploads`). Имя файла формируется как `${uuidv4()}${safeExt}`, что гарантирует отсутствие коллизий и исключает манипуляции с именами на диске.
  - `fileFilter`: проверяет расширение по белому списку `ALLOWED_EXTENSIONS` (`.pdf`, `.docx`, `.png`, `.jpg`, `.zip`, `.csv`, `.json` и др.). Недопустимые форматы отклоняются с ошибкой.
  - `limits`: максимальный размер `MAX_FILE_SIZE_MB = 5` МБ.
- **Вспомогательные функции**:
  - `sanitizeFileName(name: string): string`: очищает оригинальное имя файла от опасных спецсимволов и последовательностей `../` для безопасного отображения.
  - `getUploadFilePath(storedName: string): string`: возвращает безопасный абсолютный путь к файлу на диске через `path.basename`.
  - `deletePhysicalFile(storedName: string)`: удаляет файл с диска при удалении задачи или вложения.

### 4.7. [email.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/email.ts) – Восстановление доступа
- **Назначение**: безопасная генерация токенов сброса пароля и моделирование отправки Email.
- **Функции**:
  - `createPasswordResetToken(userId, email)`: создает 32-байтный hex-токен, хэширует его в SHA-256, сохраняет в таблицу `password_resets` со сроком 15 минут. Сохраняет сформированное сообщение в переменной `latestEmail` для тестового просмотра.
  - `getLatestResetEmail()`: возвращает последнее сгенерированное письмо (используется для демонстрационного эндпоинта `/api/auth/email-preview`).

### 4.8. [logger.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/logger.ts) – Структурированное логирование
- **Назначение**: генерация машиночитаемых логов в формате JSON.
- **Функции**:
  - `writeLog(entry)`: выводит JSON-строку в `stdout` (для уровней debug, info, warn) или в `stderr` (для error).
  - `logger`: методы `debug()`, `info()`, `warn()`, `error()`.
  - `requestLogger(req, res, next)`: middleware, генерирующий или считывающий `X-Request-Id` (UUIDv4) и замеряющий время ответа `responseTimeMs`. При завершении запроса (`res.on('finish')`) пишет JSON-лог со статусом, URL, методом, IP и временем выполнения.

### 4.9. [routes.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts) – Все маршруты API
Содержит реализацию 12 эндпоинтов:
1. `POST /auth/register` – регистрация пользователя (201 Created).
2. `POST /auth/login` – вход в систему с rate limiting (200 OK).
3. `POST /auth/logout` – отзыв текущей сессии пользователя (204 No Content).
4. `GET /auth/me` – получение текущего профиля из токена (200 OK).
5. `GET /auth/sessions` – список сессий (для админа – все, для остальных – свои) (200 OK).
6. `DELETE /auth/sessions/:id` – отзыв конкретной сессии по ID (204 No Content).
7. `POST /auth/forgot-password` – инициация сброса пароля (200 OK).
8. `POST /auth/reset-password` – подтверждение сброса с новым паролем (200 OK).
9. `GET /auth/email-preview` – получение последнего письма сброса (200 OK).
10. `GET /tasks` – получение задач с фильтром по статусу и подсчетом сводной статистики (200 OK).
11. `GET /tasks/:id` – детальная информация по одной задаче (200 OK).
12. `POST /tasks` – создание задачи с опциональным файлом (права: admin, manager) (201 Created).
13. `PUT /tasks/:id` – обновление полей задачи (права: admin, manager) (200 OK).
14. `DELETE /tasks/:id` – удаление задачи и связанных файлов с диска (права: admin, manager) (200 OK).
15. `POST /tasks/:id/attachments` – добавление файла к существующей задаче (права: admin, manager) (201 Created).
16. `DELETE /tasks/:id/attachments/:attachmentId` – удаление файла (права: admin, manager) (200 OK).
17. `GET /tasks/:id/attachments/:attachmentId/download` – защищенное скачивание файла через `res.download` (200 OK).

---

## 5. Детальный разбор клиентской части (Каждый компонент и модуль)

### 5.1. [types.ts](file:///d:/SPP/7sem/SPP/lab3/src/client/src/types.ts) – Доменные типы
Содержит контракты данных:
- `UserRole`: `'admin' | 'manager' | 'viewer'`.
- `User`: `{ id, email, role }`.
- `Session`: `{ id, userId, email, ipAddress, userAgent, createdAt, expiresAt, isRevoked, isCurrent, isExpired }`.
- `TaskStatus`: `'pending' | 'in_progress' | 'completed'`.
- `Attachment`: `{ id, originalName, storedName, mimeType, size, uploadedAt }`.
- `Task`: полная модель задачи с массивом вложений `attachments`.
- `TaskStats`: `{ total, pending, inProgress, completed, overdue }`.

### 5.2. [api.ts](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts) – Сетевой клиент
- **Класс `ApiError`**: расширяет стандартный `Error`, содержит поля `statusCode`, `code` и `retryAfterSeconds`.
- **Функция `request<T>(endpoint, options)`**:
  - Автоматически подставляет заголовок `Authorization: Bearer <token>` из `localStorage`.
  - При статусе HTTP 204 возвращает `undefined`.
  - При ошибках парсит тело ответа, извлекает `code` и `retryAfterSeconds`.
  - **Автоматический логаут**: если статус 401 и код ошибки `TOKEN_EXPIRED` или `SESSION_REVOKED`, автоматически очищает `localStorage` от старых токенов.
- **Экспортируемые функции**: `login`, `register`, `logout`, `fetchMe`, `fetchSessions`, `revokeSession`, `forgotPassword`, `resetPassword`, `fetchTasks`, `createTask`, `updateTask`, `deleteTask`, `addAttachment`, `deleteAttachment`, `getDownloadUrl`.

### 5.3. [App.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/App.tsx) – Корневой компонент
- **Хранимое состояние**:
  - `currentUser`: профиль авторизованного пользователя (`User | null`).
  - `tasks`: список отображаемых задач (`Task[]`).
  - `stats`: сводная статистика по статусам (`TaskStats`).
  - `currentFilter`: активный фильтр (`'all' | 'pending' | 'in_progress' | 'completed'`).
  - `isAuthOpen`, `isSessionsOpen`, `isResetOpen`, `isFormOpen`: флаги видимости модальных окон и формы.
  - `notification`: всплывающее toast-уведомление (успех/ошибка).
- **Логика**:
  - При монтировании проверяет валидность токена через `fetchMe()`. Если токен невалиден или отсутствует, открывает окно входа.
  - Загружает задачи функцией `loadTasks(filter)`.
  - Передает обработчики изменения статуса, удаления, загрузки файлов в дочерние компоненты.

### 5.4. Компоненты интерфейса ([src/client/src/components/](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components))

1. [Header.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/Header.tsx):
   - Отображает логотип `TaskFlow`, версию системы и текущего пользователя.
   - Бейдж роли пользователя: зеленый для `admin`, синий для `manager`, нейтральный для `viewer`.
   - Если пользователь не `viewer`, показывает кнопку «Новая задача».
   - Кнопки «Сессии» и «Выйти».
2. [MetricsGrid.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/MetricsGrid.tsx):
   - Карточки счетчиков: «Всего задач», «Ожидают», «В работе», «Завершены», «Просрочено».
   - Клик по любой карточке переключает фильтр списка задач.
3. [FilterNav.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/FilterNav.tsx):
   - Сегментированный переключатель табов фильтрации со счетчиками количества задач в каждом статусе.
4. [TaskCard.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/TaskCard.tsx):
   - Карточка отдельной задачи.
   - Функция `isOverdue()`: сверяет текущую дату и `dueDate` задачи (если статус не `completed` и дата в прошлом, карточка подсвечивается красной рамкой и бейджем «Просрочено»).
   - Список прикрепленных файлов с форматированием размера (`formatFileSize`) и ссылкой на безопасное скачивание `getDownloadUrl()`.
   - Если роль `viewer`: скрыты кнопки удаления задачи, удаления файлов, загрузки новых файлов, а статус отображается только для чтения.
5. [TaskForm.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/TaskForm.tsx):
   - Панель создания задачи.
   - Поля: Название, Описание, Срок выполнения (`type="date"`), Статус (`select`), выбор файла (`input type="file"`).
   - Упаковывает данные в `FormData` для отправки multipart-запроса на сервер.
6. [AuthModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/AuthModal.tsx):
   - Модальное окно с тремя вкладками: «Вход», «Регистрация», «Сброс пароля».
   - **Блок быстрого входа в 1 клик**: кнопки для мгновенной авторизации под Seed-пользователями (`admin`, `manager`, `viewer`) – незаменимо для демонстрации преподавателю.
   - Обработка ошибки 429: таймер обратного отсчета секунд блокировки (`retryCountdown`).
7. [SessionsModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/SessionsModal.tsx):
   - Таблица/список активных подключений.
   - Парсит User-Agent в читаемый вид (ОС + Браузер).
   - Показывает IP-адрес, дату входа, срок действия.
   - Кнопка «Отозвать» для принудительного прекращения сессии на другом устройстве.
8. [ResetPasswordModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/ResetPasswordModal.tsx):
   - Форма ввода одноразового hex-токена сброса и нового пароля.
9. [Notification.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/Notification.tsx):
   - Всплывающее информационное окно с поддержкой типов `success` (зеленое) и `error` (красное). Автоматически исчезает через 4 секунды.

---

## 6. База данных: схема и связи

Проект использует 5 таблиц с реляционными связями:

```sql
-- 1. Пользователи
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Сессии (связь с users, каскадное удаление)
CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  ip_address VARCHAR(128) NOT NULL,
  user_agent VARCHAR(512) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false
);

-- 3. Одноразовые токены сброса пароля
CREATE TABLE password_resets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- 4. Задачи (автор может быть удален -> SET NULL)
CREATE TABLE tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  due_date DATE,
  author_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Прикрепленные файлы (каскадное удаление при удалении задачи)
CREATE TABLE attachments (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size BIGINT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

---

## 7. Чеклист типичных вопросов преподавателя на защите

### Вопрос 1: «Зачем проверять сессию в базе данных, если у нас уже есть JWT?»
**Ответ**:
Классический JWT является самодостаточным (stateless) – сервер не может отозвать выданный токен до истечения его срока жизни (`exp`). Если злоумышленник перехватит токен, он сможет выполнять запросы все 15 минут.
В нашей архитектуре реализован паттерн **Stateful JWT / Revocable Tokens**:
1. JWT проверяется криптографически по сигнатуре (быстрая проверка).
2. Из полезной нагрузки извлекается `sessionId`, и сервер проверяет `is_revoked` в таблице `sessions`.
3. Это позволяет мгновенно отозвать любую скомпрометированную сессию (кнопка «Отозвать» или смена пароля), не дожидаясь истечения 15 минут.

---

### Вопрос 2: «Как работает защита от перебора паролей (Rate Limiting)?»
**Ответ**:
Защита реализована на двух уровнях:
1. **По IP-клиента (в памяти, `rateLimiter.ts`)**: при 5 неудачных попытках с одного IP сервер активирует блокировку на 15 минут и возвращает статус `429 Too Many Requests` со стандартным заголовком RFC `Retry-After: 900`.
2. **По учетной записи (в БД, таблица `users`)**: поле `failed_attempts` увеличивается при неверном пароле. При достижении 5 попыток поле `locked_until` блокирует вход для конкретного email на 15 минут, даже если атакующий меняет IP-адреса через прокси.

---

### Вопрос 3: «В чем разница между ролями viewer, manager и admin?»
**Ответ**:
- `viewer` (Наблюдатель): имеет доступ **только на чтение** (`GET /tasks`, `GET /tasks/:id`, скачивание вложений). Любая попытка изменить статус, создать задачу или удалить файл прерывается middleware `requireRole` со статусом **403 Forbidden**. В окне сессий видит только свои сессии.
- `manager` (Менеджер): полный доступ к управлению задачами (создание, редактирование, удаление, добавление и удаление файлов).
- `admin` (Администратор): все права менеджера плюс административные привилегии: видит активные сессии всех пользователей системы и может принудительно отозвать сессию любого пользователя.

---

### Вопрос 4: «Как предотвращается атака Path Traversal при загрузке файлов?»
**Ответ**:
1. На диске файл сохраняется не под оригинальным именем, а под случайно сгенерированным UUIDv4: `${uuidv4()}${safeExt}` (например, `4f3a...b2.pdf`). Имя файла формируется сервером и не зависит от ввода пользователя.
2. Оригинальное имя файла санитизируется функцией `sanitizeFileName` (удаляются спецсимволы и последовательности `../`).
3. При скачивании файла путь строится через `path.resolve(UPLOAD_DIR, path.basename(storedName))`, что исключает выход за пределы папки `uploads`.
4. Реализован строгий белый список допустимых расширений файлов (`Set<string> ALLOWED_EXTENSIONS`).

---

### Вопрос 5: «Зачем в Dockerfile используется multi-stage сборка?»
**Ответ**:
В стадии `builder` собирается TypeScript и React-бандл с использованием тяжелых компиляторов (tsc, vite, rollup) и полных `devDependencies`.
В стадию `runner` копируются только готовые скомпилированные файлы (`dist/`) и устанавливаются только легковесные production-пакеты (`npm ci --only=production`). Это сокращает размер итогового Docker-образа в несколько раз и повышает безопасность контейнера.
