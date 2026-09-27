# Разбор файла: src/views/index.ejs

**Путь к файлу**: [src/views/index.ejs](file:///d:/SPP/7sem/SPP/src/views/index.ejs)  
**Роль в архитектуре**: Главный шаблон серверного рендеринга (Server-Side Rendering Template), сборка пользовательского интерфейса, интерактивные HTML-формы, динамические бейджи и визуализация метрик.

---

## 1. Концептуальное и архитектурное назначение

Файл [src/views/index.ejs](file:///d:/SPP/7sem/SPP/src/views/index.ejs) является шаблоном для движка EJS (Embedded JavaScript). При вызове `res.render('index', data)` в контроллере движок компилирует этот шаблон в оптимизированную JavaScript-функцию, подставляет переданные переменные и возвращает браузеру готовый монолитный HTML-документ со статусом `200 OK`.

Ключевые функциональные зоны шаблона:
1. **Блок уведомлений (Flash Alerts)**: динамический показ сообщений об успешных операциях или ошибках валидации.
2. **Дашборд метрик (Metrics Grid)**: карточки счетчиков задач по статусам и просроченным дедлайнам.
3. **Форма создания задачи (Multipart Form)**: создание задачи с поддержкой дедлайна, описания и одновременной загрузки файла.
4. **Панель фильтрации (Filter Navigation)**: переключение списков («Все», «Ожидают», «В работе», «Завершены») со счетчиками.
5. **Сетка карточек задач (Tasks Grid)**: список задач с цветовой индикацией просрочки, быстрым изменением статуса, скачиванием и удалением прикрепленных файлов.

---

## 2. Ключевые концепции EJS и веб-безопасности

### 2.1. Разграничение тегов EJS и защита от XSS (Cross-Site Scripting)
В EJS используется три основных типа управляющих тегов:
- `<%= value %>` (**Escaped Output**): Любой вывод экранируется специальными HTML-мнемониками (символы `<`, `>`, `&`, `"`, `'` заменяются на `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#39;`). Если пользователь введет в название задачи вредоносный скрипт `<script>alert(1)</script>`, тег `<%= task.title %>` безопасно выведет его как обычный текст, предотвратив атаку Stored XSS.
- `<%- value %>` (**Unescaped Output**): Выводит сырой HTML без экранирования. Используется **исключительно** для включения доверенных системных фрагментов: `<%- include('partials/header') %>`.
- `<% scriptlet %>` (**Control Flow**): Выполняет инструкции JavaScript (условия `if`, циклы `forEach`) без прямого вывода в поток разметки.

### 2.2. Сохранение контекста фильтрации через Hidden Inputs
Когда пользователь находится на вкладке фильтра (например, `/?status=in_progress`) и создает задачу, удаляет ее или меняет статус, приложение обязано вернуть его на ту же вкладку. Каждая форма содержит скрытое поле:
```html
<input type="hidden" name="currentFilter" value="<%= currentFilter %>">
```
Контроллер извлекает это поле и выполняет редирект на `/?status=${filter}`, сохраняя контекст работы пользователя.

### 2.3. Мгновенная отправка форм без JS-фреймворков
Для изменения статуса задачи в карточке используется нативный HTML-обработчик:
```html
<select name="status" onchange="this.form.submit();">
```
При выборе нового пункта в выпадающем списке браузер немедленно отправляет родительскую форму методом POST на сервер, запускает контроллер и перезагружает страницу через PRG. Приложение работает быстро и надежно без подключения мегабайтных клиентских библиотек React или Vue.

---

## 3. Построчный разбор блоков шаблона

### Строки 1–2: Подключение шапки сайта
```html
<%- include('partials/header') %>

<main class="main-content">
  <div class="container">
```
- Подключает внешний компонент шапки [src/views/partials/header.ejs](file:///d:/SPP/7sem/SPP/src/views/partials/header.ejs) и открывает основной семантический контейнер.

### Строки 6–27: Блок Flash-уведомлений (Alerts)
```html
    <% if (error) { %>
      <div class="alert alert-error" role="alert">
        <svg ...></svg>
        <span><%= error %></span>
        <a href="/?status=<%= currentFilter %>" class="alert-close" aria-label="Закрыть">&times;</a>
      </div>
    <% } %>

    <% if (success) { %>
      <div class="alert alert-success" role="alert">
        <svg ...></svg>
        <span><%= success %></span>
        <a href="/?status=<%= currentFilter %>" class="alert-close" aria-label="Закрыть">&times;</a>
      </div>
    <% } %>
```
- Если в контексте рендеринга присутствует переменная `error` или `success`, выводится блок с соответствующей цветовой схемой и иконкой SVG. Кнопка закрытия `&times;` (`×`) очищает query-параметры, возвращаясь на чистый URL фильтра.

### Строки 29–52: Карточки метрик (Metrics Grid)
```html
    <section class="metrics-grid">
      <div class="metric-card">
        <span class="metric-label">Всего задач</span>
        <span class="metric-value"><%= stats.total %></span>
      </div>
      <div class="metric-card metric-pending"> ... </div>
      <div class="metric-card metric-progress"> ... </div>
      <div class="metric-card metric-completed"> ... </div>
      <% if (stats.overdue > 0) { %>
        <div class="metric-card metric-overdue">
          <span class="metric-label">Просрочено</span>
          <span class="metric-value"><%= stats.overdue %></span>
        </div>
      <% } %>
    </section>
```
- Выводит данные объекта `TaskStats`. Карточка «Просрочено» отображается только при наличии хотя бы одной просроченной задачи (`stats.overdue > 0`), акцентируя внимание на проблеме.

### Строки 54–110: Форма создания новой задачи
```html
    <section id="new-task-form" class="panel new-task-panel">
      <div class="panel-header">
        <h2 class="panel-title">Создание новой задачи</h2>
      </div>
      <form action="/tasks" method="POST" enctype="multipart/form-data" class="task-form">
        <input type="hidden" name="currentFilter" value="<%= currentFilter %>">
        ...
        <input type="text" id="task-title" name="title" required placeholder="..." class="form-input">
        ...
        <select id="task-status" name="status" class="form-select">...</select>
        ...
        <input type="date" id="task-due-date" name="dueDate" class="form-input">
        ...
        <textarea id="task-description" name="description" rows="2" class="form-textarea"></textarea>
        ...
        <input type="file" id="task-attachment" name="attachment" class="form-file-input">
        ...
        <button type="submit" class="btn btn-primary btn-submit">Создать задачу</button>
      </form>
    </section>
```
- `enctype="multipart/form-data"`: обязательный атрибут для отправки бинарных файлов на сервер через Multer.
- `id="new-task-form"`: якорная ссылка для кнопки «Новая задача» в шапке сайта.
- Поле `title` помечено атрибутом `required` для валидации на стороне клиента.

### Строки 112–131: Навигация и фильтры
```html
    <nav class="filter-nav" aria-label="Фильтрация задач">
      <div class="filter-pills">
        <a href="/?status=all" class="filter-pill <%= currentFilter === 'all' ? 'active' : '' %>">
          Все задачи
          <span class="count-badge"><%= stats.total %></span>
        </a>
        ...
      </div>
    </nav>
```
- Каждая кнопка фильтра – это гиперссылка `<a>` с параметром `?status=...`. Тернарный оператор `<%= currentFilter === 'all' ? 'active' : '' %>` динамически добавляет CSS-класс активного фильтра. В бейджах отображаются точные счетчики.

### Строки 133–149: Состояние отсутствия задач (Empty State)
```html
      <% if (tasks.length === 0) { %>
        <div class="empty-state">
          <div class="empty-icon">...</div>
          <h3>Задач не найдено</h3>
          <p>В выбранной категории «<%= currentFilter %>» нет активных задач...</p>
          <a href="/?status=all" class="btn btn-secondary">Сбросить фильтр</a>
        </div>
```
- Дружелюбный интерфейс при пустом списке с возможностью сброса фильтра в один клик.

### Строки 150–246: Сетка задач и карточка задачи
```html
        <div class="tasks-grid">
          <% tasks.forEach(task => { %>
            <% const taskOverdue = helpers.isOverdue(task.dueDate, task.status); %>
            <article class="task-card status-<%= task.status %> <%= taskOverdue ? 'is-overdue' : '' %>" id="task-<%= task.id %>">
```
- **Строка 152**: Вычисляет статус просрочки через переданную вспомогательную функцию `helpers.isOverdue`.
- **Строка 153**: Добавляет CSS-классы `status-<status>` и `is-overdue` (окрашивающий рамку карточки в контрастный красный цвет).
- **Строки 167–175**: Форма удаления задачи с нативным диалогом подтверждения `onsubmit="return confirm('Вы действительно хотите удалить эту задачу?');"`.
- **Строки 179–194**: Заголовок задачи, описание и блок дедлайна с форматированием даты `helpers.formatDate(task.dueDate)` (преобразование `YYYY-MM-DD` в привычный формат `DD.MM.YYYY`).
- **Строки 196–228**: Блок вложений:
  - Список прикрепленных файлов со ссылкой на скачивание `/tasks/:id/attachments/:attId/download` и кнопкой удаления каждого файла.
  - Форма быстрой загрузки файла к существующей задаче (`<input type="file" onchange="this.form.submit();">`).
- **Строки 231–241**: Футер карточки с формой мгновенной смены статуса.

### Строки 250–253: Подключение подвала
```html
  </div>
</main>

<%- include('partials/footer') %>
```
- Закрывает контейнеры и подключает общий подвал [src/views/partials/footer.ejs](file:///d:/SPP/7sem/SPP/src/views/partials/footer.ejs).
