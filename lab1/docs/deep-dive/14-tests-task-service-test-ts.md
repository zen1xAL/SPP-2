# Разбор файла: tests/task-service.test.ts

**Путь к файлу**: [tests/task-service.test.ts](file:///d:/SPP/7sem/SPP/tests/task-service.test.ts)  
**Роль в архитектуре**: Набор модульных тестов (Unit Tests), верификация бизнес-логики сервиса, изолированная файловая песочница и гарантия целостности данных.

---

## 1. Концептуальное и архитектурное назначение

Файл [tests/task-service.test.ts](file:///d:/SPP/7sem/SPP/tests/task-service.test.ts) реализует бескомпромиссное модульное тестирование сервисного слоя [TaskService](file:///d:/SPP/7sem/SPP/src/services/task-service.ts).
Ключевые принципы тестирования:
1. **Герметичность тестов (Hermetic Test Isolation)**: каждый тест запускается в полностью изолированной временной папке `./data/test-service/`. Ни один тест не может повлиять на результаты другого теста или испортить реальную рабочую базу данных.
2. **Верификация бизнес-правил**: проверка дефолтных значений, блокировка создания задач с пустыми заголовками, валидация допустимости статусов.
3. **Физическая проверка работы с диском**: тесты не просто проверяют структуры в памяти, но и физически проверяют создание и удаление файлов на жестком диске через системные вызовы `fs.access`.

---

## 2. Ключевые концепции Vitest и асинхронного тестирования

### 2.1. Современный раннер Vitest vs Jest
В проекте используется Vitest. В отличие от устаревшего Jest, Vitest нативно поддерживает спецификацию ECMAScript Modules (ESM), не требует сложных пресетов `babel-jest` для компиляции TypeScript и выполняет тесты с высокой скоростью за счет встроенного движка сборщика Vite и пула воркеров (Worker Threads).

### 2.2. Проверка асинхронных исключений через `rejects.toThrow`
Когда тестируемый метод возвращает отклоненный Promise (Rejected Promise), классическая конструкция `try / catch` громоздка. Vitest предоставляет элегантный синтаксис:
```typescript
await expect(service.createTask({ title: '   ' })).rejects.toThrow('Название задачи обязательно для заполнения');
```
Конструкция `await expect(promise).rejects.toThrow()` ожидает отклонения промиса и проверяет соответствие выброшенного сообщения об ошибке.

### 2.3. Жизненный цикл `beforeEach` и `afterEach`
- `beforeEach`: выполняется перед **каждым** отдельным тестом `it(...)`. Создает чистую песочницу директорий и свежие экземпляры репозитория и сервиса.
- `afterEach`: выполняется после **каждого** теста. Удаляет всю тестовую директорию (`fs.rm` с ключами `recursive: true, force: true`), гарантируя нулевой след на диске.

---

## 3. Построчный разбор тестов

### Строки 1–6: Импорты тестового окружения
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonTaskRepository } from '../src/storage/json-task-repository.js';
import { TaskService } from '../src/services/task-service.js';
import type { Attachment, TaskStatus } from '../src/domain/models/task.js';
```
- Импорт файлового API, ассертов Vitest и тестируемых классов.

### Строки 8–26: Настройка изолированной песочницы
```typescript
describe('TaskService Unit Tests', () => {
  const testDataDir = path.resolve('./data/test-service');
  const testDataFile = path.join(testDataDir, 'tasks.json');
  const testUploadDir = path.join(testDataDir, 'uploads');

  let service: TaskService;

  beforeEach(async () => {
    await fs.mkdir(testDataDir, { recursive: true });
    await fs.mkdir(testUploadDir, { recursive: true });
    await fs.writeFile(testDataFile, JSON.stringify([], null, 2), 'utf-8');

    const repository = new JsonTaskRepository(testDataFile);
    service = new TaskService(repository, testUploadDir);
  });

  afterEach(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
  });
```
- **Строки 9–11**: Определение путей к изолированной тестовой папке, JSON-файлу и папке загрузок.
- **Строки 15–22**: Хук `beforeEach`: очищает и заново инициализирует пустой файл `tasks.json` (`[]`), создает инстанс `JsonTaskRepository` и передает его в `TaskService`.
- **Строки 24–26**: Хук `afterEach`: полностью удаляет папку тестов.

### Строки 28–41: Тест создания задачи со значениями по умолчанию
```typescript
  it('should create a task with default pending status and valid fields', async () => {
    const task = await service.createTask({
      title: 'Новая тестовая задача',
      description: 'Подробное описание задачи',
      dueDate: '2026-10-15'
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Новая тестовая задача');
    expect(task.description).toBe('Подробное описание задачи');
    expect(task.status).toBe('pending');
    expect(task.dueDate).toBe('2026-10-15');
    expect(task.attachments).toHaveLength(0);
  });
```
- Проверяет генерацию UUID `id`, корректную установку статуса по умолчанию (`'pending'`) и пустой массив вложений.

### Строки 43–47: Тест валидации обязательности заголовка
```typescript
  it('should throw error when creating a task with empty title', async () => {
    await expect(service.createTask({ title: '   ' })).rejects.toThrow(
      'Название задачи обязательно для заполнения'
    );
  });
```
- Передает строку, состоящую только из пробелов. Проверяет, что сервис отклоняет запрос с текстом `'Название задачи обязательно для заполнения'`.

### Строки 49–57: Тест смены статуса задачи
```typescript
  it('should update task status correctly', async () => {
    const task = await service.createTask({ title: 'Задача в работе' });
    const updated = await service.updateTaskStatus(task.id, 'in_progress');

    expect(updated.status).toBe('in_progress');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(task.updatedAt).getTime()
    );
  });
```
- Проверяет обновление статуса на `'in_progress'` и обновление временной метки `updatedAt`.

### Строки 59–64: Тест отклонения недопустимого статуса
```typescript
  it('should throw error when updating to invalid status', async () => {
    const task = await service.createTask({ title: 'Тест некорректного статуса' });
    await expect(
      service.updateTaskStatus(task.id, 'unknown_status' as unknown as TaskStatus)
    ).rejects.toThrow('Недопустимый статус задачи');
  });
```
- Передает заведомо некорректный статус, проверяя отсечение на уровне бизнес-логики.

### Строки 66–82: Тест фильтрации и расчета статистики
```typescript
  it('should filter tasks by status and calculate accurate stats', async () => {
    await service.createTask({ title: 'Task 1', status: 'pending', dueDate: '2020-01-01' });
    await service.createTask({ title: 'Task 2', status: 'in_progress', dueDate: '2099-01-01' });
    await service.createTask({ title: 'Task 3', status: 'completed', dueDate: '2020-01-01' });

    const all = await service.getTasks('all');
    expect(all.tasks).toHaveLength(3);
    expect(all.stats.total).toBe(3);
    expect(all.stats.pending).toBe(1);
    expect(all.stats.inProgress).toBe(1);
    expect(all.stats.completed).toBe(1);
    expect(all.stats.overdue).toBe(1);

    const pendingOnly = await service.getTasks('pending');
    expect(pendingOnly.tasks).toHaveLength(1);
    expect(pendingOnly.tasks[0].title).toBe('Task 1');
  });
```
- Создает три задачи с разными статусами и дедлайнами (в прошлом и будущем).
- Верифицирует точный расчет счетчиков: общее (3), ожидают (1), в работе (1), завершены (1), просрочено (1: просрочена только `Task 1`, так как `Task 3` завершена и не считается просроченной).
- Проверяет работу фильтра `'pending'`.

### Строки 84–109: Тест добавления, удаления вложений и физических файлов
```typescript
  it('should attach and remove files, deleting physical files', async () => {
    const task = await service.createTask({ title: 'Задача с файлом' });

    const storedFileName = 'test-file.txt';
    const filePath = path.join(testUploadDir, storedFileName);
    await fs.writeFile(filePath, 'Пример содержимого файла');

    const attachment: Attachment = {
      id: 'att-1',
      originalName: 'документ.txt',
      storedName: storedFileName,
      mimeType: 'text/plain',
      size: 24,
      uploadedAt: new Date().toISOString()
    };

    const taskWithAtt = await service.addAttachment(task.id, attachment);
    expect(taskWithAtt.attachments).toHaveLength(1);

    await expect(fs.access(filePath)).resolves.toBeUndefined();

    const taskWithoutAtt = await service.removeAttachment(task.id, attachment.id);
    expect(taskWithoutAtt.attachments).toHaveLength(0);

    await expect(fs.access(filePath)).rejects.toThrow();
  });
```
- Физически записывает файл на диск, прикрепляет его через `addAttachment`.
- `expect(fs.access(filePath)).resolves.toBeUndefined()` подтверждает наличие файла на диске.
- Вызывает `removeAttachment` и проверяет, что файл был физически удален с диска (`fs.access` выбрасывает ошибку).

### Строки 111–137: Тест удаления задачи с каскадной очисткой вложений
```typescript
  it('should delete task and all its associated physical files', async () => {
    const storedFileName = 'delete-me.txt';
    const filePath = path.join(testUploadDir, storedFileName);
    await fs.writeFile(filePath, 'Тестовый файл для удаления');

    const attachment: Attachment = {
      id: 'att-del',
      originalName: 'delete-me.txt',
      storedName: storedFileName,
      mimeType: 'text/plain',
      size: 25,
      uploadedAt: new Date().toISOString()
    };

    const task = await service.createTask({
      title: 'Задача на удаление',
      attachment
    });

    const deleted = await service.deleteTask(task.id);
    expect(deleted).toBe(true);

    const found = await service.getTaskById(task.id);
    expect(found).toBeNull();

    await expect(fs.access(filePath)).rejects.toThrow();
  });
```
- Гарантирует, что вызов `deleteTask` стирает не только запись в базе данных, но и все прикрепленные к ней файлы на жестком диске.
