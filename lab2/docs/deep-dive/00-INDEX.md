# Навигатор по глубокому разбору Лабораторной работы №2 (Deep Dive Guide)

Данная база знаний создана для исчерпывающего понимания («преисполнения») каждой строчки кода, архитектурных механизмов, работы с базой данных PostgreSQL, контейнеризации в Docker и реактивного взаимодействия Single Page Application (SPA).

---

## 🗺 Карта разбора по модулям и файлам

| № | Файл / Тема | Документ с детальным разбором | Основные рассматриваемые темы |
| :---: | :--- | :--- | :--- |
| **01** | [src/server/server.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/server.ts) & [app.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/app.ts) | [01-server-and-app.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/01-server-and-app.md) | Точка входа, retry-петля подключения к СУБД, Graceful Shutdown, конвейер Express, раздача React SPA в проде, централизованный Error Handler. |
| **02** | [src/server/db.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/db.ts) | [02-db-and-sql.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/02-db-and-sql.md) | Пул TCP-сокетов `pg.Pool`, DDL-схема таблиц `tasks` и `attachments`, каскадное удаление `ON DELETE CASCADE`, генерация seed-данных. |
| **03** | [src/server/upload.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/upload.ts) | [03-upload-middleware.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/03-upload-middleware.md) | Потоковый прием multipart/form-data, белый список расширений, защита от атак Path Traversal, физическое удаление файлов с диска. |
| **04** | [src/server/routes.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/routes.ts) | [04-rest-routes.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/04-rest-routes.md) | Построчный разбор всех REST эндпоинтов, атомарные транзакции `BEGIN/COMMIT/ROLLBACK`, решение проблемы N+1 через `json_agg`, HTTP-статусы. |
| **05** | [src/client/src/App.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/App.tsx), [main.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/main.tsx), [types.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/types.ts), [api.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/api.ts) | [05-react-architecture-and-state.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/05-react-architecture-and-state.md) | Архитектура React 18 SPA, управление состоянием (`useState`, `useEffect`, `useCallback`), клиентский API-модуль `fetch()`, передача `FormData`. |
| **06** | Компоненты UI ([src/client/src/components/](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/)) | [06-react-components.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/06-react-components.md) | Анатомия компонентов `TaskCard`, `TaskForm`, `MetricsGrid`, `FilterNav`, `Header`, `Notification`. Обработка событий, Virtual DOM. |
| **07** | [Dockerfile](file:///d:/SPP/7sem/SPP/lab2/Dockerfile) & [docker-compose.yml](file:///d:/SPP/7sem/SPP/lab2/docker-compose.yml) | [07-docker-and-compose.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/07-docker-and-compose.md) | Построчный разбор Dockerfile, Multi-stage build, кэширование слоев, Docker Compose, внутренняя сеть bridge, healthcheck, персистентные volumes. |
| **08** | Сквозные алгоритмы работы и краевые случаи | [08-scenarios-and-edge-cases.md](file:///d:/SPP/7sem/SPP/lab2/docs/deep-dive/08-scenarios-and-edge-cases.md) | 8 детальных пошаговых сценариев: старт системы, создание с файлом, ошибки валидации, смена статуса на лету, каскадное удаление, скачивание. |

---

## 🏛 Архитектурная схема взаимодействия

```
[ БРАУЗЕР КЛИЕНТА ]
  │
  ├─► (1) GET / ──────────────► [ Express App ] ──► Отдает скомпилированный React SPA (index.html, JS, CSS)
  │                                  ▲
  │                                  │
  ├─► (2) Фоновый fetch() ───────────┴──► [ REST API: /api/tasks ]
  │   (application/json или               │
  │    multipart/form-data)                ├─► Валидация входных данных
  │                                       ├─► Multer: сохранение файла в /app/uploads
  │                                       │
  │                                       ▼
  │                           [ PostgreSQL Pool: pg.Pool ]
  │                                       │
  │                                       │ Внутренний сетевой сокет (порт 5432)
  │                                       ▼
  │                           [ Таблицы: tasks + attachments ]
  │                                       │
  │                                       ▼
  └◄── (3) JSON ответ (200 / 201) ────────┴── React точечно обновляет DOM без перезагрузки страницы
```
