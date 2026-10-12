# Ролевая модель доступа (RBAC), временные ключи и безопасность

Данный документ содержит построчный и архитектурный анализ реализации безопасности в Лабораторной работе №3.

---

## 1. Трехуровневая модель доступа (Role-Based Access Control / RBAC)

В системе реализовано 3 роли с четким разделением привилегий:

| Роль | Чтение задач (`GET /tasks`) | Скачивание файлов | Создание задач (`POST /tasks`) | Редактирование (`PUT /tasks`) | Удаление (`DELETE /tasks`) | Управление сессиями |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`viewer`** (Наблюдатель) | ✅ Разрешено | ✅ Разрешено | ❌ Запрещено (`403 Forbidden`) | ❌ Запрещено (`403 Forbidden`) | ❌ Запрещено (`403 Forbidden`) | Только свои сессии |
| **`manager`** (Менеджер) | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено | Только свои сессии |
| **`admin`** (Администратор) | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено | ✅ Разрешено | Все сессии всех пользователей |

### Реализация Middleware: requireRole
В файле [src/server/auth.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts) реализована функция высшего порядка:

```typescript
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Пользователь не аутентифицирован',
        code: 'UNAUTHORIZED',
        statusCode: 401
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Недостаточно прав. Требуются роли: ${allowedRoles.join(', ')}. Ваша роль: ${req.user.role}`,
        code: 'FORBIDDEN',
        statusCode: 403
      });
      return;
    }

    next();
  };
}
```

Если пользователь с ролью `viewer` отправляет запрос создания задачи `POST /api/tasks`, middleware перехватывает его до передачи в контроллер и возвращает статус `403 Forbidden` со структурированным кодом ошибки `FORBIDDEN`.

---

## 2. Модель аутентификации на основе временных ключей (JWT)

В соответствии с требованием 1, доступ к ресурсам осуществляется исключительно на основе **временных ключей**:
1. При успешном логине сервер генерирует криптографически подписанный JWT-токен:
   ```typescript
   export function generateAccessToken(payload: TokenPayload): string {
     return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
   }
   ```
2. **Время жизни ключа (TTL)**: 15 минут (`15m`). По истечении этого времени токен становится недействительным.
3. Клиент сохраняет токен в `localStorage` и при каждом сетевом запросе передает его в заголовке:
   `Authorization: Bearer <token>`.
4. Для скачивания файлов браузером через ссылку `<a href="...">` токен также поддерживается в query-параметре: `?token=<token>`.

---

## 3. Защита от подбора учетных данных (Brute-Force Rate Limiting)

В модуле [src/server/rateLimiter.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/rateLimiter.ts) реализован механизм отражения атак методом подбора паролей:
1. Система отслеживает неудачные попытки входа по IP-адресу и email.
2. Порог: максимум **5 неудачных попыток** в течение 15 минут.
3. При превышении порога:
   - Включается блокировка на 15 минут (900 секунд).
   - Сервер возвращает статус **`429 Too Many Requests`**.
   - Добавляется стандартный заголовок **`Retry-After: <seconds>`**.
   - В логгер пишется предупреждение уровня `warn` с действием `auth.rate_limited`.
4. При успешном вводе пароля счетчик неудачных попыток сбрасывается.

---

## 4. Контроль активных подключений (Active Sessions)

Каждый успешный вход создает изолированную запись в таблице `sessions` PostgreSQL:
- Поля: `id` (UUID), `user_id`, `token_hash` (SHA-256 хэш токена), `ip_address`, `user_agent`, `created_at`, `expires_at`, `is_revoked`.

### Проверка актуальности сессии при каждом запросе:
В [auth.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/auth.ts) middleware `authenticateToken` проверяет не только валидность самого JWT-ключа, но и состояние сессии в базе данных:
```typescript
const sessionRes = await pool.query(
  'SELECT is_revoked, expires_at FROM sessions WHERE id = $1',
  [payload.sessionId]
);

if (session.is_revoked) {
  res.status(401).json({ error: 'Сессия была отозвана', code: 'SESSION_REVOKED', statusCode: 401 });
  return;
}
```

### Возможности пользователя:
- `GET /api/auth/sessions`: получение списка всех своих активных сессий (устройство, браузер, IP, дата).
- `DELETE /api/auth/sessions/:id`: принудительное завершение конкретной сессии на другом компьютере со статусом `204 No Content`. После этого все последующие запросы с того устройства будут мгновенно отклоняться с кодом `401 Unauthorized`.

---

## 5. Восстановление доступа через электронную почту

1. Пользователь запрашивает сброс через `POST /api/auth/forgot-password` с указанием email.
2. Модуль [src/server/email.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/email.ts) генерирует криптографический одноразовый токен:
   `crypto.randomBytes(32).toString('hex')`.
3. Хэш токена сохраняется в таблице `password_resets` со сроком жизни 15 минут.
4. Формируется ссылка вида `/reset-password?token=<hex>`.
5. Событие отправки логируется в структурированный JSON-лог.
6. При переходе по ссылке пользователь отправляет `POST /api/auth/reset-password`:
   - Токен проверяется на срок действия и однократность использования (`used_at IS NULL`).
   - Пароль обновляется в `users` с хэшированием `bcrypt`.
   - Токен помечается использованным (`used_at = NOW()`).
   - **Все активные сессии пользователя принудительно отзываются** (`UPDATE sessions SET is_revoked = true`).
   - При повторной попытке использования того же токена сервер возвращает статус `422 Unprocessable Entity` (`RESET_TOKEN_ALREADY_USED`).
