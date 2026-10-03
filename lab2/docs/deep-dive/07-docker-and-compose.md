# Разбор Dockerfile, Docker Compose и контейнерной инфраструктуры

Данный документ содержит построчный анализ файлов [Dockerfile](file:///d:/SPP/7sem/SPP/lab2/Dockerfile) и [docker-compose.yml](file:///d:/SPP/7sem/SPP/lab2/docker-compose.yml), а также разбор изоляции процессов, сетевого взаимодействия, персистентных томов и причин типичных системных сбоев Docker на Windows.

---

## 1. Построчный разбор Dockerfile (Многоэтапная сборка / Multi-Stage Build)

В проекте используется двухэтапная сборка (Multi-Stage Build). Ее главная цель – разделение среды компиляции и среды исполнения для уменьшения размера итогового Docker-образа и повышения безопасности (в продакшн-образе отсутствуют компиляторы, уязвимые dev-зависимости и исходный код).

### Этап 1: Сборка артефактов (Строки 1-12)
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/
COPY tsconfig*.json ./

RUN npm run build:client
RUN npm run build:server
```

1. `FROM node:20-alpine AS builder`:
   - В качестве базового образа используется легковесный дистрибутив Alpine Linux на базе ядра Node.js 20 LTS. Размер базового образа Alpine составляет всего около 40 МБ (в отличие от стандартного Debian-образа размером более 300 МБ).
   - Псевдоним `AS builder` обозначает временный этап сборки.
2. `WORKDIR /app`:
   - Устанавливает рабочий каталог внутри изолированной файловой системы контейнера.
3. `COPY package*.json ./` и `RUN npm ci`:
   - **Физика кэширования слоев Docker (Layer Caching)**: Docker кэширует результат выполнения каждой инструкции. Установка зависимостей (`npm ci`) вынесена **до** копирования основного исходного кода `src/`. Если разработчик меняет код компонентов или маршрутов, но не меняет состав пакетов в `package.json`, Docker мгновенно берет слой установленных `node_modules` из кэша, экономя время сборки.
   - Команда `npm ci` (Clean Install) производит строгую установку пакетов точно по дереву версий из `package-lock.json`.
4. `COPY src/ ./src/` и `COPY tsconfig*.json ./`:
   - Копирование исходного кода клиентского React-приложения, серверного кода Express и конфигураций компилятора TypeScript.
5. `RUN npm run build:client`:
   - Запускает сборщик Vite. Vite парсит JSX/TSX-файлы, выполняет минификацию, объединяет модули (tree-shaking) и генерирует готовый статический бандл (HTML, CSS, JS) в директорию `dist/client`.
6. `RUN npm run build:server`:
   - Компилирует TypeScript-код бэкенда в нативный JavaScript (ES Modules) через `tsc -p tsconfig.server.json`, сохраняя скомпилированные файлы в директорию `dist/server`.

---

### Этап 2: Финальный образ исполнения (Строки 14-33)
```dockerfile
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/app/uploads

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/dist/client ./dist/client

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "dist/server/server.js"]
```

1. `FROM node:20-alpine AS runner`:
   - Создается абсолютно чистый контейнер Alpine Linux. Вся промежуточная файловая система предыдущего этапа (исходники, Vite, Rollup, TypeScript) отбрасывается.
2. Переменные окружения (`ENV`):
   - `NODE_ENV=production`: Оптимизирует работу движка V8 и Express (отключает отладочные проверки, активирует кэширование представлений).
   - `PORT=3000` и `UPLOAD_DIR=/app/uploads`: Стандартные параметры запуска приложения в контейнере.
3. `RUN npm ci --only=production`:
   - Устанавливаются исключительно runtime-зависимости (`express`, `pg`, `multer`, `uuid`). Никаких dev-пакетов, что сокращает размер директории `node_modules` в несколько раз.
4. `COPY --from=builder ...`:
   - Из контейнера `builder` точечно переносятся только готовые скомпилированные артефакты: бэкенд в `dist/server` и клиентский SPA-бандл в `dist/client`.
5. `RUN mkdir -p /app/uploads`:
   - Создание директории для сохранения файлов пользователей.
6. `EXPOSE 3000`:
   - Информационная директива, документирующая сетевой порт приложения.
7. `CMD ["node", "dist/server/server.js"]`:
   - Инструкция запуска главного процесса в исполняемой форме (exec form). Процесс `node` запускается с PID 1, что гарантирует корректную обработку POSIX-сигналов завершения (`SIGTERM`, `SIGINT`).

---

## 2. Построчный разбор docker-compose.yml

Файл [docker-compose.yml](file:///d:/SPP/7sem/SPP/lab2/docker-compose.yml) оркестрирует работу двух изолированных сервисов в единой виртуальной подсети:

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

### 2.1. Сколько контейнеров работает?
В системе запускается **ровно 2 контейнера**:
1. `taskflow_postgres`: Контейнер СУБД PostgreSQL 16 Alpine.
2. `taskflow_app`: Контейнер нашего веб-приложения (Node.js 20 + Express + скомпилированный React SPA).

---

### 2.2. Сервис базы данных: db (taskflow_postgres)
- `image: postgres:16-alpine`: Официальный образ PostgreSQL версии 16 на базе Alpine Linux.
- `ports: "5432:5432"`: Проброс порта на хост-машину. Это позволяет при необходимости подключаться к БД через графические клиенты (DBeaver, DataGrip, pgAdmin).
- `healthcheck`:
  - Команда `pg_isready -U postgres -d taskdb` выполняет внутреннюю проверку готовности ядра PostgreSQL к приему клиентских TCP-соединений.
  - Проверка выполняется каждые 5 секунд (`interval: 5s`). Контейнер считается здоровым (`healthy`), как только утилита вернет exit code 0.

---

### 2.3. Сервис приложения: app (taskflow_app)
- `build: .`: Запускает сборку локального `Dockerfile`.
- `DATABASE_URL: postgresql://postgres:postgres@db:5432/taskdb`:
  - Обратите внимание на хост в строке подключения: `db`. Внутри Docker Compose встроен локальный DNS-сервер. Имя сервиса `db` автоматически резолвится во внутренний IP-адрес контейнера базы данных в bridge-сети.
