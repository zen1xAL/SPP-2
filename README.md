# СПП (7 семестр) – Лабораторные работы по веб-разработке

Репозиторий содержит выполнение лабораторных работ по курсу «Современные платформы программирования» (СПП).

---

## Структура репозитория

```
SPP/
├── lab1/          # Лабораторная работа №1 (SSR, Express, EJS, JSON-хранилище)
├── lab2/          # Лабораторная работа №2 (SPA, React, REST API, PostgreSQL, Docker)
├── lab3/          # Лабораторная работа №3 (RBAC, JWT, Rate Limiting, Сессии, Логирование, CI)
├── Task.md        # Исходное задание к лабораторной работе №1
├── Task2.md       # Исходное задание к лабораторной работе №2
├── Task3.md       # Исходное задание к лабораторной работе №3
└── README.md
```

---

## 📌 [Лабораторная работа №1](file:///d:/SPP/7sem/SPP/lab1/)

Веб-приложение с серверным рендерингом (Server-Side Rendering) на базе Node.js, Express, EJS и TypeScript в строгом режиме.
* Задание: [Task.md](file:///d:/SPP/7sem/SPP/Task.md) (или [lab1/Task.md](file:///d:/SPP/7sem/SPP/lab1/Task.md)).

### Быстрый старт Лабораторной работы №1:

```bash
cd lab1
npm install
npm run dev
```

Приложение доступно по адресу: `http://localhost:3000`.

---

## 📌 [Лабораторная работа №2](file:///d:/SPP/7sem/SPP/lab2/)

Одностраничное веб-приложение (Single Page Application, SPA) на клиенте (React 18 + Vite) и REST API на сервере (Node.js, Express, TypeScript) с подключением реляционной базы данных PostgreSQL и контейнеризацией в Docker.
* Задание: [Task2.md](file:///d:/SPP/7sem/SPP/Task2.md) (или [lab2/Task2.md](file:///d:/SPP/7sem/SPP/lab2/Task2.md)).

### Быстрый запуск в Docker Compose:

```bash
cd lab2
docker compose up --build
```

Приложение доступно по адресу: `http://localhost:3000`.

---

## 📌 [Лабораторная работа №3](file:///d:/SPP/7sem/SPP/lab3/)

Расширение веб-приложения TaskFlow корпоративными стандартами безопасности, ролевой моделью доступа, контролем подключений и автоматизированным CI-пайплайном:
* Задание: [Task3.md](file:///d:/SPP/7sem/SPP/Task3.md).
* Ключевые возможности:
  1. **Ролевая модель доступа (RBAC)** с 3 ролями (`admin`, `manager`, `viewer`) на основе временных ключей (JWT Bearer Token с TTL 15 минут).
  2. **Семантика стандартов HTTP**: строгое соблюдение RFC 7231 / RFC 9110 (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500) и единый JSON-формат ошибок.
  3. **Защита от подбора паролей**: Brute-Force Rate Limiting (HTTP 429 Too Many Requests с заголовком `Retry-After: 900`).
  4. **Контроль активных подключений**: просмотр списка активных сессий и возможность удаленного отзыва сессий (`204 No Content`).
  5. **Восстановление доступа через Email**: генерация криптографических одноразовых токенов сброса пароля.
  6. **Структурированное логирование**: легковесный JSON-логгер со сквозным Correlation ID (`X-Request-Id`).
  7. **Автоматизированная проверка кода (CI)**: GitHub Actions workflow (`.github/workflows/ci.yml`).

### Быстрый запуск в Docker Compose:

```bash
cd lab3
docker compose up --build
```

Приложение доступно по адресу: `http://localhost:3000`.

### Учетные записи для быстрой проверки ролей (Seed Data):
* **Администратор (admin)**: `admin@taskflow.local` / `AdminPass123!`
* **Менеджер (manager)**: `manager@taskflow.local` / `ManagerPass123!`
* **Наблюдатель (viewer)**: `viewer@taskflow.local` / `ViewerPass123!`

### Тестирование и верификация:

```bash
cd lab3
npm test        # Прогон всех 14 автоматических тестов (RBAC, 429, логи, сброс)
npm run verify  # Полный цикл: строгий typecheck + automated tests
```
