# Разбор файла: src/domain/models/task.ts

**Путь к файлу**: [src/domain/models/task.ts](file:///d:/SPP/7sem/SPP/src/domain/models/task.ts)  
**Роль в архитектуре**: Ядро предметной области (Domain Layer / Clean Architecture Core), определения сущностей, интерфейсов DTO, предикатов типов (Type Guards) и чистых функций бизнес-логики.

---

## 1. Концептуальное и архитектурное назначение

Файл [src/domain/models/task.ts](file:///d:/SPP/7sem/SPP/src/domain/models/task.ts) находится в самом сердце архитектуры приложения. В методологии Clean Architecture и Domain-Driven Design (DDD) доменный слой обладает наивысшим иммунитетом:
- Он **не зависит ни от одного внешнего пакета, фреймворка или базы данных** (в файле нет импортов сторонних библиотек).
- Он определяет контракт данных: что такое «Задача» (`Task`), какие у нее состояния (`TaskStatus`), что представляет собой прикрепленный файл (`Attachment`).
- Он содержит чистые математические функции вычисления дедлайнов (`isOverdue`) и форматирования размеров файлов (`formatFileSize`), не имеющие побочных эффектов (side effects).

---

## 2. Ключевые концепции TypeScript и особенности типизации

### 2.1. Объединения строковых литералов (String Literal Unions)
Вместо классических числовых `enum` TypeScript, генерирующих громоздкие двунаправленные объекты в JS-рантайме, здесь используется объединение литеральных типов:
```typescript
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
```
Это дает стопроцентную типобезопасность на этапе компиляции: любая опечатка (например, `'in-progress'` через дефис) немедленно подсвечивается компилятором как ошибка типов, при этом в скомпилированном JS это обычная строка.

### 2.2. Иммутабельность через модификатор `readonly`
Все поля интерфейсов (`Task`, `Attachment`, `TaskStats`) помечены модификатором `readonly`. Это запрещает случайную прямую мутацию свойств объекта (например, `task.status = 'completed'` вызовет ошибку компиляции TS2540). Изменения состояния в приложении должны производиться только через создание новых объектов (копирование со спредом `{ ...task, status }`), что исключает трудноуловимые баги разделяемого состояния (shared mutable state).

### 2.3. Пользовательские предикаты типов (Custom Type Guards)
Функции вида `function isValidStatus(value: unknown): value is TaskStatus` сообщают системе типов TypeScript, что если функция возвращает `true`, то тип непроверенной переменной `value` внутри соответствующего блока `if` сужается (Type Narrowing) от небезопасного `unknown` до валидного `TaskStatus`.

### 2.4. Вычисление дат без сдвига часовых поясов
Сравнение дат в веб-приложениях – частый источник ошибок (особенно вокруг полуночи при смене таймзон). В функции `isOverdue` обе даты сбрасываются в локальную полночь (`setHours(0, 0, 0, 0)`), что позволяет корректно сравнивать календарные дни без искажений из-за времени суток или летнего/зимнего времени.

---

## 3. Построчный разбор кода

### Строка 1: Определение типа статуса задачи
```typescript
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
```
- Задает замкнутое множество допустимых статусов: `'pending'` (ожидает), `'in_progress'` (в работе), `'completed'` (завершена).

### Строки 3–10: Интерфейс вложения (Attachment)
```typescript
export interface Attachment {
  readonly id: string;
  readonly originalName: string;
  readonly storedName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedAt: string;
}
```
- `id`: Уникальный UUID файла в системе.
- `originalName`: Имя файла при загрузке пользователем (например, `document.pdf`), отображается в UI.
- `storedName`: Реальное имя файла на диске в папке `uploads/` (UUID + безопасное расширение), исключающее коллизии и атаки перезаписи.
- `mimeType`: MIME-тип (например, `image/png`, `application/pdf`).
- `size`: Размер файла в байтах.
- `uploadedAt`: Временная метка ISO 8601.

### Строки 12–21: Доменная сущность задачи (Task)
```typescript
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly Attachment[];
}
```
- `dueDate`: Срок исполнения (строка формата `YYYY-MM-DD` или `null`, если дедлайн не назначен).
- `attachments`: Неизменяемый массив (`readonly Attachment[]`), предотвращающий прямое использование мутирующих методов вроде `push()`.

### Строки 23–36: Объекты передачи данных (DTO)
```typescript
export interface CreateTaskDTO {
  readonly title: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly dueDate?: string | null;
  readonly attachment?: Attachment;
}

export interface UpdateTaskDTO {
  readonly title?: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly dueDate?: string | null;
}
```
- `CreateTaskDTO`: Данные, поступающие из формы создания задачи. Поля `description`, `status`, `dueDate`, `attachment` опциональны (`?:`).
- `UpdateTaskDTO`: Данные частичного обновления задачи (все поля опциональны).

### Строки 38–46: Фильтры и статистика
```typescript
export type TaskFilter = 'all' | TaskStatus;

export interface TaskStats {
  readonly total: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly overdue: number;
}
```
- `TaskFilter`: Расширяет статусы специальным значением `'all'` для отображения полного списка.
- `TaskStats`: Агрегированные счетчики задач по статусам и просроченным дедлайнам для вывода карточек метрик на дашборде.

### Строки 48–56: Константа статусов и Type Guards
```typescript
export const VALID_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed'] as const;

export function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && VALID_STATUSES.includes(value as TaskStatus);
}

export function isValidFilter(value: unknown): value is TaskFilter {
  return value === 'all' || isValidStatus(value);
}
```
- **Строка 48**: Модификатор `as const` фиксирует литеральные типы элементов массива, предотвращая расширение типа до `string[]`.
- **Строки 50–52**: Функция валидации статуса. Принимает небезопасный `unknown` (например, сырые данные из `req.body` или `req.query`) и возвращает предикат `value is TaskStatus`.
- **Строки 54–56**: Валидатор фильтра: проверяет, равен ли аргумент строке `'all'` или является валидным статусом.

### Строки 58–69: Бизнес-логика проверки просрочки (isOverdue)
```typescript
export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
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
- **Строка 59**: Если дедлайн не задан или задача уже завершена (`completed`), она не может считаться просроченной.
- **Строки 62–66**: Обнуляются часы, минуты, секунды и миллисекунды для текущей даты и для даты дедлайна.
- **Строка 68**: `due.getTime() < today.getTime()` сравнивает Unix-эпоху в миллисекундах. Если дата дедлайна строго меньше сегодняшнего дня – задача считается просроченной.

### Строки 71–75: Форматирование размера файлов (formatFileSize)
```typescript
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```
- Переводит сырой размер в байтах в человекочитаемый вид:
  - Меньше 1 КиБ – вывод в байтах (`B`).
  - От 1 КиБ до 1 МиБ – деление на 1024 с округлением до одного знака (`KB`).
  - От 1 МиБ и выше – деление на $1024^2$ (`MB`).
