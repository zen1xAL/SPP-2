# Алгоритмы работы программы: Сценарии и граничные ситуации

Данный документ представляет собой пошаговое описание алгоритмов работы проекта в различных штатных и нештатных сценариях. Каждый сценарий разобран сквозным образом: от действий пользователя в браузере через сетевой стек HTTP, контроллеры Node.js и файловую систему к ядру СУБД PostgreSQL.

---

## 1. Сценарий 1: Первичная загрузка страницы в браузере (Happy Path 1)

```
[Пользователь] 
      │ (1) Ввод URL: http://localhost:3000
      ▼
[Express Server] ──(2) express.static──► [dist/client/index.html + JS/CSS]
      │
      ▼
[Браузер] ──(3) Парсинг DOM, запуск main.tsx, React 18 createRoot
      │
      ▼
[React App] ──(4) useEffect() триггерит loadTasks('all')
      │
      ▼
[HTTP GET] ──(5) fetch('/api/tasks')
      │
      ▼
[Express routes.ts] ──(6) SELECT tasks LEFT JOIN attachments (json_agg)
      │
      ▼
[PostgreSQL] ──(7) Выполнение плана запроса, возврат JSON-структур
      │
      ▼
[Express routes.ts] ──(8) Расчет KPI stats, ответ 200 OK
      │
      ▼
[React App] ──(9) setTasks(), setStats(), Reconciliation Virtual DOM
      │
      ▼
[Экран] ──(10) Отображение метрик, фильтров и карточек задач
```

### Пошаговое описание:
1. Пользователь вводит адрес `http://localhost:3000` в строке браузера.
2. Express получает входящий TCP-запрос `GET /`. Middleware `express.static` находит файл `dist/client/index.html` и отдает его со статусом `200 OK`.
3. Браузер парсит HTML, обнаруживает теги `<script type="module" src="/assets/index-*.js">` и `<link rel="stylesheet">`, параллельно скачивает их и передает управление движку V8.
4. В файле [main.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/main.tsx) вызывается `ReactDOM.createRoot()`. Компонент [App.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/App.tsx) монтируется в DOM. При первом рендере флаг `isLoading` равен `true`, поэтому пользователь видит аккуратный индикатор загрузки (спиннер).
5. Срабатывает хук `useEffect`, который вызывает мемоизированную функцию `loadTasks('all')`.
6. Функция [api.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/api.ts) отправляет асинхронный сетевой запрос `GET /api/tasks`.
7. Серверный маршрутизатор в [routes.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/routes.ts) выполняет SQL-запрос к PostgreSQL с агрегацией вложений в один проход (`json_agg`).
8. Диспетчер Express получает строки от драйвера `pg`, вычисляет объект статистики `stats` (общее число, в работе, просроченные) и отправляет клиенту JSON-ответ `{ tasks, stats }` со статусом `200 OK`.
9. Клиентский код получает JSON. Вызываются функции обновления состояния `setTasks(data.tasks)` и `setStats(data.stats)`, а флаг `isLoading` сбрасывается в `false`.
10. Механизм согласования (Reconciliation) React Virtual DOM вычисляет минимальный дифф и монтирует в реальный DOM дерево компонентов: [Header](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/Header.tsx), [MetricsGrid](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/MetricsGrid.tsx), [FilterNav](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/FilterNav.tsx) и сетку [TaskCard](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/TaskCard.tsx). Страница готова к работе.

---

## 2. Сценарий 2: Создание задачи с прикреплением PDF-файла (Happy Path 2)

```
[Пользователь] Заполнил форму, прикрепил report.pdf, нажал «Создать задачу»
      │
      ▼
[TaskForm.tsx] e.preventDefault(), проверка title.trim(), сборка FormData
      │
      ▼
[HTTP POST] multipart/form-data с границей boundary ──► [Express]
      │
      ▼
[Multer] Проверка расширения .pdf (Whitelist: OK)
      │ Потоковая запись байтов в /app/uploads/<uuid>.pdf на диск
      ▼
[routes.ts] Выделение клиента pool.connect()
      │
      ├──► BEGIN
      ├──► INSERT INTO tasks (id, title, description, status, due_date)
      ├──► INSERT INTO attachments (id, task_id, original_name, stored_name, ...)
      ├──► COMMIT
      │
      ▼
[routes.ts] Ответ 201 Created с JSON созданной задачи
      │
      ▼
[App.tsx] Сброс и закрытие формы, зеленый тост «Задача успешно создана!»
      │ Вызов loadTasks(currentFilter) -> фоновое обновление списка
```

