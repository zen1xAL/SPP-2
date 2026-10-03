# Разбор файла: src/server/db.ts и работа с PostgreSQL

**Путь к файлу**: [src/server/db.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/db.ts)  
**Роль в архитектуре**: Слой взаимодействия с базой данных (Database Layer), пул сокетов `pg.Pool`, создание реляционной схемы данных (DDL) и генерация стартовых данных (Seeding).

---

## 1. Построчный разбор кода `db.ts`

```typescript
1: import pg from 'pg';
2: import { v4 as uuidv4 } from 'uuid';
3: 
4: const { Pool } = pg;
5: 
6: export const pool = new Pool({
7:   connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/taskdb'
8: });
```

### Что такое `pg.Pool` и как он работает?
* В драйвере Node-Postgres есть два способа общения с базой: одиночный `Client` и пул `Pool`.
* Если бы мы создавали `new Client()` на каждый запрос пользователя, сервер бы тратил драгоценные миллисекунды на открытие TCP-сокета, тройное рукопожатие (SYN/ACK), согласование TLS-шифрования и проверку пароля СУБД.
* `Pool` держит постоянную группу открытых TCP-сокетов. Когда контроллеру нужно сделать запрос, он мгновенно берет свободный сокет из пула, выполняет SQL за доли миллисекунды и возвращает сокет обратно в пул.

---

## 2. Автоматическая миграция схемы базы данных (`initDb`)

```typescript
10: export async function initDb(): Promise<void> {
11:   const client = await pool.connect();
12:   try {
13:     await client.query(`
14:       CREATE TABLE IF NOT EXISTS tasks (
15:         id VARCHAR(64) PRIMARY KEY,
16:         title VARCHAR(255) NOT NULL,
17:         description TEXT NOT NULL DEFAULT '',
18:         status VARCHAR(32) NOT NULL DEFAULT 'pending',
19:         due_date DATE,
20:         created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
21:         updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
22:       );
23: 
24:       CREATE TABLE IF NOT EXISTS attachments (
25:         id VARCHAR(64) PRIMARY KEY,
26:         task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
27:         original_name VARCHAR(255) NOT NULL,
28:         stored_name VARCHAR(255) NOT NULL,
29:         mime_type VARCHAR(128) NOT NULL,
30:         size BIGINT NOT NULL,
31:         uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
32:       );
33:     `);
```

### Разбор структуры таблиц:

1. **Таблица `tasks` (Задачи)**:
   * `id VARCHAR(64) PRIMARY KEY`: Первичный ключ. В качестве идентификаторов используются строки формата UUID v4 (например, `a4f1...-3b2d...`), исключающие коллизии.
   * `title VARCHAR(255) NOT NULL`: Ограничение `NOT NULL` запрещает базе сохранять задачи с пустым названием на уровне физического хранилища.
   * `description TEXT NOT NULL DEFAULT ''`: Неограниченное текстовое поле для заметок.
   * `status VARCHAR(32) NOT NULL DEFAULT 'pending'`: Состояние задачи (`pending`, `in_progress`, `completed`).
   * `due_date DATE`: Календарная дата дедлайна (без времени суток, что исключает сдвиги из-за часовых поясов).
   * `created_at` и `updated_at TIMESTAMP WITH TIME ZONE`: Метки времени с привязкой к часовому поясу, по умолчанию заполняются функцией `NOW()`.

2. **Таблица `attachments` (Вложения) и магия `ON DELETE CASCADE`**:
   * `id VARCHAR(64) PRIMARY KEY`: Уникальный идентификатор файла.
   * `task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE`:
     * Это **внешний ключ (Foreign Key)**, связывающий файл с конкретной задачей.
     * Правило **`ON DELETE CASCADE`** – важнейшая концепция реляционных баз данных. Оно приказывает СУБД: если родительская задача удаляется из таблицы `tasks`, PostgreSQL **сам автоматически удаляет все привязанные к ней строки вложений** из таблицы `attachments`. В коде приложения не нужно вручную писать `DELETE FROM attachments WHERE task_id = ...`.
   * `original_name`: Исходное имя файла (например, `отчет.pdf`) для показа пользователю в интерфейсе.
   * `stored_name`: Реальное имя файла на диске (UUID с расширением, например `e7b9...pdf`), исключающее атаки перезаписи и Path Traversal.
   * `size BIGINT`: Размер файла в байтах. Используется тип `BIGINT` (64-битное целое число), чтобы поддерживать файлы любого объема.

---

## 3. Генерация стартовых демонстрационных данных (Seed Data)

```typescript
35:     const countRes = await client.query('SELECT COUNT(*) FROM tasks');
36:     const count = parseInt(countRes.rows[0].count, 10);
37: 
38:     if (count === 0) {
39:       const today = new Date().toISOString().slice(0, 10);
40:       const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
41: 
42:       await client.query(`
43:         INSERT INTO tasks (id, title, description, status, due_date)
44:         VALUES 
45:           ($1, $2, $3, $4, $5),
46:           ($6, $7, $8, $9, $10),
47:           ($11, $12, $13, $14, $15)
48:       `, [ ... ]);
49:     }
50:   } finally {
51:     client.release();
52:   }
```
* **Строки 35–38**: Проверяет, пуста ли таблица `tasks`. Если в базе 0 записей (первый запуск приложения), выполняется блок наполнения демонстрационными данными.
* **Строки 42–48: Параметризованный SQL-запрос (`$1, $2, ...`)**:  
  **Фундаментальное правило безопасности веб-приложений**: никогда не склеивать SQL-запрос строками (конкатенация `INSERT ... VALUES ('" + title + "')`), так как это открывает уязвимость к **SQL Injection**.  
  Символы `$1, $2` сообщают PostgreSQL, что это внешние параметры. Драйвер экранирует и проверяет типы переданных значений, полностью блокируя любые попытки внедрения вредоносного SQL-кода.
* **Строка 51: `client.release()`**:  
  Обязательно вызывается в блоке `finally`. Если соединение не вернуть в пул, произойдет **утечка соединений (Connection Leak)**: через несколько запросов пул исчерпает лимит открытых сокетов и сервер зависнет.
