# Разбор файла: src/storage/task-repository.interface.ts

**Путь к файлу**: [src/storage/task-repository.interface.ts](file:///d:/SPP/7sem/SPP/src/storage/task-repository.interface.ts)  
**Роль в архитектуре**: Абстракция слоя данных (Data Storage Abstraction), контракт паттерна «Репозиторий» (Repository Pattern) и реализация принципа инверсии зависимостей (Dependency Inversion Principle, буква D в SOLID).

---

## 1. Концептуальное и архитектурное назначение

Интерфейс [src/storage/task-repository.interface.ts](file:///d:/SPP/7sem/SPP/src/storage/task-repository.interface.ts) отделяет бизнес-логику приложения от конкретного способа хранения информации.
- **Свобода замены инфраструктуры**: Сегодня проект хранит задачи в локальном JSON-файле через класс [JsonTaskRepository](file:///d:/SPP/7sem/SPP/src/storage/json-task-repository.ts). Завтра вместо JSON можно подключить PostgreSQL, SQLite или MongoDB, реализовав тот же интерфейс `ITaskRepository`. Сервисный слой [TaskService](file:///d:/SPP/7sem/SPP/src/services/task-service.ts) при этом не изменится ни на единый символ.
- **Тестируемость**: В модульных тестах реальный доступ к файловой системе или базе данных можно заменить легковесным моком или in-memory хранилищем, имплементирующим этот контракт.

---

## 2. Ключевые концепции TypeScript и особенности типизации

### 2.1. Стирание типов (Type Erasure) в TypeScript
Интерфейсы в TypeScript существуют исключительно на этапе статического анализа и компиляции. В сгенерированном JavaScript-файле интерфейс `ITaskRepository` полностью отсутствует (стирается). Однако во время разработки компилятор `tsc` жестко контролирует, чтобы любой класс, помеченный `implements ITaskRepository`, реализовал каждый из пяти заявленных методов с точным совпадением типов аргументов и возвращаемых значений.

### 2.2. Асинхронность контрактов через `Promise<T>`
Все методы репозитория объявлены как возвращающие `Promise<T>`. Даже если текущее хранилище использует быстрый локальный диск или оперативную память, внешние базы данных всегда работают асинхронно через сокеты и сетевые протоколы. Объявление методов асинхронными гарантирует единый неблокирующий интерфейс для любого источника данных.

---

## 3. Построчный разбор кода

### Строка 1: Type-only импорт доменной модели
```typescript
import type { Task } from '../domain/models/task.js';
```
- Импортирует контракт сущности `Task` из [src/domain/models/task.ts](file:///d:/SPP/7sem/SPP/src/domain/models/task.ts). Директива `type` гарантирует, что импорт будет удален из скомпилированного кода.

### Строки 3–9: Объявление интерфейса `ITaskRepository`
```typescript
export interface ITaskRepository {
  findAll(): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  create(task: Task): Promise<Task>;
  update(task: Task): Promise<Task>;
  delete(id: string): Promise<boolean>;
}
```
- **Строка 3**: `export interface ITaskRepository` объявляет публичный контракт хранилища. Префикс `I` традиционно обозначает интерфейс.
- **Строка 4: `findAll(): Promise<Task[]>`**: Метод получения полного списка задач. Возвращает промис с массивом задач.
- **Строка 5: `findById(id: string): Promise<Task | null>`**: Поиск задачи по ее уникальному идентификатору. Возвращает найденную задачу или `null`, если задача отсутствует.
- **Строка 6: `create(task: Task): Promise<Task>`**: Сохранение новой задачи в хранилище. Возвращает созданный объект задачи.
- **Строка 7: `update(task: Task): Promise<Task>`**: Обновление существующей задачи. Выбрасывает исключение, если задача не найдена.
- **Строка 8: `delete(id: string): Promise<boolean>`**: Удаление задачи по идентификатору. Возвращает `true`, если задача была найдена и удалена, либо `false`, если запись отсутствовала.
