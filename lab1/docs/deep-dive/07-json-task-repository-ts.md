# Разбор файла: src/storage/json-task-repository.ts

**Путь к файлу**: [src/storage/json-task-repository.ts](file:///d:/SPP/7sem/SPP/src/storage/json-task-repository.ts)  
**Роль в архитектуре**: Конкретная реализация хранилища данных (Infrastructure / Storage Layer), файловая персистентность на основе JSON с атомарной записью и автоматической инициализацией демонстрационных данных.

---

## 1. Концептуальное и архитектурное назначение

Файл [src/storage/json-task-repository.ts](file:///d:/SPP/7sem/SPP/src/storage/json-task-repository.ts) реализует интерфейс [ITaskRepository](file:///d:/SPP/7sem/SPP/src/storage/task-repository.interface.ts). Его ключевые инженерные особенности:
1. **Неблокирующий ввод-вывод (Asynchronous Non-blocking I/O)**: все операции чтения и записи производятся через модуль `node:fs/promises`, выполняющий системные вызовы в пуле потоков libuv без блокировки основного потока Event Loop.
2. **Атомарная запись файлов (Atomic Write Pattern)**: прямое сохранение данных в рабочий файл `tasks.json` создает риск повреждения файла, если во время записи произойдет сбой питания, падение процесса Node.js или перезапуск контейнера. Репозиторий применяет безопасный паттерн: данные сначала пишутся во временный файл `.tmp`, а затем атомарно перемещаются системным вызовом `rename`.
3. **Ленивая инициализация и Seed-данные**: если папка или файл базы отсутствуют, репозиторий автоматически создает структуру директорий и наполняет файл стартовыми демонстрационными задачами.

---

## 2. Ключевые концепции Node.js и особенности файловой системы

### 2.1. Пул потоков libuv и `node:fs/promises`
В отличие от сетевых сокетов, которые в операционных системах поддерживают асинхронные уведомления (epoll в Linux, kqueue в macOS, IOCP в Windows), операции с локальными файловыми дескрипторами в большинстве ОС блокируют вызывающий поток ядра. Node.js решает это через встроенную библиотеку **libuv**: вызовы `fs.readFile`, `fs.writeFile`, `fs.rename` делегируются в фоновый пул рабочих потоков (по умолчанию 4 потока `UV_THREADPOOL_SIZE`), а в основной поток возвращается JavaScript `Promise`.

### 2.2. Атомарность операции `fs.rename`
Когда процесс пишет файл напрямую (`fs.writeFile`), файл некоторое время находится в частично записанном состоянии. Если в этот миллисекундный интервал прочитать файл – парсер `JSON.parse` упадет с `SyntaxError: Unexpected end of JSON input`.
Паттерн атомарной записи исключает это:
```typescript
const tempFile = `${this.filePath}.tmp`;
await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2), 'utf-8');
await fs.rename(tempFile, this.filePath);
```
Системный вызов ядра ОС `rename()` на уровне файловой системы лишь меняет указатель в таблице дескрипторов (inode в Unix или MFT в NTFS). Для сторонних процессов файл либо виден в старой версии, либо мгновенно и целиком в новой, но никогда в поврежденной.

---

## 3. Построчный разбор кода

### Строки 1–4: Импорты
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Task } from '../domain/models/task.js';
import type { ITaskRepository } from './task-repository.interface.js';
```
- Импортирует асинхронный API файловой системы `fs.promises`, модуль работы с путями `path` и TypeScript-типы.

### Строки 6–12: Класс и конструктор
```typescript
export class JsonTaskRepository implements ITaskRepository {
  private readonly filePath: string;
  private isInitialized = false;

  constructor(filePath: string = './data/tasks.json') {
    this.filePath = path.resolve(filePath);
  }
```
- `implements ITaskRepository`: указывает компилятору строго проверять реализацию контракта.
- `filePath`: абсолютный нормализованный путь к JSON-файлу через `path.resolve()`.
- `isInitialized`: флаг однократной проверки наличия файла, предотвращающий лишние обращения к диску при каждом запросе.

### Строки 14–61: Метод ленивой инициализации `ensureInitialized`
```typescript
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      const initialTasks: Task[] = [ ... ];
      await fs.writeFile(this.filePath, JSON.stringify(initialTasks, null, 2), 'utf-8');
    }

    this.isInitialized = true;
  }
