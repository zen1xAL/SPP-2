# Навигатор по глубокому разбору проекта (Deep Dive Guide)

Данная база знаний создана для полного понимания («преисполнения») каждой строчки кода, архитектурных решений, а также фундаментальных механизмов сред **Node.js**, **TypeScript** и веб-стандартов.

---

## 🗺 Карта разбора по файлам

| № | Файл проекта | Документ с детальным разбором | Основные темы и тонкости языка |
| :--- | :--- | :--- | :--- |
| 1 | [package.json](file:///d:/SPP/7sem/SPP/package.json) | [01-package-json.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/01-package-json.md) | ES-модули (`"type": "module"`), semver-диапазоны (`^`), скрипты жизненного цикла, devDependencies vs dependencies |
| 2 | [tsconfig.json](file:///d:/SPP/7sem/SPP/tsconfig.json) | [02-tsconfig-json.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/02-tsconfig-json.md) | NodeNext module resolution, Strict Mode флаги, Type Erasure, ast/компиляция tsc |
| 3 | [src/server.ts](file:///d:/SPP/7sem/SPP/src/server.ts) | [03-server-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/03-server-ts.md) | Event Loop и сетевые сокеты, POSIX-сигналы (`SIGINT`, `SIGTERM`), Graceful Shutdown, микротаски |
| 4 | [src/app.ts](file:///d:/SPP/7sem/SPP/src/app.ts) | [04-app-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/04-app-ts.md) | Express middleware pipeline, `import.meta.url`, IoC-контейнер, 4-аргументный Error Handler |
| 5 | [src/domain/models/task.ts](file:///d:/SPP/7sem/SPP/src/domain/models/task.ts) | [05-domain-models-task-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/05-domain-models-task-ts.md) | Discriminated Unions, `readonly` иммутабельность, User-Defined Type Guards (`is`), работа со временем в JS |
| 6 | [src/storage/task-repository.interface.ts](file:///d:/SPP/7sem/SPP/src/storage/task-repository.interface.ts) | [06-task-repository-interface-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/06-task-repository-interface-ts.md) | Принцип инверсии зависимостей (DIP), абстрактные типы, контракты промисов (`Promise<T>`) |
| 7 | [src/storage/json-task-repository.ts](file:///d:/SPP/7sem/SPP/src/storage/json-task-repository.ts) | [07-json-task-repository-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/07-json-task-repository-ts.md) | Libuv, неблокирующий I/O, атомарная запись файлов (`fs.rename`), потокобезопасность и seed-данные |
| 8 | [src/services/task-service.ts](file:///d:/SPP/7sem/SPP/src/services/task-service.ts) | [08-task-service-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/08-task-service-ts.md) | Чистая бизнес-логика, Dependency Injection, алгоритмическая сложность методов массивов, очистка ресурсов |
| 9 | [src/middleware/upload.ts](file:///d:/SPP/7sem/SPP/src/middleware/upload.ts) | [09-upload-middleware-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/09-upload-middleware-ts.md) | Бинарные потоки (Streams), формат `multipart/form-data`, защита от Path Traversal, энтропия UUIDv4 |
| 10 | [src/controllers/task-controller.ts](file:///d:/SPP/7sem/SPP/src/controllers/task-controller.ts) | [10-task-controller-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/10-task-controller-ts.md) | Стрелочные методы и лексический контекст `this`, паттерн Post-Redirect-Get (PRG), заголовки ответов |
| 11 | [src/routes/task-routes.ts](file:///d:/SPP/7sem/SPP/src/routes/task-routes.ts) | [11-task-routes-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/11-task-routes-ts.md) | Паттерн цепочки обязанностей (Chain of Responsibility), именованные URL-параметры (`:id`), REST-семантика |
| 12 | [src/views/index.ejs](file:///d:/SPP/7sem/SPP/src/views/index.ejs) | [12-index-ejs.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/12-index-ejs.md) | Синтаксис EJS (`<%`, `<%=`), предотвращение XSS, кодирование форм `enctype="multipart/form-data"` |
| 13 | [src/views/partials/](file:///d:/SPP/7sem/SPP/src/views/partials/) | [13-partials-header-footer-ejs.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/13-partials-header-footer-ejs.md) | Партиалы (Partials), переиспользование разметки, динамические даты на сервере, метатеги HTML5 |
| 14 | [tests/task-service.test.ts](file:///d:/SPP/7sem/SPP/tests/task-service.test.ts) | [14-tests-task-service-test-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/14-tests-task-service-test-ts.md) | Юнит-тестирование, хуки жизненного цикла (`beforeEach`/`afterEach`), изоляция песочницы |
| 15 | [tests/task-routes.test.ts](file:///d:/SPP/7sem/SPP/tests/task-routes.test.ts) | [15-tests-task-routes-test-ts.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/15-tests-task-routes-test-ts.md) | Интеграционное тестирование с Supertest, имитация HTTP-сессий без открытия порта, PRG assertion |
| 16 | [src/public/css/style.css](file:///d:/SPP/7sem/SPP/src/public/css/style.css) | [16-style-css.md](file:///d:/SPP/7sem/SPP/docs/deep-dive/16-style-css.md) | Дизайн-токены (:root), Flexbox и CSS Grid, блочная модель border-box, адаптивность и доступность (a11y) |

