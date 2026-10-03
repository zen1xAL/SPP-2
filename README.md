# СПП (7 семестр) – Лабораторные работы по веб-разработке

Репозиторий содержит выполнение лабораторных работ по курсу «Современные платформы программирования» (СПП).

---

## Структура репозитория

```
SPP/
├── lab1/          # Лабораторная работа №1 (SSR, Express, EJS, JSON-хранилище)
├── lab2/          # Лабораторная работа №2 (SPA, React, REST API, PostgreSQL, Docker)
├── Task.md        # Исходное задание к лабораторной работе №1
├── Task2.md       # Исходное задание к лабораторной работе №2
└── README.md
```

---

## 📌 [Лабораторная работа №1](file:///d:/SPP/7sem/SPP/lab1/)

Веб-приложение с серверным рендерингом (Server-Side Rendering) на базе Node.js, Express, EJS и TypeScript в строгом режиме.
* Задание: [Task.md](file:///d:/SPP/7sem/SPP/Task.md) (или [lab1/Task.md](file:///d:/SPP/7sem/SPP/lab1/Task.md)).
* База знаний и подробный разбор кода: [lab1/docs/deep-dive/00-INDEX.md](file:///d:/SPP/7sem/SPP/lab1/docs/deep-dive/00-INDEX.md).

### Быстрый старт Лабораторной работы №1:

```bash
cd lab1
npm install
npm run dev
```

Приложение доступно по адресу: `http://localhost:3000`.

### Тестирование и сборка:

```bash
cd lab1
npm test             # Запуск всех 14 модульных и интеграционных тестов
npm run typecheck    # Проверка строгой статической типизации
npm run build        # Компиляция TypeScript в dist/
```

---

## 📌 [Лабораторная работа №2](file:///d:/SPP/7sem/SPP/lab2/)

Одностраничное веб-приложение (Single Page Application, SPA) на клиенте (React 18 + Vite) и REST API на сервере (Node.js, Express, TypeScript) с подключением реляционной базы данных PostgreSQL и контейнеризацией в Docker.
* Задание: [Task2.md](file:///d:/SPP/7sem/SPP/Task2.md) (или [lab2/Task2.md](file:///d:/SPP/7sem/SPP/lab2/Task2.md)).
* Технический разбор и база знаний: [lab2/docs/DEEP-DIVE.md](file:///d:/SPP/7sem/SPP/lab2/docs/DEEP-DIVE.md).
* Особенности:
  * Полный цикл CRUD-операций без перезагрузки страницы браузера.
  * Обмен данными в формате JSON и загрузка файлов через `multipart/form-data`.
  * Реляционная база данных PostgreSQL 16 (таблицы `tasks` и `attachments`).
  * Валидация всех входящих данных и информативные уведомления об ошибках на клиенте.
  * Упаковка в Docker Compose (сервисы `app` и `db`).

### Быстрый запуск в Docker Compose (Рекомендуемый способ):

```bash
cd lab2
docker compose up --build
```

После старта контейнеров приложение автоматически инициализирует базу данных, применит таблицы и будет доступно по адресу:
`http://localhost:3000`.

### Локальный запуск без Docker (для разработки):

Убедитесь, что у вас запущена база данных PostgreSQL (строка подключения по умолчанию: `postgresql://postgres:postgres@localhost:5432/taskdb`):

```bash
cd lab2
npm install
npm run build        # Сборка React клиента и Express сервера
npm start            # Запуск производственного сервера
```

Или в режиме горячей перезагрузки (Hot Module Replacement):

```bash
cd lab2
npm run dev:server   # Запуск Express API на порту 3000 (tsx watch)
npm run dev:client   # Запуск React Vite dev-сервера на порту 5173
```