```
- **Строки 15–17**: Если флаг `isInitialized` уже взведен, метод мгновенно выходит (fast path).
- **Строки 19–20**: `path.dirname()` извлекает директорию файла (например, `./data`), а `fs.mkdir(dir, { recursive: true })` безопасно создает ее (включая любые промежуточные папки). Опция `recursive: true` не выбрасывает ошибку, если директория уже существует.
- **Строки 22–24**: `fs.access(this.filePath)` проверяет существование файла. Если файл не существует, `access` выбрасывает исключение и управление передается в блок `catch`.
- **Строки 25–58**: В блоке `catch` инициализируется массив из трех демонстрационных задач с разными статусами (`completed`, `in_progress`, `pending`) и дедлайнами, после чего файл создается через `fs.writeFile` с форматированием (отступ 2 пробела).
- **Строка 60**: Взводится флаг `this.isInitialized = true`.

### Строки 63–72: Чтение данных `readTasks`
```typescript
  private async readTasks(): Promise<Task[]> {
    await this.ensureInitialized();
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
```
- Читает файл как строку в кодировке UTF-8.
- Парсит JSON. Проверка `Array.isArray(parsed)` защищает систему от краха, если в файле случайно оказался объект или примитив вместо массива. При любой ошибке возвращается пустой массив `[]`.

### Строки 74–79: Атомарная запись `writeTasks`
```typescript
  private async writeTasks(tasks: Task[]): Promise<void> {
    await this.ensureInitialized();
    const tempFile = `${this.filePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2), 'utf-8');
    await fs.rename(tempFile, this.filePath);
  }
```
- Гарантирует целостность базы данных: запись во временный файл и последующая атомарная подмена через `fs.rename`.

### Строки 81–89: Методы `findAll` и `findById`
```typescript
  async findAll(): Promise<Task[]> {
    return this.readTasks();
  }

  async findById(id: string): Promise<Task | null> {
    const tasks = await this.readTasks();
    const task = tasks.find((t) => t.id === id);
    return task ?? null;
  }
```
- `findAll`: возвращает весь список задач.
- `findById`: использует метод массива `.find()`. Оператор нулевого слияния `task ?? null` преобразует возможный `undefined` в строгий `null` в соответствии с интерфейсом.

### Строки 91–96: Создание задачи `create`
```typescript
  async create(task: Task): Promise<Task> {
    const tasks = await this.readTasks();
    tasks.unshift(task);
    await this.writeTasks(tasks);
    return task;
  }
```
- Метод `tasks.unshift(task)` добавляет новую задачу в **начало массива** (индекс 0), чтобы свежесозданные задачи сразу отображались первыми в интерфейсе.

### Строки 98–107: Обновление задачи `update`
```typescript
  async update(task: Task): Promise<Task> {
    const tasks = await this.readTasks();
    const index = tasks.findIndex((t) => t.id === task.id);
    if (index === -1) {
      throw new Error(`Task with id ${task.id} not found`);
    }
    tasks[index] = task;
    await this.writeTasks(tasks);
    return task;
  }
```
- Находит индекс задачи по идентификатору. Если элемент не найден (`index === -1`), выбрасывает ошибку. Иначе заменяет объект по индексу и атомарно записывает обновленный массив.

### Строки 109–118: Удаление задачи `delete`
```typescript
  async delete(id: string): Promise<boolean> {
    const tasks = await this.readTasks();
    const initialLength = tasks.length;
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === initialLength) {
      return false;
    }
    await this.writeTasks(filtered);
    return true;
  }
```
- Фильтрует массив, исключая задачу с указанным ID. Если длина отфильтрованного массива осталась прежней – значит удалять было нечего, возвращается `false`. Если элемент был удален – файл перезаписывается и возвращается `true`.
