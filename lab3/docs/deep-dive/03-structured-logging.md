# Структурированное логирование и трейсинг запросов: logger.ts

Данный документ содержит анализ реализации модуля структурированного логирования [src/server/logger.ts](file:///d:/SPP/7sem/SPP/lab3/src/server/logger.ts), отвечающего за сбор телеметрии, аудит безопасности и корреляцию событий через сквозные идентификаторы запросов (Request ID).

---

## 1. Зачем нужно структурированное логирование?

В традиционных учебных проектах разработчики часто используют неструктурированный вывод:
```typescript
console.log('Пользователь вошел: ' + email);
```

В распределенных и контейнеризированных системах такой вывод непригоден:
- Невозможно автоматически отфильтровать события по конкретному пользователю или коду ошибки.
- Централизованные системы сбора логов (ELK Stack / Elasticsearch, Grafana Loki, Datadog, AWS CloudWatch) требуют структурированных форматов для индексации и построения дашбордов.

**Структурированное логирование** записывает каждое событие как единый JSON-объект, содержащий строго типизированные поля.

---

## 2. Поля и контракт JSON-лога

Каждая строка в логе имеет следующий формат:

```json
{
  "timestamp": "2026-10-12T20:55:00.123Z",
  "level": "info",
  "message": "HTTP POST /api/tasks",
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "method": "POST",
  "url": "/api/tasks",
  "statusCode": 201,
  "responseTimeMs": 14,
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "action": "task.created",
  "taskId": "a1b2c3d4-...",
  "operatorId": "user-uuid-1"
}
```

### Назначение ключевых полей:
1. `timestamp`: Время события в формате ISO 8601 с миллисекундами по Гринвичу (UTC).
2. `level`: Уровень важности события (`debug`, `info`, `warn`, `error`).
3. `requestId`: Уникальный сквозной идентификатор запроса (Correlation ID). Позволяет связать в одну цепочку приход запроса, SQL-транзакции в базе данных и финальный ответ клиенту.
4. `statusCode` и `responseTimeMs`: Метрики производительности, позволяющие выявлять узкие места и медленные запросы.
5. `action`: Семантический маркер бизнес-операции (`auth.login_success`, `auth.rate_limited`, `task.created`, `auth.session_revoked`).

---

## 3. Сквозной трейсинг (Request ID / Correlation ID)

В Express-конвейере зарегистрирован middleware `requestLogger`:

```typescript
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.id = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const statusCode = res.statusCode;
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](`HTTP ${req.method} ${req.originalUrl || req.url}`, {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      responseTimeMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
  });

  next();
}
```

### Физика работы:
1. Клиент может передать свой идентификатор в заголовке `X-Request-Id`, либо сервер генерирует новый криптографический UUIDv4.
2. Идентификатор прокидывается в заголовок ответа `res.setHeader('X-Request-Id', requestId)`: если у пользователя в браузере возникнет сбой, он может скопировать этот ID из DevTools и предоставить администратору для мгновенного поиска инцидента.
3. По завершении ответа (`res.on('finish')`) автоматически замеряется затраченное время в миллисекундах и пишется итоговая строка лога.
4. Ошибки уровня `error` направляются в поток `process.stderr`, а информационные логи `info` / `warn` – в поток `process.stdout`.