- `depends_on: db: condition: service_healthy`:
  - **Предотвращение Race Condition**: Стандартный `depends_on: [db]` лишь ожидает старта процесса контейнера, но не его внутренней готовности. В PostgreSQL процесс стартует мгновенно, но еще несколько секунд инициализирует дисковые структуры и накатывает WAL-журналы. Без флага `condition: service_healthy` бэкенд упал бы с ошибкой `Connection refused`. Наша конфигурация гарантирует, что Node.js начнет запускаться только тогда, когда PostgreSQL рапортует о полной готовности принимать SQL-запросы.

---

### 2.4. Персистентные тома (Volumes)
В секции `volumes` объявлены два именованных тома:
1. `postgres_data:/var/lib/postgresql/data`: Хранит все таблицы, строки, индексы и транзакционные логи СУБД. При перезапуске, удалении или пересборке контейнеров данные базы данных **не теряются**.
2. `uploads_data:/app/uploads`: Хранит физические файлы, загруженные пользователями через браузер. Файлы сохраняются на хост-машине и переживают любые перезапуски приложения.

---

## 3. Разбор ошибки Windows: open //./pipe/dockerDesktopLinuxEngine

При запуске команды `docker compose up --build` в терминале может возникнуть ошибка:
```text
unable to get image 'postgres:16-alpine': error during connect: 
Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/images/postgres:16-alpine/json": 
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

### Причина сбоя:
В операционной системе Windows взаимодействие между консольной утилитой `docker` и фоновым демоном виртуализации осуществляется через специальный именованный канал Windows (Named Pipe): `//./pipe/dockerDesktopLinuxEngine`.

Сообщение `The system cannot find the file specified` («Не удается найти указанный файл») означает, что **фоновый сервис Docker Desktop не запущен на компьютере** либо его виртуальная машина WSL2 еще не проинициализировалась.

### Пошаговый алгоритм решения:
1. Откройте меню «Пуск» в Windows, найдите и запустите приложение **Docker Desktop**.
2. Дождитесь, пока иконка кита в левом нижнем углу окна Docker Desktop станет зеленой (статус «Engine running»).
3. Убедитесь, что в настройках Docker Desktop (вкладка *General*) включен движок **Use the WSL 2 based engine**.
4. После перехода демона в активный статус вернитесь в терминал и повторите команду:
   ```powershell
   cd d:\SPP\7sem\SPP\lab2
   docker compose up --build
   ```
5. Docker автоматически скачает образ PostgreSQL, соберет приложение и откроет доступ к сайту по адресу `http://localhost:3000`.
