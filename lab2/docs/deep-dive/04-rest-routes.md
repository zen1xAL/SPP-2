# Архитектура и эндпоинты REST API: routes.ts

Данный документ содержит исчерпывающий разбор маршрутизатора [routes.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/routes.ts). В нем реализован полный набор RESTful эндпоинтов для Single Page Application (SPA), поддерживающих управление задачами, транзакционную загрузку вложений и скачивание файлов.

---

## 1. Сводная таблица контрактов REST API

| Метод | Путь (URL) | Формат тела (Payload) | Назначение | Успешный HTTP-статус |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/tasks` | Отсутствует (Query: `?status=...`) | Получение списка задач и агрегированных KPI-метрик | `200 OK` |
| **GET** | `/api/tasks/:id` | Отсутствует | Получение детальных данных конкретной задачи по UUID | `200 OK` (или `404`) |
| **POST** | `/api/tasks` | `multipart/form-data` | Атомарное создание задачи с опциональным файлом | `201 Created` |
| **PUT** | `/api/tasks/:id` | `application/json` | Частичное обновление полей задачи (статус, дедлайн, заголовок) | `200 OK` |
| **DELETE** | `/api/tasks/:id` | Отсутствует | Удаление задачи с каскадной очисткой вложений и диска | `200 OK` |
| **POST** | `/api/tasks/:id/attachments` | `multipart/form-data` | Прикрепление дополнительного файла к существующей задаче | `201 Created` |
| **DELETE** | `/api/tasks/:id/attachments/:attachmentId` | Отсутствует | Удаление конкретного файла из БД и диска | `200 OK` |
| **GET** | `/api/tasks/:id/attachments/:attachmentId/download` | Отсутствует | Потоковое скачивание файла браузером с его оригинальным именем | `200 OK` (Binary Stream) |

---

## 2. Построчный разбор вспомогательной логики (Строки 1-22)

```typescript
const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed']);

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'completed') {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  return due.getTime() < today.getTime();
}
```

1. `VALID_STATUSES`: Множество `Set` допустимых бизнес-статусов. Любые входящие строки, не входящие в данный набор, отсекаются сервером с кодом ошибки `400 Bad Request`.
2. Функция `isOverdue(dueDate, status)`:
   - Бизнес-правило 1: Если срок (`dueDate`) не указан или задача уже завершена (`completed`), она **не может быть просроченной**.
   - Бизнес-правило 2: Для корректного сравнения дат без учета часовых поясов и миллисекунд оба объекта `Date` нормализуются к началу текущих суток через `setHours(0, 0, 0, 0)`.
   - Если дедлайн строго раньше полуночи сегодняшнего дня (`due.getTime() < today.getTime()`), задача помечается как просроченная.

---

## 3. Детальный разбор каждого эндпоинта

### 3.1. GET /api/tasks (Строки 24-75)
Эндпоинт обеспечивает загрузку списка задач и расчет аналитических показателей (метрик) для верхнего блока интерфейса.

```typescript
apiRouter.get('/tasks', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
```
- **Парсинг Query-параметра**: `req.query.status` валидируется через `VALID_STATUSES`. Если параметр не передан или некорректен, по умолчанию применяется `'all'`.
- **SQL-запрос агрегации в один проход (Single-Pass Query)**:
  Вместо выполнения двух раздельных запросов («задачи» и «вложения») и сопоставления массивов в памяти Node.js, используется мощь СУБД PostgreSQL:
  ```sql
  SELECT 
    t.id, t.title, t.description, t.status, 
    to_char(t.due_date, 'YYYY-MM-DD') as "dueDate", 
    t.created_at as "createdAt", t.updated_at as "updatedAt",
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
  - `LEFT JOIN attachments`: Связывает задачу с ее вложениями. Если вложений нет, строка задачи все равно возвращается.
  - `json_build_object`: Конструирует структурированный JSON-объект для каждого файла прямо на уровне ядра PostgreSQL.
  - `json_agg(...) FILTER (WHERE a.id IS NOT NULL)`: Собирает объекты вложений в JSON-массив. Предложение `FILTER` предотвращает появление массива `[null]` для задач без вложений.
  - `COALESCE(..., '[]')`: Гарантирует возврат пустого JSON-массива `[]`, если у задачи нет файлов.
- **Расчет KPI-метрик**:
  Сервер производит расчет статистики по всем задачам базы данных:
  ```typescript
  const stats = {
    total: allTasks.length,
    pending: allTasks.filter((t) => t.status === 'pending').length,
    inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
    completed: allTasks.filter((t) => t.status === 'completed').length,
    overdue: allTasks.filter((t) => isOverdue(t.dueDate, t.status)).length
  };
  ```
- **Фильтрация и ответ**: Если указан фильтр (например, `?status=pending`), массив `tasks` фильтруется, при этом блок `stats` всегда отражает общую картину по всем статусам. Возвращается статус `200 OK` и JSON `{ tasks, stats }`.

---

### 3.2. GET /api/tasks/:id (Строки 77-116)
- Извлекает задачу по первичному ключу `id`.
- Использует параметризованный запрос `WHERE t.id = $1`.
- Если `result.rows.length === 0`, возвращает статус `404 Not Found` с JSON `{ error: 'Задача с указанным идентификатором не найдена' }`.

---

### 3.3. POST /api/tasks (Строки 118-191) – Транзакционное создание задачи
Данный эндпоинт является критическим с точки зрения целостности данных. Он использует middleware `upload.single('attachment')`.

**Алгоритм работы:**
1. **Валидация заголовка**:
   ```typescript
   const trimmedTitle = typeof title === 'string' ? title.trim() : '';
   if (!trimmedTitle) {
     if (req.file) {
       await deletePhysicalFile(req.file.filename);
     }
     res.status(400).json({ error: 'Название задачи обязательно для заполнения' });
     return;
   }
   ```
   Если пользователь отправил пустой заголовок, но прикрепил файл, файл **немедленно удаляется с диска**, чтобы исключить засорение хранилища файлами-сиротами (orphaned files).
2. **Выделение выделенного клиента из пула**:
   `const client = await pool.connect();`
   Транзакции (`BEGIN` / `COMMIT` / `ROLLBACK`) обязаны выполняться на одном и том же физическом TCP-соединении.
3. **Транзакционный блок**:
   - `await client.query('BEGIN');` – Старт изолированной транзакции.
   - Запись задачи в таблицу `tasks` (`INSERT INTO tasks ... RETURNING ...`).
   - Если был передан файл (`req.file`):
     - Формируется UUID вложения.
     - Имя файла санитизируется через `sanitizeFileName(req.file.originalname)`.
     - Запись метаданных файла в таблицу `attachments` со внешним ключом `task_id`.
   - `await client.query('COMMIT');` – Атомарная фиксация изменений на диске СУБД.
4. **Компенсирующая транзакция при ошибке базы данных**:
   ```typescript
   } catch (dbErr) {
     await client.query('ROLLBACK');
     if (req.file) {
       await deletePhysicalFile(req.file.filename);
     }
     throw dbErr;
   } finally {
     client.release();
   }
   ```
   Если запрос к БД завершился сбоем (например, потеря связи с PostgreSQL или конфликт ключей):
   - Выполняется откат транзакции `ROLLBACK`.
   - Сохраненный на диске файл немедленно удаляется через `deletePhysicalFile()`.
   - Соединение `client` гарантированно возвращается в пул в секции `finally`.
   - Никаких частичных или поврежденных состояний в системе не возникает.

---

### 3.4. PUT /api/tasks/:id (Строки 193-266) – Частичное обновление
- Позволяет обновлять как все поля, так и отдельные свойства (например, смену статуса из выпадающего списка карточки).
- Проверяет существование задачи (`404`).
- Валидирует статус через `VALID_STATUSES` (`400`).
- Выполняет `UPDATE tasks SET ..., updated_at = NOW() WHERE id = $5`.
- Повторно запрашивает и возвращает обновленный объект со всеми вложениями через `json_agg` со статусом `200 OK`.

---

### 3.5. DELETE /api/tasks/:id (Строки 268-287) – Каскадное удаление
Удаление задачи требует синхронной очистки двух сред: физического диска и таблиц PostgreSQL.

**Алгоритм:**
1. Поиск всех вложений задачи:
   `SELECT stored_name FROM attachments WHERE task_id = $1`
2. Асинхронное физическое удаление каждого файла с диска:
   ```typescript
   for (const row of attRes.rows) {
     await deletePhysicalFile(row.stored_name);
   }
   ```
3. Выполнение запроса удаления задачи:
   `DELETE FROM tasks WHERE id = $1`
4. В базе данных срабатывает триггер внешнего ключа `ON DELETE CASCADE`: записи в таблице `attachments` удаляются сервером PostgreSQL автоматически.

---

### 3.6. POST /api/tasks/:id/attachments (Строки 289-332)
- Прикрепление дополнительного файла к уже существующей карточке задачи.
- Проверяет существование задачи в БД. Если задачи нет, загруженный файл тут же удаляется с диска (`deletePhysicalFile`), а клиенту возвращается `404`.
- Сохраняет запись в таблицу `attachments`.
- Обновляет временную метку задачи: `UPDATE tasks SET updated_at = NOW() WHERE id = $1`.
- Возвращает клиенту метаданные созданного вложения со статусом `201 Created`.

---

### 3.7. DELETE /api/tasks/:id/attachments/:attachmentId (Строки 334-352)
- Удаление отдельного файла без удаления самой задачи.
- Проверяет соответствие `id = $1 AND task_id = $2`.
- Удаляет физический файл с диска.
- Удаляет строку из таблицы `attachments`.
- Обновляет `updated_at` родительской задачи.

---

### 3.8. GET /api/tasks/:id/attachments/:attachmentId/download (Строки 354-378)
Обеспечивает безопасное скачивание файлов пользователем.

```typescript
apiRouter.get('/tasks/:id/attachments/:attachmentId/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { id, attachmentId } = req.params;
  const attRes = await pool.query('SELECT original_name, stored_name FROM attachments WHERE id = $1 AND task_id = $2', [attachmentId, id]);
  if (attRes.rows.length === 0) {
    res.status(404).json({ error: 'Вложение не найдено' });
    return;
  }

  const { original_name, stored_name } = attRes.rows[0];
  const filePath = getUploadFilePath(stored_name);

  try {
    await fs.access(filePath);
  } catch {
    res.status(404).json({ error: 'Физический файл не найден на сервере' });
    return;
  }

  res.download(filePath, original_name);
});
```
- `fs.access(filePath)` проверяет доступность файла в файловой системе (предотвращает зависание потока при случайном ручном удалении файла с диска).
- Метод `res.download(filePath, original_name)`:
  - Автоматически выставляет HTTP-заголовок `Content-Disposition: attachment; filename="<original_name>"`.
  - Открывает бинарный `ReadStream` к файлу на диске и транслирует его в HTTP-сокет ответа.
  - Пользователь скачивает файл с его человекочитаемым исходным именем (например, `Otchet_lab2.docx`), в то время как на сервере файл физически хранился под безопасным UUID-именем.
