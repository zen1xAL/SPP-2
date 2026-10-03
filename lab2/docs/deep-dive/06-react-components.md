# Анатомия и логика UI-компонентов React

Данный документ содержит построчный анализ всех презентационных и интерактивных компонентов React, расположенных в каталоге [lab2/src/client/src/components/](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/).

---

## 1. Карточка задачи: TaskCard.tsx

Компонент [TaskCard.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/TaskCard.tsx) представляет собой многофункциональный блок задачи. Он не только отображает данные, но и позволяет менять статус на лету, скачивать и удалять прикрепленные файлы, а также добавлять новые вложения без открытия дополнительных окон.

### 1.1. Вспомогательные функции форматирования
```typescript
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Не указан';
  const [year, month, day] = dateStr.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

function formatFileSize(bytes: string | number): string {
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num)) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}
```
- `formatDate`: Преобразует ISO-строку базы данных вида `2026-10-15` в принятый формат `15.10.2026`. Если дата отсутствует, выводится строка `'Не указан'`.
- `formatFileSize`: Преобразует сырое количество байт в удобочитаемые единицы измерения (байты, килобайты, мегабайты) с точностью до одного знака после запятой.

---

### 1.2. Логика прикрепления файлов на карточке
```typescript
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    onAddAttachment(task.id, file);
    e.target.value = '';
  }
};
```
- Инпут типа `file` скрыт стилями (`className="visually-hidden"`), а пользователю видна стилизованная кнопка `<label className="btn-file-label">`.
- При выборе файла вызывается `onAddAttachment(task.id, file)`.
- **Важный нюанс**: Команда `e.target.value = ''` сбрасывает внутреннее значение инпута в браузере. Если пользователь удалит файл и захочет прикрепить тот же самый файл повторно, браузер корректно сгенерирует событие `onChange`. Без этой строки браузер проигнорировал бы повторный выбор файла с тем же именем.

---

### 1.3. Интерактивная смена статуса
В нижней части карточки размещен выпадающий список `<select>`:
```typescript
<select
  id={`status-${task.id}`}
  value={task.status}
  onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
  className="status-select"
>
  <option value="pending">Ожидает</option>
  <option value="in_progress">В работе</option>
  <option value="completed">Завершена</option>
</select>
```
- Выбор другого пункта немедленно вызывает `onStatusChange`, отправляющий сетевой запрос `PUT /api/tasks/:id` на сервер. Интерфейс мгновенно реагирует на выбор пользователя.

---

## 2. Форма создания задачи: TaskForm.tsx

Компонент [TaskForm.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/TaskForm.tsx) представляет собой управляемую форму (Controlled Form) с валидацией на стороне клиента.

### 2.1. Локальные состояния формы
```typescript
const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [status, setStatus] = useState<TaskStatus>('pending');
const [dueDate, setDueDate] = useState('');
const [file, setFile] = useState<File | null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);
const [validationError, setValidationError] = useState('');
```
Каждое поле формы синхронизировано со своим `useState`. Это обеспечивает абсолютный контроль над содержимым полей.

### 2.2. Валидация и упаковка в FormData
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!title.trim()) {
    setValidationError('Название задачи обязательно для заполнения');
    return;
  }

  setValidationError('');
  setIsSubmitting(true);

  try {
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('status', status);
    if (dueDate) {
      formData.append('dueDate', dueDate);
    }
    if (file) {
      formData.append('attachment', file);
    }

    await onTaskCreated(formData);
    setTitle('');
    setDescription('');
    setStatus('pending');
    setDueDate('');
    setFile(null);
    onClose();
  } finally {
    setIsSubmitting(false);
  }
};
```
1. `e.preventDefault()`: Предотвращает стандартное поведение браузера (перезагрузку страницы с отправкой формы).
2. Валидация: Проверяется наличие непробельных символов в заголовке. Если заголовок пуст, выводится предупреждение, а отправка блокируется.
3. `setIsSubmitting(true)`: Блокирует кнопку отправки и выводит индикатор «Сохранение...», предотвращая повторные случайные клики (Double Submission).
4. `new FormData()`: Данные упаковываются в бинарный контейнер.
5. После успешного создания поля сбрасываются в исходные значения, а форма плавно закрывается вызовом `onClose()`.

---

## 3. Сетка KPI-метрик: MetricsGrid.tsx

Компонент [MetricsGrid.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/MetricsGrid.tsx) отображает аналитику верхнего уровня:

```typescript
export const MetricsGrid: React.FC<MetricsGridProps> = ({ stats, onSelectFilter }) => {
  return (
    <section className="metrics-grid">
      <div className="metric-card" onClick={() => onSelectFilter('all')} role="button" tabIndex={0}>
        <span className="metric-label">Всего задач</span>
        <span className="metric-value">{stats.total}</span>
      </div>
      ...
      {stats.overdue > 0 && (
        <div className="metric-card metric-overdue">
          <span className="metric-label">Просрочено</span>
          <span className="metric-value">{stats.overdue}</span>
        </div>
      )}
    </section>
  );
};
```
- Карточки метрик интерактивны: клик по карточке вызывает `onSelectFilter(...)`, что мгновенно переключает фильтр в основном списке задач.
- Карточка «Просрочено» рендерится условно (`stats.overdue > 0`): если просроченных задач нет, карточка скрывается, не загромождая рабочее пространство.

---

## 4. Панель фильтров: FilterNav.tsx

Компонент [FilterNav.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/FilterNav.tsx) представляет собой строку табов-переключателей («пилюль»):
- «Все задачи», «Ожидают», «В работе», «Завершены».
- Каждая кнопка содержит числовой бейдж с количеством задач в данной категории.
- Активная кнопка подсвечивается стилем `active`, информируя пользователя о текущем режиме просмотра.

---

## 5. Шапка приложения: Header.tsx

Компонент [Header.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/Header.tsx) содержит:
- Семантический логотип TaskFlow SPA с векторной иконкой.
- Информационную подпись с указанием стека (React + Express + PostgreSQL).
- Главную кнопку управления `onToggleForm`: текст кнопки динамически переключается между «Новая задача» и «Скрыть форму».

---

## 6. Компонент всплывающих уведомлений: Notification.tsx

Компонент [Notification.tsx](file:///d:/SPP/7sem/SPP/lab2/src/client/src/components/Notification.tsx) обеспечивает обратную связь с пользователем:
- Поддерживает два типа уведомлений: `'success'` (зеленый фон с иконкой галочки) и `'error'` (красный фон с иконкой восклицательного знака).
- Содержит кнопку ручного закрытия `&times;`.
- Снабжен семантическим атрибутом `role="alert"` для экранных дикторов (Accessibility / a11y).
