# Разбор файла: src/public/css/style.css

**Путь к файлу**: [src/public/css/style.css](file:///d:/SPP/7sem/SPP/src/public/css/style.css)  
**Роль в архитектуре**: Главная таблица стилей интерфейса (Presentation / Styling Layer), дизайн-токены (CSS Custom Properties), блочная модель, адаптивные сетки Flexbox и CSS Grid, микро-взаимодействия и обеспечение контрастности WCAG AA.

---

## 1. Концептуальное и эстетическое назначение

Файл [src/public/css/style.css](file:///d:/SPP/7sem/SPP/src/public/css/style.css) отвечает за визуальный облик приложения. Он построен на принципах **Human-Crafted интерфейса и Anti-AI-Slop стандартов**:
1. **Отказ от клише**: в стилях отсутствуют неоновые фиолетовые градиенты, псевдо-стеклянные размытия (`backdrop-blur`) и гигантские нефункциональные скругления.
2. **Сдержанная техническая палитра**: интерфейс выполнен в строгой темной теме в стиле GitHub Dark / Linear (глубокий сланцевый фон `#0d1117`, контрастные карточки `#161b22`, четкие границы `#30363d`).
3. **Строгая система дизайн-токенов (`:root`)**: все цвета, отступы, тени и радиусы вынесены в CSS-переменные, что гарантирует визуальную гармонию и легкую смену темы.
4. **Чистый CSS без фреймворков**: нулевая зависимость от тяжелых библиотек вроде Bootstrap или Tailwind, что дает максимальную скорость загрузки и полный контроль над каждым пикселем.

---

## 2. Ключевые концепции CSS, использованные в файле

### 2.1. Переменные CSS (Custom Properties) в селекторе `:root`
Псевдокласс `:root` соответствует элементу `<html>` и обладает наивысшей областью видимости. Объявленные в нем переменные (например, `--bg-app`, `--primary`) доступны во всем документе через функцию `var(--name)`. Это позволяет менять акцентный цвет или тему во всем приложении изменением одного значения.

### 2.2. Универсальный сброс и блочная модель `border-box`
По умолчанию в браузерах используется модель `content-box`, где отступы (`padding`) и рамки (`border`) прибавляются к заданной ширине элемента, вызывая непредвиденное вылезание блоков за экран.
Правило:
```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```
заставляет браузер включать `padding` и `border` **внутрь** указанной ширины и высоты, делая верстку предсказуемой.

### 2.3. Паттерн «Прижатый подвал» (Sticky Footer через Flexbox)
Если на странице мало задач, подвал сайта может некрасиво повиснуть посреди экрана. В файле применен эталонный прием:
```css
body {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.main-content {
  flex: 1; /* Растягивается и выталкивает футер вниз */
}
```

### 2.4. Адаптивные сетки без медиа-запросов (`repeat(auto-fit, minmax(...))`)
Для блока метрик и списка задач используется CSS Grid с интеллектуальным расчетом колонок:
```css
grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
```
Браузер сам рассчитывает количество колонок: если экран широкий – карточки встают в 5 колонок; если экран уменьшается – карточки автоматически переносятся на новую строку без единой строчки JavaScript.

---

## 3. Пошаговый анатомический разбор секций файла

### Секция 1: Дизайн-токены (Строки 1–41)
```css
:root {
  --bg-app: #0d1117;              /* Основной цвет фона страницы */
  --bg-surface: #161b22;          /* Фон панелей, шапки и карточек */
  --bg-surface-elevated: #21262d; /* Фон приподнятых элементов и кнопок */
  
  --border-subtle: #30363d;       /* Деликатная граница блоков */
  --border-focus: #388bfd;        /* Синяя подсветка активных инпутов */

  --text-primary: #f0f6fc;        /* Основной контрастный текст */
  --text-secondary: #8b949e;      /* Второстепенный текст подписей */
  --text-muted: #6e7681;          /* Приглушенный текст пояснений */
  
  --primary: #238636;             /* Изумрудный цвет главных кнопок */
  --accent: #1f6feb;              /* Синий акцент для ссылок */
  
  /* Статусные цвета с полупрозрачными фонами (15% прозрачности): */
  --status-pending: #d29922;      /* Янтарный: Ожидает */
  --status-progress: #58a6ff;     /* Голубой: В работе */
  --status-completed: #3fb950;    /* Зеленый: Завершена */
  --status-overdue: #f85149;      /* Красный: Просрочено */

  /* Функциональные радиусы скругления (без гигантских 3xl): */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;

  --transition-fast: 0.15s ease-out; /* Быстрая отзывчивая анимация */
}
```

### Секция 2: Базовые стили и контейнер (Строки 43–67)
```css
.container {
  width: 100%;
  max-width: 1140px;
  margin-left: auto;
  margin-right: auto;
  padding-left: 20px;
  padding-right: 20px;
}
```
- Ограничивает контент по ширине 1140px и центрирует его на больших мониторах (`margin: 0 auto`), сохраняя безопасные отступы по бокам в 20px.

### Секция 3: Липкая шапка (Строки 69–112)
```css
.app-header {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 14px 0;
}
```
- `position: sticky; top: 0; z-index: 50;` – при прокрутке длинного списка задач шапка остается зафиксированной вверху экрана.
- `.header-content` использует `display: flex; justify-content: space-between;` для растаскивания логотипа влево, а кнопки «Новая задача» – вправо.

### Секция 4: Плашки уведомлений Flash Alerts (Строки 114–150)
```css
.alert-error {
  background: var(--status-overdue-bg);
  border: 1px solid var(--status-overdue);
  color: #ff7b72;
}

.alert-success {
  background: var(--status-completed-bg);
  border: 1px solid var(--status-completed);
  color: #7ee787;
}
```
- Применяют мягкий полупрозрачный фон с четкой рамкой соответствующего статусного цвета и крестиком закрытия справа (`margin-left: auto`).

### Секция 5: Карточки метрик (Строки 156–193)
```css
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.metric-value {
  font-family: var(--font-mono); /* Моноширинный шрифт для ровных цифр */
  font-size: 1.6rem;
  font-weight: 700;
}
```
- Карточки автоматически подстраиваются под ширину экрана. Цифры оформлены моноширинным шрифтом, чтобы числа разной разрядности не «скакали» визуально.

### Секция 6: Панель и форма создания задачи (Строки 194–305)
```css
.form-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap; /* Перенос на новую строку при сжатии */
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--border-focus); /* Акцентная синяя рамка при клике */
}
```
- Псевдоэлемент `::file-selector-button` (строки 281–296) стилизует нативную уродливую серую кнопку выбора файла в браузере под общий строгий темный стиль приложения.

### Секция 7: Кнопки (Строки 308–365)
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.btn-primary {
  background: var(--primary); /* Изумрудный цвет #238636 */
}
.btn-primary:hover {
  background: var(--primary-hover); /* Осветление при наведении */
}
```
- Кнопки используют `inline-flex` для идеального вертикального выравнивания SVG-иконок и текста. Быстрый переход `0.15s` дает моментальный тактильный отклик на действия пользователя.

### Секция 8: Таблетки фильтрации (Строки 367–414)
```css
.filter-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto; /* Горизонтальный скролл на мобилках */
}

.filter-pill.active {
  background: var(--bg-surface-elevated);
  border-color: var(--border-focus);
}
```
- На узких смартфонах фильтры не ломают верстку, а мягко прокручиваются пальцем по горизонтали благодаря `overflow-x: auto`.

### Секция 9: Карточки задач и цветовое кодирование (Строки 416–521)
```css
.task-card.status-pending { border-left: 3px solid var(--status-pending); }
.task-card.status-in_progress { border-left: 3px solid var(--status-progress); }
.task-card.status-completed { border-left: 3px solid var(--status-completed); }
.task-card.is-overdue { border-left: 3px solid var(--status-overdue); }
```
- **Главный визуальный маркер задачи**: левая цветная рамка толщиной 3px. Пользователь мгновенно сканирует глазами список задач по цветам: желтый – ждет, синий – в работе, зеленый – готово, красный – просрочено.

### Секция 10: Блок вложений и скрытый инпут загрузки (Строки 523–625)
```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
```
- **Паттерн доступности (Accessibility)**: чтобы сделать аккуратную ссылку «+ Прикрепить файл», стандартный инпут `<input type="file">` не скрывается через `display: none` (это ломает доступность для скринридеров), а ужимается в 1px с помощью класса `.visually-hidden`. Клик по стилизованному `<label>` автоматически открывает окно выбора файла.

### Секция 11: Подвал и мобильная адаптивность (Строки 688–738)
```css
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .form-row {
    flex-direction: column;
  }

  .tasks-grid {
    grid-template-columns: 1fr; /* 1 колонка на экранах планшетов и смартфонов */
  }
}
```
- При ширине экрана меньше 768px (планшеты и мобильные устройства) карточки выстраиваются в одну вертикальную колонку, а строки формы раскладываются друг под другом для комфортного ввода пальцем.
