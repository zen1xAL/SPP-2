# Навигатор по Лабораторной работе №3 (TaskFlow RBAC Deep Dive)

Данный документ представляет собой единую карту знаний по архитектуре и реализации **Лабораторной работы №3** в директории [lab3/](file:///d:/SPP/7sem/SPP/lab3/).

---

## 🗺 Карта документации и модулей

| № | Раздел / Тема | Документ с детальным разбором | Описание |
| :---: | :--- | :--- | :--- |
| **01** | **Модель доступа (RBAC) и безопасность** | [01-rbac-and-security.md](file:///d:/SPP/7sem/SPP/lab3/docs/deep-dive/01-rbac-and-security.md) | 3 роли (`admin`, `manager`, `viewer`), временные ключи доступа JWT, контроль активных сессий и удаленный отзыв, защита от брутфорса (Rate Limiting, HTTP 429), сброс пароля через Email. |
| **02** | **Семантика стандартов HTTP** | [02-http-semantics-and-errors.md](file:///d:/SPP/7sem/SPP/lab3/docs/deep-dive/02-http-semantics-and-errors.md) | RFC 7231 / RFC 9110: статус-коды 200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500. Единый JSON-формат ошибок. |
| **03** | **Структурированное логирование** | [03-structured-logging.md](file:///d:/SPP/7sem/SPP/lab3/docs/deep-dive/03-structured-logging.md) | Легковесный логгер в формате JSON: сквозной `requestId` (UUIDv4 correlation ID), уровень, метод, URL, статус, время отклика, IP и пользователь. |
| **04** | **Автоматизированная проверка кода (CI)** | [04-ci-pipeline.md](file:///d:/SPP/7sem/SPP/lab3/docs/deep-dive/04-ci-pipeline.md) | GitHub Actions CI workflow (`.github/workflows/ci.yml`): автоматический typecheck, линтинг, тесты и сборка Docker при push и pull request. |

---

## 🏛 Архитектурная схема взаимодействия в Lab 3

```
[ БРАУЗЕР (Клиент React SPA) ]
      │
      ├─► (1) POST /api/auth/login ──────────► [ Express App ]
      │       Проверка Rate Limiter (429)           │
      │       Проверка bcrypt пароля               ▼
      │       Создание записи в sessions      [ PostgreSQL ]
      │   ◄── Возврат JWT временного ключа ────────┤
      │
      ├─► (2) GET/POST/PUT/DELETE /api/tasks ─► [ Express App ]
      │       Заголовок: Authorization: Bearer <token>
      │       1. authenticateToken: валидация JWT + проверка sessions.is_revoked
      │       2. requireRole: проверка роли (admin, manager, viewer)
      │          - viewer при попытке мутации ──► 403 Forbidden
      │          - admin/manager ───────────────► Выполнение SQL и ответ 200/201
      │
      ├─► (3) DELETE /api/auth/sessions/:id ──► Отзыв активной сессии (204 No Content)
      │
      └─► (4) POST /api/auth/forgot-password ─► Генерация токена сброса через Email
```