### Пошаговое описание:
1. Пользователь нажимает кнопку «Новая задача» в шапке. Флаг `isFormOpen` переключается в `true`, форма плавно разворачивается.
2. Пользователь вводит название «Подготовить отчет по лабораторной работе №2», выбирает дедлайн и прикрепляет файл `report.pdf` (размером 1.2 МБ).
3. При нажатии «Создать задачу» в [TaskForm.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/TaskForm.tsx) срабатывает `handleSubmit`. Заголовок валидируется на непустоту. Состояние `isSubmitting` блокирует кнопку и включает индикатор «Сохранение...».
4. Данные упаковываются в объект `new FormData()` и передаются в `createTask(formData)` в [api.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/api.ts).
5. Браузер отправляет HTTP POST-запрос с заголовком `Content-Type: multipart/form-data; boundary=...`.
6. Middleware [upload.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/upload.ts) перехватывает входящий поток. `fileFilter` проверяет расширение `.pdf` по белому списку `ALLOWED_EXTENSIONS`. Проверка проходит успешно. Дисковое хранилище генерирует безопасное имя `e8b1c4a2-3f11-4b2a-89aa-5527a2926710.pdf` и потоково сохраняет файл в `/app/uploads`.
7. Управление переходит в обработчик [routes.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/routes.ts):
   - Запрашивается клиент `client = await pool.connect()`.
   - Запускается транзакция: `await client.query('BEGIN')`.
   - Выполняется вставка в таблицу `tasks`.
   - Выполняется вставка в таблицу `attachments` со связью `task_id`.
   - Выполняется фиксация транзакции: `await client.query('COMMIT')`.
   - Клиент освобождается: `client.release()`.
8. Сервер возвращает статус `201 Created` с JSON-моделью задачи.
9. Клиентский React сбрасывает поля формы, закрывает панель, отображает всплывающий зеленый баннер «Задача успешно создана!» и перезагружает список задач. Все происходит мгновенно и без перезагрузки вкладки браузера.

---

## 3. Сценарий 3: Смена статуса задачи на лету (Happy Path 3)

```
[Пользователь] Выбрал в select значение «В работе»
      │
      ▼
[TaskCard.tsx] onChange вызывает onStatusChange(task.id, 'in_progress')
      │
      ▼
[api.ts] PUT /api/tasks/:id с JSON { status: 'in_progress' }
      │
      ▼
[routes.ts] UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2
      │
      ▼
[PostgreSQL] Обновление строки на диске
      │
      ▼
[Express] Ответ 200 OK с обновленной задачей
      │
      ▼
[React App] Мгновенное обновление бейджа на «В работе», пересчет метрик
```

### Пошаговое описание:
1. В карточке задачи пользователь открывает выпадающий список статуса и выбирает «В работе».
2. Событие `onChange` перехватывается компонентом [TaskCard.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/TaskCard.tsx), который вызывает функцию `onStatusChange(task.id, 'in_progress')`.
3. Функция `updateTask()` в [api.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/api.ts) отправляет сетевой запрос `PUT /api/tasks/<uuid>` с заголовком `Content-Type: application/json` и телом `{"status":"in_progress"}`.
4. Сервер проверяет статус по `VALID_STATUSES` и выполняет команду `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`.
5. Сервер возвращает статус `200 OK`.
6. React обновляет состояние, карточка мгновенно меняет цвет акцентной полосы и бейджа на статус «В работе», а в верхней панели [MetricsGrid](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/MetricsGrid.tsx) счетчик «В работе» увеличивается на единицу.

---

## 4. Сценарий 4: Скачивание вложения (Happy Path 4)

```
[Пользователь] Кликнул по имени файла report.pdf на карточке задачи
      │
      ▼
[Браузер] Переход по прямой ссылке /api/tasks/:id/attachments/:attId/download
      │
      ▼
[routes.ts] SELECT original_name, stored_name FROM attachments WHERE ...
      │
      ▼
[Файловая система] fs.access(filePath) -> файл существует
      │
      ▼
[Express res.download]
      │ Установка заголовка Content-Disposition: attachment; filename="report.pdf"
      │ Потоковая передача бинарных чанков из /app/uploads/<uuid>.pdf в сокет
      ▼
[Браузер] Открытие диалога «Сохранить файл report.pdf»
```

### Пошаговое описание:
1. Пользователь кликает по ссылке вложения. В коде [TaskCard.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/TaskCard.tsx) ссылка сгенерирована через `getDownloadUrl(task.id, att.id)`.
2. Браузер отправляет HTTP-запрос `GET /api/tasks/:id/attachments/:attId/download`.
3. Сервер находит строку в таблице `attachments` и извлекает два имени:
   - `original_name` (например, `report.pdf`)
   - `stored_name` (например, `e8b1c4a2-3f11-4b2a-89aa-5527a2926710.pdf`)
4. Сервер формирует защищенный путь через `getUploadFilePath()` и проверяет наличие файла на диске вызовом `fs.access()`.
5. Метод `res.download(filePath, originalName)` выставляет HTTP-заголовки:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="report.pdf"`
6. Express открывает системный файловый поток `ReadStream` и передает байты в сокет ответа. Пользователь сохраняет файл на компьютер с его оригинальным именем.

---

## 5. Граничная ситуация 1: Попытка загрузки исполняемого или запрещенного файла (Edge Case 1)

**Действие**: Пользователь пытается прикрепить файл скрипта `virus.exe` или `hack.sh`.

```
[Пользователь] Выбрал файл exploit.exe и отправил форму
      │
      ▼
