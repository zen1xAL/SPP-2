# Разбор файлов: src/views/partials/header.ejs и footer.ejs

**Пути к файлам**:
- [src/views/partials/header.ejs](file:///d:/SPP/7sem/SPP/src/views/partials/header.ejs)
- [src/views/partials/footer.ejs](file:///d:/SPP/7sem/SPP/src/views/partials/footer.ejs)  
**Роль в архитектуре**: Композиционные фрагменты разметки (Partials / Layout Components), каркас HTML5-документа, метаданные поисковой оптимизации (SEO), преконнект веб-шрифтов и глобальные шапка и подвал.

---

## 1. Концептуальное и архитектурное назначение

В Server-Side Rendering приложениях дублирование тегов `<!DOCTYPE html>`, `<head>`, общих шапок и подвалов на каждой странице приводит к нарушению принципа DRY (Don't Repeat Yourself).
Шаблонизатор EJS решает это через паттерн **Partials (Фрагменты)**:
- [src/views/partials/header.ejs](file:///d:/SPP/7sem/SPP/src/views/partials/header.ejs) открывает HTML-документ, определяет кодировку, фавиконы, внешние шрифты и отрисовывает брендированную верхнюю панель навигации.
- [src/views/partials/footer.ejs](file:///d:/SPP/7sem/SPP/src/views/partials/footer.ejs) закрывает структуру, выводит динамический год копирайта, бейджи технологического стека и закрывающие теги `</body>` и `</html>`.

---

## 2. Ключевые оптимизации производительности и веб-стандарты

### 2.1. Оптимизация загрузки шрифтов (Preconnect Resource Hints)
В строках 8–9 шапки используются директивы:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```
Обычно браузер запрашивает шрифт только после того, как скачает и распарсит CSS-стили. Директива `rel="preconnect"` приказывает браузеру немедленно выполнить DNS-запрос, TCP-рукопожатие и согласование TLS-шифрования с серверами Google Fonts еще до получения ответа стилей. Это экономит до 200–300 мс на этапе начальной загрузки страницы.

### 2.2. Мобильная адаптивность (Viewport Meta Tag)
Тег `<meta name="viewport" content="width=device-width, initial-scale=1.0">` сообщает мобильным браузерам (Safari iOS, Chrome Android) рендерить страницу в масштабе 1:1 в соответствии с физической шириной экрана устройства, предотвращая автоматическое отдаление (зум) страницы.

---

## 3. Построчный разбор header.ejs

```html
1:  <!DOCTYPE html>
2:  <html lang="ru">
3:  <head>
4:    <meta charset="UTF-8">
5:    <meta name="viewport" content="width=device-width, initial-scale=1.0">
6:    <meta name="description" content="Серверное веб-приложение для управления задачами со статусами, сроками выполнения и прикреплением файлов.">
7:    <title><%= title %></title>
8:    <link rel="preconnect" href="https://fonts.googleapis.com">
9:    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
10:   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
11:   <link rel="stylesheet" href="/public/css/style.css">
12: </head>
13: <body>
14:   <header class="app-header">
15:     <div class="container header-content">
16:       <div class="brand">
17:         <div class="brand-icon">
18:           <svg ...> ... </svg>
19:         </div>
20:         <div>
21:           <h1 class="brand-title">TaskFlow SSR</h1>
22:           <p class="brand-subtitle">Лабораторная работа №1 (СПП, 7 семестр)</p>
23:         </div>
24:       </div>
25:       <div class="header-actions">
26:         <a href="#new-task-form" class="btn btn-primary">
27:           <svg ...> ... </svg>
28:           Новая задача
29:         </a>
30:       </div>
31:     </div>
32:   </header>
```
- **Строки 1–2**: Объявление типа документа HTML5 и указание языка разметки (`lang="ru"`).
- **Строка 4**: Кодировка UTF-8 для корректной поддержки кириллицы.
- **Строка 6**: Мета-описание страницы для поисковых систем и соцсетей.
- **Строка 7**: Динамический заголовок страницы `<%= title %>`, передаваемый из контроллера (`'Управление задачами (SSR)'`).
- **Строка 10**: Подключение современного гротескного шрифта Inter с вариативными начертаниями 400 (Regular), 500 (Medium), 600 (Semi-Bold) и 700 (Bold).
- **Строка 11**: Подключение локальной таблицы стилей через статический маршрут `/public/css/style.css`.
- **Строки 14–38**: Семантический блок `<header>`:
  - Логотип с векторной SVG-иконкой задачи.
  - Главный заголовок первого уровня `<h1>` (строго один на страницу в соответствии со стандартами доступности и SEO).
  - Кнопка «Новая задача» с плавной якорной прокруткой к форме создания (`href="#new-task-form"`).

---

## 4. Построчный разбор footer.ejs

```html
1:   <footer class="app-footer">
2:     <div class="container footer-content">
3:       <p>&copy; <%= new Date().getFullYear() %> TaskFlow SSR &bull; Express + EJS + Clean Architecture</p>
4:       <div class="footer-badges">
5:         <span class="tech-badge">Node.js 24</span>
6:         <span class="tech-badge">Strict TypeScript</span>
7:         <span class="tech-badge">PRG Pattern</span>
8:       </div>
9:     </div>
10:  </footer>
11: </body>
12: </html>
```
- **Строка 1**: Семантический тег подвала страницы `<footer>`.
- **Строка 3**: Динамический год копирайта `<%= new Date().getFullYear() %>` вычисляется сервером на лету в момент рендеринга, исключая устаревание года в футере.
- **Строки 4–8**: Инженерные бейджи, декларирующие используемые стандарты: версия платформы, строгий режим типизации и архитектурный паттерн Post-Redirect-Get.
- **Строки 11–12**: Закрытие тегов тела и документа.
