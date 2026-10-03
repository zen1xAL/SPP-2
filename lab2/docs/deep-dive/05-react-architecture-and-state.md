# Клиентская архитектура React 18, типизация и управление состоянием

Данный документ содержит детальный анализ клиентской части Single Page Application (SPA), включая инициализацию React 18, строгие TypeScript-контракты [types.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/types.ts), сервисный слой сетевого взаимодействия [api.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/api.ts) и центральный автомат состояний [App.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/App.tsx).

---

## 1. Точка монтирования React 18: main.tsx

В файле [main.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/main.tsx) реализован запуск современного конкурентного рендерера React 18:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Корневой DOM-элемент #root не найден');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Физика работы:
1. `document.getElementById('root')`: Находит контейнерный DOM-узел в `index.html`.
2. `ReactDOM.createRoot()`: Инициализирует Concurrent Mode React 18 (в отличие от устаревшего `ReactDOM.render`), позволяющий браузеру прерывать низкоприоритетный рендеринг ради обработки пользовательского ввода.
3. `<React.StrictMode>`: Специальная обертка, помогающая выявлять побочные эффекты (side-effects). В режиме разработки она выполняет двойной прогон эффектов, гарантируя идемпотентность функций очистки.

---

## 2. Модели предметной области и DTO: types.ts

Файл [types.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/types.ts) определяет строгую систему типов. Все свойства помечены модификатором `readonly`, что исключает случайную мутацию данных в компонентах и предотвращает скрытые баги реактивности.

```typescript
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Attachment {
  readonly id: string;
  readonly originalName: string;
  readonly storedName: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly uploadedAt: string;
}

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

export interface TaskStats {
  readonly total: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly overdue: number;
}

export type TaskFilter = 'all' | TaskStatus;
```

- `TaskStatus`: Строгое объединение литеральных типов (Union Type). Значения ограничены `'pending'`, `'in_progress'`, `'completed'`.
- `TaskFilter`: Расширяет статусы задач значением `'all'` для фильтрации всех записей.
- `attachments`: Массив `readonly Attachment[]`, вложенный в модель задачи.

---

## 3. Слой сетевого взаимодействия: api.ts

Модуль [api.ts](file:///d:/SPP/7sem/SPP/lab2/src/client/src/api.ts) изолирует вызовы браузерного API `fetch()`, трансформирует ошибки и гарантирует типобезопасность ответов.

### 3.1. Функция handleResponse
```typescript
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Ошибка сервера (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
    } catch {
      errorMsg = await res.text() || errorMsg;
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}
```
- Стандартный `fetch()` не выбрасывает ошибку при статусах `4xx` и `5xx` (он считает их успешно завершенными сетевыми запросами).
- `handleResponse` проверяет флаг `res.ok`. Если статус вне диапазона 200-299, парсится JSON-структура ошибки бэкенда (`{ error: "..." }`).
- Если бэкенд вернул сырой текст (или HTML с ошибкой прокси), парсится `res.text()`.
- Выбрасывается штатный JavaScript `Error`, который перехватывается пользовательским интерфейсом.

### 3.2. Работа с бинарными данными и FormData
При создании задачи или загрузке файла используется стандартный интерфейс `FormData`:
```typescript
export async function createTask(formData: FormData): Promise<Task> {
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    body: formData
  });
  return handleResponse<Task>(res);
}
```
**Критическая деталь HTTP**: В запросах с `FormData` заголовок `'Content-Type'` **намеренно не указывается вручную**. Браузер обязан сгенерировать его автоматически, подставив уникальную строку границы:  
`Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW`.  
Если бы мы вручную прописали `'Content-Type': 'multipart/form-data'`, сервер не смог бы распарсить разделители и отклонил бы запрос.

---

## 4. Центральный автомат состояний: App.tsx

Компонент [App.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/App.tsx) является корневым координатором Single Page Application. Он хранит актуальное клиентское состояние и распределяет его по дочерним компонентам.

### 4.1. Состав состояния (State Management)
```typescript
const [tasks, setTasks] = useState<Task[]>([]);
const [stats, setStats] = useState<TaskStats>({
  total: 0,
  pending: 0,
  inProgress: 0,
  completed: 0,
  overdue: 0
});
const [currentFilter, setCurrentFilter] = useState<TaskFilter>('all');
const [isFormOpen, setIsFormOpen] = useState(false);
const [isLoading, setIsLoading] = useState(true);
const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
```
1. `tasks`: Локальный массив задач, отображаемых на экране в текущий момент.
2. `stats`: Аналитические метрики для верхних карточек.
3. `currentFilter`: Текущая активная вкладка фильтрации.
4. `isFormOpen`: Флаг видимости выпадающей формы создания новой задачи.
5. `isLoading`: Индикатор ожидания ответа сервера (рендерит спиннер).
6. `notification`: Всплывающее уведомление (зеленый успех или красная ошибка).

---

### 4.2. Алгоритм автоматического закрытия уведомлений
```typescript
const showNotification = (type: 'success' | 'error', message: string) => {
  setNotification({ type, message });
  if (type === 'success') {
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }
};
```
- Для уведомлений об успехе запускается таймер на 4 секунды (4000 мс).
- Использование функционального обновления `setNotification((prev) => ...)` гарантирует, что если за время ожидания пришло новое сообщение, старый таймер не сотрет новое уведомление.
- Ошибки намеренно не закрываются по таймеру: пользователь обязан прочитать текст ошибки и закрыть ее вручную.

---

### 4.3. Асинхронный цикл синхронизации: loadTasks
```typescript
const loadTasks = useCallback(async (filter: TaskFilter) => {
  try {
    setIsLoading(true);
    const data = await fetchTasks(filter);
    setTasks(data.tasks);
    setStats(data.stats);
  } catch (err) {
    showNotification('error', err instanceof Error ? err.message : 'Не удалось загрузить задачи');
  } finally {
    setIsLoading(false);
  }
}, []);

useEffect(() => {
  loadTasks(currentFilter);
}, [loadTasks, currentFilter]);
```
- `useCallback` мемоизирует функцию загрузки, предотвращая создание нового функционального объекта на каждом рендере.
- `useEffect` срабатывает при монтировании компонента, а также каждый раз при изменении `currentFilter`.
- Пользователь кликает по вкладке «В работе» -> `currentFilter` меняется на `'in_progress'` -> `useEffect` инициирует фоновый `fetch` -> React плавно обновляет виртуальный DOM без единой перезагрузки страницы.

---

### 4.4. Реактивные обработчики действий (Zero-Reload Mutations)
Все операции модификации данных построены по единому шаблону:
1. Вызов асинхронной функции API (`createTask`, `updateTask`, `deleteTask`, `addAttachment`, `deleteAttachment`).
2. Ожидание ответа сервера (`await`).
3. Показ уведомления об успешном выполнении.
4. Вызов `await loadTasks(currentFilter)` для получения свежего состояния из базы данных.
5. При возникновении исключения блок `catch` перехватывает ошибку и выводит всплывающий баннер с понятным текстом.
