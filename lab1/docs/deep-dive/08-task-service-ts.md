# Разбор файла: src/services/task-service.ts

**Путь к файлу**: [src/services/task-service.ts](file:///d:/SPP/7sem/SPP/src/services/task-service.ts)  
**Роль в архитектуре**: Сервисный слой бизнес-логики (Domain Service / Use Cases Layer), оркестрация операций над задачами, агрегация метрик, управление жизненным циклом файлов и координация хранилища.

---

## 1. Концептуальное и архитектурное назначение

Класс `TaskService` в [src/services/task-service.ts](file:///d:/SPP/7sem/SPP/src/services/task-service.ts) инкапсулирует сценарии использования (Use Cases) приложения:
1. **Бизнес-валидация данных**: проверка обязательности заголовка, санитизация пробелов (`trim`), верификация допустимости статусов перед передачей в слой хранения.
2. **Агрегация статистики и расчет дедлайнов**: расчет счетчиков общего количества, статусов и просроченных задач на основе чистой функции [isOverdue](file:///d:/SPP/7sem/SPP/src/domain/models/task.ts#L58-L69).
3. **Управление физическими файлами и побочными эффектами**: при удалении задачи сервис обязан удалить с диска все ассоциированные с ней бинарные файлы. Если при добавлении файла к несуществующей задаче возникает ошибка, сервис гарантирует удаление загруженного файла, предотвращая накопление файлового мусора (file leaks).
4. **Защита от атак обхода директорий (Path Traversal)**: использование `path.basename` перед удалением файлов с диска исключает манипуляции с относительными путями вида `../../etc/passwd`.

---

## 2. Ключевые паттерны и особенности языка

### 2.1. Конструкторное внедрение зависимостей (Constructor Injection)
Класс принимает интерфейс `ITaskRepository` через конструктор:
```typescript
constructor(
  private readonly repository: ITaskRepository,
  private readonly uploadDir: string = './uploads'
) {}
```
TypeScript автоматически создает приватные неизменяемые поля класса из параметров конструктора с модификатором `private readonly`. Сервис не знает, как физически сохраняются задачи – в JSON, базе данных или памяти, что строго соответствует принципу инверсии зависимостей (DIP).

### 2.2. Иммутабельные трансформации структур данных
В методах обновления сервис никогда не мутирует существующие объекты `task.attachments.push(...)`. Вместо этого используются иммутабельные операции языка:
- Оператор расширения (Object Spread) `{ ...task, status, updatedAt }` для создания нового объекта с обновленными полями.
- Массивный спред `[...task.attachments, attachment]` для добавления вложений.
- Метод `.filter()` для удаления элементов без мутации исходного массива.

### 2.3. Генерация UUID v4
Для создания идентификаторов задач и файлов используется спецификация RFC 4122 (UUID версии 4) на основе криптографически стойкого генератора псевдослучайных чисел, что гарантирует уникальность ключей без необходимости автоинкремента в базе данных.

---

## 3. Построчный разбор кода

### Строки 1–15: Импорты
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  Attachment,
  CreateTaskDTO,
  Task,
  TaskFilter,
  TaskStats,
  TaskStatus,
  UpdateTaskDTO
} from '../domain/models/task.js';
import { isOverdue, isValidStatus } from '../domain/models/task.js';
import type { ITaskRepository } from '../storage/task-repository.interface.js';
```
- Импорт стандартных модулей файловой системы, утилиты `uuidv4`, доменных моделей и валидаторов.

### Строки 16–20: Определение класса и конструктор
```typescript
export class TaskService {
  constructor(
    private readonly repository: ITaskRepository,
    private readonly uploadDir: string = './uploads'
  ) {}
```
- Объявление сервиса с внедрением репозитория и пути к директории хранения файлов.

### Строки 22–39: Получение списка задач и расчет статистики `getTasks`
```typescript
  async getTasks(filter: TaskFilter = 'all'): Promise<{ tasks: Task[]; stats: TaskStats }> {
    const allTasks = await this.repository.findAll();

    const stats: TaskStats = {
      total: allTasks.length,
      pending: allTasks.filter((t) => t.status === 'pending').length,
      inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      overdue: allTasks.filter((t) => isOverdue(t.dueDate, t.status)).length
    };

    let filteredTasks = allTasks;
    if (filter !== 'all') {
      filteredTasks = allTasks.filter((t) => t.status === filter);
    }

    return { tasks: filteredTasks, stats };
  }
```
- **Строка 23**: Запрашивает полный список задач из репозитория.
- **Строки 25–31**: Вычисляет агрегированную статистику `TaskStats`. Количество просроченных задач рассчитывается динамически через предикат `isOverdue(t.dueDate, t.status)`.
- **Строки 33–36**: Если передан конкретный статус (не `'all'`), массив фильтруется по значению `t.status === filter`.
- **Строка 38**: Возвращает составной объект с отфильтрованными задачами и глобальной статистикой.

### Строки 41–43: Поиск задачи по идентификатору `getTaskById`
```typescript
  async getTaskById(id: string): Promise<Task | null> {
    return this.repository.findById(id);
  }
```
- Делегирует запрос в репозиторий.

### Строки 45–68: Создание новой задачи `createTask`
```typescript
  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const trimmedTitle = dto.title?.trim();
    if (!trimmedTitle) {
      throw new Error('Название задачи обязательно для заполнения');
    }

    const status: TaskStatus = dto.status && isValidStatus(dto.status) ? dto.status : 'pending';
    const now = new Date().toISOString();

    const attachments: Attachment[] = dto.attachment ? [dto.attachment] : [];

    const task: Task = {
      id: uuidv4(),
      title: trimmedTitle,
      description: dto.description?.trim() ?? '',
      status,
      dueDate: dto.dueDate && dto.dueDate.trim() ? dto.dueDate.trim() : null,
      createdAt: now,
      updatedAt: now,
      attachments
    };

    return this.repository.create(task);
  }
```
- **Строки 46–49**: Проверяет наличие непустого названия задачи после удаления концевых пробелов. При нарушении выбрасывает исключение с понятным текстом ошибки.
- **Строка 51**: Проверяет валидность переданного статуса; если статус не передан или некорректен, выставляет дефолтное значение `'pending'`.
- **Строки 54–65**: Формирует неизменяемый доменный объект `Task`: генерирует `id` через `uuidv4()`, фиксирует метки времени создания и обновления в ISO 8601, добавляет первичное вложение, если оно было загружено с формой.
- **Строка 67**: Передает сущность на сохранение в репозиторий.

### Строки 70–87: Смена статуса задачи `updateTaskStatus`
```typescript
  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    if (!isValidStatus(status)) {
      throw new Error(`Недопустимый статус задачи: ${status}`);
    }

    const task = await this.repository.findById(id);
    if (!task) {
      throw new Error(`Задача с идентификатором ${id} не найдена`);
    }

    const updatedTask: Task = {
      ...task,
      status,
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }
```
- Проверяет валидность статуса через `isValidStatus`.
- Находит задачу по ID. Если задачи нет – бросает бизнес-ошибку.
- Создает обновленную копию объекта с новым статусом и обновленным штампом времени `updatedAt`.

### Строки 89–105: Полное/частичное обновление задачи `updateTask`
```typescript
  async updateTask(id: string, dto: UpdateTaskDTO): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) {
      throw new Error(`Задача с идентификатором ${id} не найдена`);
    }

    const updatedTask: Task = {
      ...task,
      title: dto.title !== undefined ? dto.title.trim() : task.title,
      description: dto.description !== undefined ? dto.description.trim() : task.description,
      status: dto.status && isValidStatus(dto.status) ? dto.status : task.status,
      dueDate: dto.dueDate !== undefined ? (dto.dueDate ? dto.dueDate.trim() : null) : task.dueDate,
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }
```
- Выполняет паттерн частичного обновления (Partial Update / PATCH): если поле присутствует в DTO, оно валидируется и обновляется, иначе сохраняется старое значение.

### Строки 107–118: Удаление задачи с очисткой файлов `deleteTask`
```typescript
  async deleteTask(id: string): Promise<boolean> {
    const task = await this.repository.findById(id);
    if (!task) {
      return false;
    }

    for (const attachment of task.attachments) {
      await this.deletePhysicalFile(attachment.storedName);
    }

    return this.repository.delete(id);
  }
```
- Ищет задачу. Если она найдена, в цикле асинхронно удаляет с диска все связанные физические файлы вложений через `deletePhysicalFile`.
- Удаляет запись из репозитория.

### Строки 120–134: Добавление файла к задаче `addAttachment`
```typescript
  async addAttachment(taskId: string, attachment: Attachment): Promise<Task> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      await this.deletePhysicalFile(attachment.storedName);
      throw new Error(`Задача с идентификатором ${taskId} не найдена`);
    }

    const updatedTask: Task = {
      ...task,
      attachments: [...task.attachments, attachment],
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }
```
- Если задача не найдена, немедленно удаляет только что загруженный на диск файл (`deletePhysicalFile`), чтобы не оставлять «висячих» файлов без родительской задачи.
- Прикрепляет вложение в конец списка иммутабельным спредом и сохраняет задачу.

### Строки 136–156: Удаление конкретного вложения `removeAttachment`
```typescript
  async removeAttachment(taskId: string, attachmentId: string): Promise<Task> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Задача с идентификатором ${taskId} не найдена`);
    }

    const attachmentToRemove = task.attachments.find((a) => a.id === attachmentId);
    if (!attachmentToRemove) {
      throw new Error(`Вложение с идентификатором ${attachmentId} не найдено`);
    }

    await this.deletePhysicalFile(attachmentToRemove.storedName);

    const updatedTask: Task = {
      ...task,
      attachments: task.attachments.filter((a) => a.id !== attachmentId),
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }
```
- Ищет вложение по `attachmentId`. Удаляет физический файл с диска и исключает запись из массива вложений задачи через `.filter()`.

### Строки 158–165: Получение данных вложения `getAttachment`
```typescript
  async getAttachment(taskId: string, attachmentId: string): Promise<Attachment | null> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      return null;
    }
    const attachment = task.attachments.find((a) => a.id === attachmentId);
    return attachment ?? null;
  }
```
- Возвращает объект метаданных вложения для организации скачивания файла контроллером.

### Строки 167–175: Безопасное удаление файла с диска `deletePhysicalFile`
```typescript
  private async deletePhysicalFile(storedName: string): Promise<void> {
    try {
      const safeName = path.basename(storedName);
      const filePath = path.resolve(this.uploadDir, safeName);
      await fs.unlink(filePath);
    } catch {
      return;
    }
  }
```
- `path.basename(storedName)`: гарантирует, что имя файла не содержит разделителей путей (`/` или `\`), нейтрализуя атаки Path Traversal.
- `fs.unlink(filePath)`: удаляет файл с диска.
- Блок `catch` подавляет ошибки, если файл уже был удален вручную или отсутствовал, предотвращая падение родительской бизнес-операции.