[Multer fileFilter] Проверка: ALLOWED_EXTENSIONS.has('.exe') === false
      │
      ▼
[Multer] Вызов cb(new Error('Недопустимый формат файла: .exe'))
      │ Запись на диск ПРЕРЫВАЕТСЯ. Файл НЕ создается.
      ▼
[Express errorHandler] Перехват ошибки Multer, статус 400 Bad Request
      │ Ответ клиенту: { "error": "Недопустимый формат файла: .exe..." }
      ▼
[api.ts handleResponse] res.ok === false -> throw new Error(...)
      │
      ▼
[App.tsx] Перехват ошибки в catch: showNotification('error', err.message)
      │
      ▼
[Экран] Всплывает красный баннер с точным текстом ошибки
```

**Результат безопасности**:
- Запрещенный файл даже на доли секунды не сохраняется на жестком диске.
- Процесс Node.js не падает.
- Пользователь получает понятное сообщение об ошибке с перечнем разрешенных форматов.

---

## 6. Граничная ситуация 2: Превышение лимита размера файла (> 5 МБ) (Edge Case 2)

**Действие**: Пользователь пытается загрузить видеофайл или тяжелый архив весом 25 МБ.

```
[Пользователь] Отправляет файл весом 25 МБ
      │
      ▼
[Multer Stream Parser] Подсчет переданных байт в сокете
      │ Как только счетчик байт превышает 5 242 880 (5 МБ):
      │
      ├──► Multer немедленно прекращает чтение сокета
      ├──► Удаляет недописанный временный файл с диска
      └──► Выбрасывает системную ошибку с кодом LIMIT_FILE_SIZE
      │
      ▼
[Express app.ts: errorHandler]
      │ Проверка: err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      │ Ответ со статусом 400 Bad Request:
      │ { "error": "Превышен максимальный размер файла (лимит: 5 МБ)" }
      ▼
[React UI] Красный тост с ошибкой размера файла. Диск сервера чист.
```

---

## 7. Граничная ситуация 3: Сбой СУБД в момент создания задачи (ACID Rollback & Disk Cleanup) (Edge Case 3)

**Сценарий катастрофы**: Пользователь отправил форму с файлом. Multer успешно записал файл `doc.pdf` на диск. Но в момент выполнения SQL-запроса сервер PostgreSQL потерял питание или переполнил диск.

```
[routes.ts]
   1. Файл уже на диске: /app/uploads/file-123.pdf
   2. await client.query('BEGIN')
   3. await client.query('INSERT INTO tasks ...') ──► СБОЙ БД (Error: connection lost)
   │
   ▼
[Секция catch (dbErr)]
   4. await client.query('ROLLBACK') ──► База данных откатана к исходному состоянию
   5. await deletePhysicalFile('file-123.pdf') ──► ФАЙЛ УДАЛЯЕТСЯ С ДИСКА
   6. client.release() ──► Клиент освобожден
   7. next(dbErr) ──► Проброс ошибки дальше
   │
   ▼
[Express errorHandler] Ответ 500 Internal Server Error
[React UI] Пользователь видит ошибку сервера.
```

**Результат надежности**:
- Полное соблюдение принципа атомарности (ACID Atomicity).
- Никаких «файлов-сирот» (orphaned files) на диске. На сервере не накапливается мусор от неудачных транзакций.

---

## 8. Граничная ситуация 4: Каскадное удаление задачи с файлами (Edge Case 4)

**Действие**: Пользователь удаляет задачу, у которой есть 3 прикрепленных файла.

```
[Пользователь] Кликнул на иконку урны, подтвердил удаление задачи в диалоге
      │
      ▼
[DELETE /api/tasks/:id]
      │ 1. Поиск прикрепленных файлов:
      │    SELECT stored_name FROM attachments WHERE task_id = $1
      │
      │ 2. Цикл физического удаления:
      │    deletePhysicalFile(file1) -> fs.unlink()
      │    deletePhysicalFile(file2) -> fs.unlink()
      │    deletePhysicalFile(file3) -> fs.unlink()
      │
      │ 3. Удаление задачи из БД:
      │    DELETE FROM tasks WHERE id = $1
      │
      ▼
[PostgreSQL Engine]
      │ Внешний ключ: task_id REFERENCES tasks(id) ON DELETE CASCADE
      │ СУБД автоматически удаляет строки всех 3 вложений из attachments
      │
      ▼
[Express] Ответ 200 OK: { "message": "Задача успешно удалена", "id": "..." }
[React UI] Карточка исчезает из интерфейса с плавной анимацией
```

**Результат**:
- Все физические файлы стерты с жесткого диска.
- Все связанные строки удалены из PostgreSQL благодаря внешнему ключу `ON DELETE CASCADE`.
- В системе не остается ни одного мертвого байта.
