# Пошаговый разбор сквозных сценариев работы TaskFlow RBAC (Code Walkthrough)

Данный документ содержит детальный построчный разбор жизненного цикла приложения от нажатия кнопки в браузере до записи в базу данных PostgreSQL и возврата ответа. Все примеры снабжены реальными листингами функций из кодовой базы проекта и подробным описанием каждого шага для подготовки к защите «с нуля».

---

## Оглавление

1. [Сценарий 1: Авторизация (Логин) и получение токена доступа](#сценарий-1-авторизация-логин-и-получение-токена-доступа)
   - [Шаг 1.1: Браузерная форма и отправка запроса (AuthModal.tsx)](#шаг-11-браузерная-форма-и-отправка-запроса-authmodaltsx)
   - [Шаг 1.2: Клиентский слой API и сохранение в localStorage (api.ts)](#шаг-12-клиентский-слой-api-и-сохранение-в-localstorage-apits)
   - [Шаг 1.3: Серверный перехватчик Rate Limiting (rateLimiter.ts)](#шаг-13-серверный-перехватчик-rate-limiting-ratelimiterts)
   - [Шаг 1.4: Проверка пароля и генерация сессии в Express (routes.ts)](#шаг-14-проверка-пароля-и-генерация-сессии-в-express-routests)
   - [Шаг 1.5: Подписание JWT токена (auth.ts)](#шаг-15-подписание-jwt-токена-authts)
   - [Шаг 1.6: Обработка ответа на клиенте и запуск приложения (App.tsx)](#шаг-16-обработка-ответа-на-клиенте-и-запуск-приложения-apptsx)

2. [Сценарий 2: Создание новой задачи с прикреплением файла (Multipart FormData + RBAC)](#сценарий-2-создание-новой-задачи-с-прикреплением-файла-multipart-formdata--rbac)
   - [Шаг 2.1: Сбор данных формы и файла (TaskForm.tsx)](#шаг-21-сбор-данных-формы-и-файла-taskformtsx)
   - [Шаг 2.2: Отправка multipart/form-data с заголовком Bearer (api.ts)](#шаг-22-отправка-multipartform-data-с-заголовком-bearer-apits)
   - [Шаг 2.3: Валидация JWT и проверка сессии в БД (auth.ts: authenticateToken)](#шаг-23-валидация-jwt-и-проверка-сессии-в-бд-authts-authenticatetoken)
   - [Шаг 2.4: Ролевой фильтр RBAC (auth.ts: requireRole)](#шаг-24-ролевой-фильтр-rbac-authts-requirerole)
   - [Шаг 2.5: Перехват файла библиотекой Multer (upload.ts)](#шаг-25-перехват-файла-библиотекой-multer-uploadts)
   - [Шаг 2.6: Атомарная транзакция в PostgreSQL и ответ (routes.ts)](#шаг-26-атомарная-транзакция-в-postgresql-и-ответ-routests)
   - [Шаг 2.7: Обновление интерфейса без перезагрузки страницы (App.tsx)](#шаг-27-обновление-интерфейса-без-перезагрузки-страницы-apptsx)

3. [Сценарий 3: Защищенное скачивание прикрепленного файла](#сценарий-3-защищенное-скачивание-прикрепленного-файла)
   - [Шаг 3.1: Формирование ссылки с query-токеном (TaskCard.tsx & api.ts)](#шаг-31-формирование-ссылки-с-query-токеном-taskcardtsx--apits)
   - [Шаг 3.2: Проверка токена из query-параметра (auth.ts)](#шаг-32-проверка-токена-из-query-параметра-authts)
   - [Шаг 3.3: Поиск в БД, защита от Path Traversal и отдача потока (routes.ts)](#шаг-33-поиск-в-бд-защита-от-path-traversal-и-отдача-потока-routests)

4. [Сценарий 4: Удаленный отзыв активной сессии (Session Revocation)](#сценарий-4-удаленный-отзыв-активной-сессии-session-revocation)
   - [Шаг 4.1: Отображение сессий с парсингом User-Agent (SessionsModal.tsx)](#шаг-41-отображение-сессий-с-парсингом-user-agent-sessionsmodaltsx)
   - [Шаг 4.2: Отправка команды на отзыв сессии (api.ts)](#шаг-42-отправка-команды-на-отзыв-сессии-apits)
   - [Шаг 4.3: Инвалидация в БД со статусом 204 No Content (routes.ts)](#шаг-43-инвалидация-в-бд-со-статусом-204-no-content-routests)
   - [Шаг 4.4: Что происходит на отозванном устройстве (api.ts auto-logout)](#шаг-44-что-происходит-на-отозванном-устройстве-apits-auto-logout)

---

## Сценарий 1: Авторизация (Логин) и получение токена доступа

Этот сценарий показывает, что происходит от момента, когда пользователь нажимает кнопку «Войти», до момента, когда он видит список задач.

```
[Браузер] AuthModal.tsx ──► api.ts:login() ──► HTTP POST /api/auth/login
                                                     │
                                                     ▼
                                          rateLimiter.ts (проверка IP)
                                                     │
                                                     ▼
                                          routes.ts (bcrypt + PostgreSQL)
                                                     │
                                                     ▼
                                          auth.ts (генерация JWT)
                                                     │
                                                     ▼
                                          Запись в таблицу sessions
                                                     │
[Браузер] App.tsx ◄── localStorage ◄── JSON { token, user }
```

### Шаг 1.1: Браузерная форма и отправка запроса (AuthModal.tsx)
В компоненте [AuthModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/AuthModal.tsx#L56-L87) пользователь либо вводит логин и пароль вручную, либо нажимает кнопку быстрого входа под тестовой ролью (Seed-пользователь: admin, manager или viewer).

Срабатывает функция отправки формы:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\components\AuthModal.tsx (строки 56-87)
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault(); // Предотвращаем стандартную перезагрузку страницы браузером
  setIsLoading(true); // Включаем спиннер на кнопке
  setErrorMessage(''); // Сбрасываем старые ошибки

  try {
    if (tab === 'login') {
      // Вызываем сетевую функцию входа
      await login(email, password);
      onSuccess(); // Оповещаем App.tsx об успехе
      onClose();   // Закрываем модальное окно
    }
  } catch (err) {
    // Если сервер вернул HTTP 429 (Too Many Requests), извлекаем время блокировки
    if (err instanceof ApiError && err.statusCode === 429) {
      setRetryCountdown(err.retryAfterSeconds || 60);
    }
    setErrorMessage(err instanceof Error ? err.message : 'Произошла ошибка');
  } finally {
    setIsLoading(false);
  }
};
```
* **Зачем этот код**: он валидирует отправку формы на клиенте, ловит возможные сетевые ошибки и запускает таймер блокировки при коде 429.

---

### Шаг 1.2: Клиентский слой API и сохранение в localStorage (api.ts)
Функция `login()` в файле [api.ts](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L112-L122) берет сырые строковые данные и передает их в универсальный HTTP-клиент `request()`:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\api.ts (строки 112-122)
export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  // Сохраняем полученный JWT токен и профиль в локальное хранилище браузера
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}
```

Внутри `request()` происходит сам сетевой запрос `fetch()`:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\api.ts (строки 59-71)
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  // Если в localStorage уже был токен, автоматически прикрепляем его к запросу
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  // ... обработка ответа
}
```
* **Зачем этот код**: централизует работу с заголовками авторизации. Любой запрос через `request()` автоматически становится авторизованным.

---

### Шаг 1.3: Серверный перехватчик Rate Limiting (rateLimiter.ts)
Запрос прилетает на сервер Express по адресу `POST /api/auth/login`. Прежде чем запрос попадет к базе данных, его встречает middleware [rateLimiter.ts:checkLoginRateLimit](file:///d:/SPP/7sem/SPP/lab3/src/server/rateLimiter.ts#L16-L44):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\rateLimiter.ts (строки 16-44)
export function checkLoginRateLimit(req: Request, res: Response, next: NextFunction): void {
  // Определяем IP-клиента (с учетом прокси-заголовков Docker)
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || 'unknown');
  const clientIp = rawIp.replace(/^.*:/, '');
  const now = Date.now();

  const record = ipAttempts.get(clientIp);

  // Проверяем: заблокирован ли данный IP?
  if (record && record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    
    // Выставляем стандартный RFC HTTP-заголовок Retry-After
    res.setHeader('Retry-After', remainingSeconds.toString());

    // Обрываем запрос со статусом 429 Too Many Requests
    res.status(429).json({
      error: `Превышен лимит попыток входа. Повторите попытку через ${Math.ceil(remainingSeconds / 60)} мин.`,
      code: 'TOO_MANY_REQUESTS',
      statusCode: 429,
      retryAfterSeconds: remainingSeconds
    });
    return; // Запрос НЕ идет дальше в базу данных
  }

  next(); // Если лимит не превышен, передаем управление контроллеру входа
}
```
* **Зачем этот код**: защищает сервер и БД от падения под нагрузкой скриптов-брутфорсеров. Ошибочные попытки отсекаются в оперативной памяти за микросекунды.

---

### Шаг 1.4: Проверка пароля и генерация сессии в Express (routes.ts)
Если IP чист, управление переходит к функции в [routes.ts:102-224](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L102-L224):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\routes.ts (фрагмент строк 116-200)
// 1. Ищем пользователя в PostgreSQL по email
const userRes = await pool.query(
  'SELECT id, email, password_hash, role, failed_attempts, locked_until FROM users WHERE email = $1',
  [email.trim().toLowerCase()]
);

if (userRes.rows.length === 0) {
  recordFailedLogin(clientIp); // Фиксируем ошибку для IP
  res.status(401).json({ error: 'Неверный адрес электронной почты или пароль', code: 'INVALID_CREDENTIALS', statusCode: 401 });
  return;
}

const user = userRes.rows[0];

// 2. Проверяем, не заблокирован ли сам аккаунт (вторая линия обороны)
if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
  res.status(429).json({ error: 'Учетная запись временно заблокирована', code: 'ACCOUNT_LOCKED', statusCode: 429 });
  return;
}

// 3. Сверяем пароль с помощью bcrypt
const isMatch = bcrypt.compareSync(password, user.password_hash);
if (!isMatch) {
  recordFailedLogin(clientIp);
  const newAttempts = user.failed_attempts + 1;

  // Если 5 ошибок подряд - блокируем аккаунт на 15 минут в БД
  if (newAttempts >= 5) {
    const lockTimestamp = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query('UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3', [newAttempts, lockTimestamp, user.id]);
  } else {
    await pool.query('UPDATE users SET failed_attempts = $1 WHERE id = $2', [newAttempts, user.id]);
  }

  res.status(401).json({ error: 'Неверный адрес электронной почты или пароль', code: 'INVALID_CREDENTIALS', statusCode: 401 });
  return;
}

// 4. Пароль верный! Сбрасываем счетчики ошибок
await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
resetFailedLogin(clientIp);

// 5. Создаем сессию и JWT токен
const sessionId = uuidv4();
const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
const token = generateAccessToken({
  userId: user.id,
  email: user.email,
  role: user.role,
  sessionId
});

// Хэшируем токен через SHA-256 для безопасного сохранения в БД
const tokenHashed = hashToken(token);
const userAgent = req.headers['user-agent'] || 'Unknown Browser';

await pool.query(`
  INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
  VALUES ($1, $2, $3, $4, $5, $6)
`, [sessionId, user.id, tokenHashed, clientIp, userAgent, expiresAt]);

// 6. Отправляем успешный ответ 200 OK
res.status(200).json({
  message: 'Успешный вход в систему',
  token,
  user: { id: user.id, email: user.email, role: user.role },
  session: { id: sessionId, expiresAt: expiresAt.toISOString() }
});
```

---

### Шаг 1.5: Подписание JWT токена (auth.ts)
Вспомогательная функция в [auth.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L37-L39):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\auth.ts (строки 37-39)
export function generateAccessToken(payload: TokenPayload): string {
  // Библиотека jsonwebtoken берет полезные данные (payload),
  // секретный ключ сервера (JWT_SECRET) и создает криптографическую подпись HMAC-SHA256
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}
```

---

### Шаг 1.6: Обработка ответа на клиенте и запуск приложения (App.tsx)
После того как сервер вернул `200 OK`, управление возвращается в [App.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/App.tsx#L273-L279):

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\App.tsx (строки 276-279)
onSuccess={() => {
  // 1. Считываем сохраненного пользователя из localStorage
  setCurrentUser(getStoredUser());
  // 2. Показываем всплывающее уведомление
  showNotification('success', 'Успешный вход в систему!');
}}
```

Так как изменился стейт `currentUser`, в [App.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/App.tsx#L92-L96) мгновенно срабатывает хук `useEffect`:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\App.tsx (строки 92-96)
useEffect(() => {
  if (currentUser) {
    loadTasks(currentFilter); // Делает GET /api/tasks и отображает список задач!
  }
}, [currentUser, currentFilter, loadTasks]);
```

---

## Сценарий 2: Создание новой задачи с прикреплением файла (Multipart FormData + RBAC)

Этот сценарий иллюстрирует полный цикл создания сущности: проверку прав доступа роли (RBAC), обработку бинарного файла через `multer`, защиту от инъекций и сохранение данных в реляционной БД в транзакции.

```
[React] TaskForm.tsx (FormData: title + file)
                  │
                  ▼
[api.ts: createTask] ──► HTTP POST /api/tasks (с токеном Bearer)
                                │
                                ▼
              [auth.ts: authenticateToken] ──► Проверяет подпись JWT + статус sessions в БД
                                │
                                ▼
              [auth.ts: requireRole('admin', 'manager')] ──► Если viewer -> 403 Forbidden!
                                │
                                ▼
              [upload.ts: upload.single()] ──► Валидация расширения + запись в /app/uploads/
                                │
                                ▼
              [routes.ts: POST /tasks]
                BEGIN (Транзакция PostgreSQL)
                  ├─► INSERT INTO tasks (...)
                  ├─► INSERT INTO attachments (...)
                COMMIT
                                │
                                ▼
[React] App.tsx ◄── 201 Created (новая задача в стейте, закрытие формы)
```

### Шаг 2.1: Сбор данных формы и файла (TaskForm.tsx)
Пользователь заполнил поля «Название», «Описание», выбрал срок, статус и прикрепил файл (например, `report.pdf`). При нажатии «Создать задачу» срабатывает [TaskForm.tsx:18-50](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/TaskForm.tsx#L18-L50):

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\components\TaskForm.tsx (строки 18-50)
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!title.trim()) {
    setValidationError('Название задачи обязательно для заполнения');
    return;
  }

  setIsSubmitting(true);

  try {
    // Создаем объект FormData для отправки бинарных данных (файлов)
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('status', status);
    if (dueDate) {
      formData.append('dueDate', dueDate);
    }
    if (file) {
      formData.append('attachment', file); // Прикрепляем бинарный файл из <input type="file">
    }

    // Передаем FormData наверх в App.tsx
    await onTaskCreated(formData);

    // Очищаем форму и закрываем панель
    setTitle('');
    setDescription('');
    setFile(null);
    onClose();
  } finally {
    setIsSubmitting(false);
  }
};
```

---

### Шаг 2.2: Отправка multipart/form-data с заголовком Bearer (api.ts)
В [api.ts:178-183](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L178-L183) вызывается функция `createTask`:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\api.ts (строки 178-183)
export async function createTask(formData: FormData): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: formData // Браузер сам выставит Content-Type: multipart/form-data с boundary
  });
}
```
*Важная деталь*: мы не прописываем `Content-Type: multipart/form-data` вручную, так как браузер обязан сам сгенерировать уникальный разделитель `boundary`. Функция `request()` подставляет токен `Authorization: Bearer <JWT>`.

---

### Шаг 2.3: Валидация JWT и проверка сессии в БД (auth.ts: authenticateToken)
Запрос приходит на сервер в цепочку middleware маршрута [routes.ts:548-553](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L548-L553):
`apiRouter.post('/tasks', authenticateToken, requireRole('admin', 'manager'), upload.single('attachment'), ...)`

Первым срабатывает [auth.ts:authenticateToken](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L49-L123):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\auth.ts (строки 49-123)
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim(); // Отрезаем слово "Bearer "
  }

  if (!token) {
    res.status(401).json({ error: 'Требуется токен авторизации (Bearer)', code: 'UNAUTHORIZED', statusCode: 401 });
    return;
  }

  // 1. Проверяем подпись и срок действия токена
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Недействительный или истекший ключ доступа', code: 'TOKEN_EXPIRED', statusCode: 401 });
    return;
  }

  // 2. Проверяем состояние сессии в таблице PostgreSQL
  const sessionRes = await pool.query(
    'SELECT is_revoked, expires_at FROM sessions WHERE id = $1',
    [payload.sessionId]
  );

  if (sessionRes.rows.length === 0 || sessionRes.rows[0].is_revoked) {
    res.status(401).json({ error: 'Сессия была отозвана', code: 'SESSION_REVOKED', statusCode: 401 });
    return;
  }

  // 3. Сессия активна! Прикрепляем данные пользователя к объекту запроса Express
  req.user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
    sessionId: payload.sessionId
  };

  next(); // Передаем управление следующему middleware
}
```

---

### Шаг 2.4: Ролевой фильтр RBAC (auth.ts: requireRole)
Следующим в цепочке стоит [auth.ts:requireRole](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L125-L147):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\auth.ts (строки 125-147)
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Если пользователь не вошел:
    if (!req.user) {
      res.status(401).json({ error: 'Пользователь не аутентифицирован', statusCode: 401 });
      return;
    }

    // Если у пользователя роль 'viewer', а маршрут требует 'admin' или 'manager':
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Недостаточно прав. Требуются роли: ${allowedRoles.join(', ')}. Ваша роль: ${req.user.role}`,
        code: 'FORBIDDEN',
        statusCode: 403
      });
      return; // Запрос прерывается!
    }

    next(); // Если роль admin или manager, идем к загрузчику файлов
  };
}
```

---

### Шаг 2.5: Перехват файла библиотекой Multer (upload.ts)
Далее срабатывает middleware `upload.single('attachment')` из [upload.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/upload.ts#L33-L64):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\upload.ts (строки 33-64)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR); // Папка на диске: /app/uploads
  },
  filename: (_req, file, cb) => {
    // Безопасность: генерируем случайное имя UUIDv4, сохраняя расширение
    const originalExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(originalExt) ? originalExt : '.bin';
    const uniqueName = `${uuidv4()}${safeExt}`; // Пример: "c3d9a102-4f11-48e2-9b22-8d7b3e51834f.pdf"
    cb(null, uniqueName);
  }
});

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // Проверяем по белому списку: pdf, doc, txt, png, jpg, zip, csv и т.д.
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Недопустимый формат файла: ${ext}`));
  }
};
```
*Multer сохраняет файл на диск и помещает объект `req.file` с метаданными в запрос.*

---

### Шаг 2.6: Атомарная транзакция в PostgreSQL и ответ (routes.ts)
Теперь выполняется тело контроллера в [routes.ts:553-639](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L553-L639). Работа с базой ведется через транзакцию:

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\routes.ts (фрагмент строк 575-636)
const client = await pool.connect(); // Берем выделенное соединение из пула
try {
  await client.query('BEGIN'); // Начинаем транзакцию

  const taskId = uuidv4();
  // 1. Вставляем запись задачи в таблицу tasks
  const taskRes = await client.query(`
    INSERT INTO tasks (id, title, description, status, due_date, author_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, title, description, status, to_char(due_date, 'YYYY-MM-DD') as "dueDate", author_id as "authorId", created_at as "createdAt"
  `, [taskId, trimmedTitle, description.trim(), taskStatus, parsedDueDate, req.user?.id]);

  const attachments = [];

  // 2. Если файл был прикреплен, вставляем запись в таблицу attachments
  if (req.file) {
    const attachmentId = uuidv4();
    const safeOriginalName = sanitizeFileName(req.file.originalname); // Очищаем имя от "../"

    const attRes = await client.query(`
      INSERT INTO attachments (id, task_id, original_name, stored_name, mime_type, size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, original_name as "originalName", stored_name as "storedName", mime_type as "mimeType", size::text, uploaded_at as "uploadedAt"
    `, [attachmentId, taskId, safeOriginalName, req.file.filename, req.file.mimetype, req.file.size]);

    attachments.push(attRes.rows[0]);
  }

  await client.query('COMMIT'); // Фиксируем изменения в базе данных

  // Возвращаем статус 201 Created и объект созданной задачи
  res.status(201).json({
    ...taskRes.rows[0],
    authorEmail: req.user?.email,
    attachments
  });
} catch (dbErr) {
  await client.query('ROLLBACK'); // Откатываем изменения при ошибке базы данных
  if (req.file) {
    await deletePhysicalFile(req.file.filename); // Удаляем физический файл с диска
  }
  throw dbErr;
} finally {
  client.release(); // Возвращаем соединение обратно в пул
}
```

---

### Шаг 2.7: Обновление интерфейса без перезагрузки страницы (App.tsx)
Клиент получает статус 201, и в [App.tsx:111-120](file:///d:/SPP/7sem/SPP/lab3/src/client/src/App.tsx#L111-L120) вызывается:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\App.tsx (строки 111-120)
const handleCreateTask = async (formData: FormData) => {
  try {
    await createTask(formData);
    showNotification('success', 'Задача успешно создана!');
    await loadTasks(currentFilter); // Перезапрашивает список задач с сервера
  } catch (err) {
    showNotification('error', err instanceof Error ? err.message : 'Ошибка создания задачи');
  }
};
```
Список задач обновляется, пересчитываются счетчики метрик в компоненте [MetricsGrid.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/MetricsGrid.tsx), и новая задача сразу же отображается в карточке [TaskCard.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/TaskCard.tsx).

---

## Сценарий 3: Защищенное скачивание прикрепленного файла

### Шаг 3.1: Формирование ссылки с query-токеном (TaskCard.tsx & api.ts)
В карточке задачи [TaskCard.tsx:138-144](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/TaskCard.tsx#L138-L144) находится ссылка на скачивание файла:

```tsx
// d:\SPP\7sem\SPP\lab3\src\client\src\components\TaskCard.tsx
<a
  href={getDownloadUrl(task.id, att.id)}
  className="file-link"
  title={`Скачать ${att.originalName}`}
>
  <span className="file-name">{att.originalName}</span>
  <span className="file-size">{formatFileSize(att.size)}</span>
</a>
```

Функция `getDownloadUrl()` в [api.ts:217-220](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L217-L220):

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\api.ts
export function getDownloadUrl(taskId: string, attachmentId: string): string {
  const token = getToken();
  return `${BASE_URL}/tasks/${taskId}/attachments/${attachmentId}/download?token=${encodeURIComponent(token || '')}`;
}
```
*Почему токен передается в параметре `?token=...`, а не в заголовке `Authorization`?*
Потому что стандартный HTML-тег `<a href="...">` вызывает прямой GET-запрос браузера на навигацию/скачивание и не позволяет произвольно добавить заголовок `Authorization: Bearer`. Поэтому токен безопасно передается в query-параметре.

---

### Шаг 3.2: Проверка токена из query-параметра (auth.ts)
На сервере middleware `authenticateToken` умеет извлекать токен как из заголовка, так и из query-параметра:

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\auth.ts (строки 54-56)
} else if (req.query.token && typeof req.query.token === 'string') {
  token = req.query.token.trim(); // Успешно извлекли токен из URL!
}
```
Токен проверяется по сигнатуре и валидируется по таблице `sessions` ровно так же, как и для обычных API-запросов.

---

### Шаг 3.3: Поиск в БД, защита от Path Traversal и отдача потока (routes.ts)
В [routes.ts:881-917](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L881-L917) сервер выполняет отдачу файла:

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\routes.ts (строки 888-913)
// 1. Ищем метаданные файла в БД (принадлежит ли файл указанной задаче?)
const attRes = await pool.query(
  'SELECT original_name, stored_name FROM attachments WHERE id = $1 AND task_id = $2',
  [attachmentId, id]
);

if (attRes.rows.length === 0) {
  res.status(404).json({ error: 'Вложение не найдено', code: 'ATTACHMENT_NOT_FOUND', statusCode: 404 });
  return;
}

const { original_name, stored_name } = attRes.rows[0];

// 2. Безопасное разрешение пути (защита от Path Traversal через path.basename)
const filePath = getUploadFilePath(stored_name);

// 3. Проверяем наличие файла на физическом диске
try {
  await fs.access(filePath);
} catch {
  res.status(404).json({ error: 'Физический файл не найден на сервере', statusCode: 404 });
  return;
}

// 4. Отдаем файл с оригинальным именем (res.download устанавливает Content-Disposition)
res.download(filePath, original_name);
```

---

## Сценарий 4: Удаленный отзыв активной сессии (Session Revocation)

Этот сценарий раскрывает механизм **Stateful JWT** – как сервер делает недействительным выданный криптографический токен до истечения его тайм-аута.

### Шаг 4.1: Отображение сессий с парсингом User-Agent (SessionsModal.tsx)
Пользователь открывает окно сессий. Компонент [SessionsModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/SessionsModal.tsx#L15-L39) делает запрос `GET /api/auth/sessions` и преобразует технические строки браузера в понятные названия:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\components\SessionsModal.tsx (строки 15-39)
function parseUserAgent(ua: string): { browser: string; os: string } {
  let os = 'Неизвестная ОС';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iOS';

  let browser = 'Браузер';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';

  return { browser, os };
}
```
Текущая сессия помечается бейджем «Текущая сессия» (`sess.id === currentUser.sessionId`).

---

### Шаг 4.2: Отправка команды на отзыв сессии (api.ts)
Пользователь видит подозрительный вход с другого браузера и нажимает красную кнопку «Отозвать»:

```typescript
// d:\SPP\7sem\SPP\lab3\src\client\src\api.ts (строки 149-151)
export async function revokeSession(id: string): Promise<void> {
  return request<void>(`/auth/sessions/${id}`, { method: 'DELETE' });
}
```

---

### Шаг 4.3: Инвалидация в БД со статусом 204 No Content (routes.ts)
На сервере в [routes.ts:283-319](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts#L283-L319):

```typescript
// d:\SPP\7sem\SPP\lab3\src\server\routes.ts (строки 283-318)
apiRouter.delete('/auth/sessions/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const isGlobalAdmin = req.user?.role === 'admin';

    // 1. Проверяем, существует ли такая сессия
    const checkRes = await pool.query('SELECT user_id FROM sessions WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({ error: 'Сессия не найдена', statusCode: 404 });
      return;
    }

    // 2. Обычный пользователь (manager/viewer) может отзывать ТОЛЬКО свои сессии!
    // Администратор (admin) имеет право отзывать сессии любых пользователей
    if (!isGlobalAdmin && checkRes.rows[0].user_id !== req.user?.id) {
      res.status(403).json({ error: 'Запрещено отзывать сессии других пользователей', statusCode: 403 });
      return;
    }

    // 3. Выставляем флаг is_revoked = true в базе данных
    await pool.query('UPDATE sessions SET is_revoked = true WHERE id = $1', [id]);

    // Возвращаем семантический статус 204 No Content (успешно, тела ответа нет)
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

---

### Шаг 4.4: Что происходит на отозванном устройстве (api.ts auto-logout)
Представим, что на том самом «отозванном» ноутбуке злоумышленник пытается запросить список задач:
1. Запрос `GET /api/tasks` отправляет JWT токен.
2. Подпись JWT еще валидна (15 минут не прошли).
3. Но middleware [auth.ts:authenticateToken](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts#L80-L101) делает запрос в БД:
   ```typescript
   const sessionRes = await pool.query('SELECT is_revoked FROM sessions WHERE id = $1', [payload.sessionId]);
   if (session.is_revoked) {
     res.status(401).json({ error: 'Сессия была отозвана', code: 'SESSION_REVOKED', statusCode: 401 });
     return;
   }
   ```
4. На клиенте в [api.ts:101-104](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts#L101-L104) срабатывает перехватчик:
   ```typescript
   if (res.status === 401 && (errorCode === 'TOKEN_EXPIRED' || errorCode === 'SESSION_REVOKED')) {
     setToken(null);       // Стираем токен из localStorage
     setStoredUser(null);  // Стираем пользователя
   }
   ```
5. В `App.tsx` сбрасывается стейт `currentUser`, закрываются все панели задач, и на экран принудительно выводится окно входа [AuthModal.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/components/AuthModal.tsx) с сообщением:
   *«Сессия истекла или была отозвана. Пожалуйста, выполните вход.»*

---

## Итоговая шпаргалка соответствия файлов и обязанностей

| Что нужно объяснить | Файл | Главная функция / сущность |
| :--- | :--- | :--- |
| **Где точка входа сервера?** | [server.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/server.ts) | `initDbWithRetry()` ждет PostgreSQL, `startServer()` слушает порт 3000. |
| **Где настроен Express?** | [app.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/app.ts) | `createApp()` подключает cors, json, static, router и error middleware. |
| **Где логируются запросы?** | [logger.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/logger.ts) | `requestLogger` вешает `X-Request-Id` и пишет JSON-логи с миллисекундами. |
| **Где защита от брутфорса?** | [rateLimiter.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/rateLimiter.ts) | `checkLoginRateLimit` блокирует IP на 15 мин при 5 ошибках (HTTP 429). |
| **Где проверяются роли и JWT?** | [auth.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts) | `authenticateToken` проверяет токен и сессию в БД, `requireRole` дает 403 Forbidden. |
| **Где сохраняются файлы на диск?** | [upload.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/upload.ts) | `multer.diskStorage` генерирует имена UUIDv4, отсекает опасные расширения. |
| **Где лежат маршруты API?** | [routes.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/routes.ts) | 12 эндпоинтов (auth, tasks, sessions, attachments, password-reset). |
| **Где создаются таблицы БД?** | [db.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/db.ts) | `initDb()` создает 5 таблиц и сидирует admin, manager, viewer. |
| **Где все запросы к серверу?** | [api.ts](file:///d:/SPP/7sem/SPP/lab3/src/client/src/api.ts) | `request<T>()` крепит Bearer токен, хранит токен в localStorage. |
| **Где главное состояние фронта?** | [App.tsx](file:///d:/SPP/7sem/SPP/lab3/src/client/src/App.tsx) | Хранит `currentUser`, `tasks`, фильтры и обновляет экран. |
