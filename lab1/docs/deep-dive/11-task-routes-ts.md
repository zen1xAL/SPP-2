# Разбор файла: src/routes/task-routes.ts

**Путь к файлу**: [src/routes/task-routes.ts](file:///d:/SPP/7sem/SPP/src/routes/task-routes.ts)  
**Роль в архитектуре**: Таблица маршрутизации HTTP (Routing Layer), сопоставление сетевых URL-эндпоинтов, внедрение middleware загрузки файлов и связывание с методами контроллера.

---

## 1. Концептуальное и архитектурное назначение

Файл [src/routes/task-routes.ts](file:///d:/SPP/7sem/SPP/src/routes/task-routes.ts) определяет открытый HTTP-интерфейс веб-приложения:
1. **Изолированный мини-маршрутизатор (Express Router)**: использование фабричной функции `createTaskRouter(controller)` позволяет создавать роутер с внедренным контроллером, не создавая жестких глобальных синглтонов.
2. **Ограничения HTML5-форм и RPC-стиль маршрутов**: стандартные HTML-формы в спецификации W3C поддерживают только методы `GET` и `POST` (методы `PUT`, `PATCH` и `DELETE` в формах не поддерживаются браузерами). Поэтому операции обновления статуса и удаления оформлены как POST-маршруты (`/tasks/:id/status`, `/tasks/:id/delete`), что является эталоном для Server-Side Rendering архитектур.
3. **Точечное подключение middleware**: middleware `upload.single('attachment')` подключается исключительно к тем маршрутам, где действительно ожидается файл, что исключает накладные расходы на чтение multipart-потоков для текстовых запросов.

---

## 2. Ключевые концепции Express и адресации

### 2.1. Параметризованные сегменты URL (`:id`, `:attachmentId`)
Express компилирует пути маршрутов во внутренние регулярные выражения (библиотека `path-to-regexp`). Сегменты, начинающиеся с двоеточия (`:id`), захватывают значение из URL и помещают его в словарь `req.params`. В маршруте `/tasks/:id/attachments/:attachmentId/download` движок автоматически извлекает оба идентификатора.

### 2.2. Порядок выполнения middleware в цепочке роута
Когда запрос приходит на маршрут:
```typescript
router.post('/tasks', upload.single('attachment'), controller.create);
```
Сначала управление получает `upload.single('attachment')`. Если в запросе передано тело `multipart/form-data`, Multer считывает файл, сохраняет его на диск и помещает объект файла в `req.file`, а текстовые поля формы – в `req.body`. Только после успешного завершения Multer вызывает свой внутренний `next()` и управление передается обработчику `controller.create`.

---

## 3. Построчный разбор кода

### Строки 1–3: Импорты
```typescript
import { Router } from 'express';
import type { TaskController } from '../controllers/task-controller.js';
import { upload } from '../middleware/upload.js';
```
- Импортирует фабрику `Router` из Express, тип `TaskController` и настроенный экземпляр `upload` из [src/middleware/upload.ts](file:///d:/SPP/7sem/SPP/src/middleware/upload.ts).

### Строки 5–7: Фабричная функция `createTaskRouter`
```typescript
export function createTaskRouter(controller: TaskController): Router {
  const router = Router();
```
- Создает новый изолированный инстанс `Router`. Фабрика принимает готовый контроллер, реализуя принцип инверсии управления (IoC).

### Строка 8: Отображение главной страницы
```typescript
  router.get('/', controller.index);
```
- Метод `GET /`: отдает сгенерированную HTML-страницу со списком задач, статистикой и формами.

### Строка 9: Создание новой задачи с возможным файлом
```typescript
  router.post('/tasks', upload.single('attachment'), controller.create);
```
- Метод `POST /tasks`: принимает multipart-форму. `upload.single('attachment')` перехватывает файл из инпута с именем `name="attachment"`.

### Строка 10: Изменение статуса задачи
```typescript
  router.post('/tasks/:id/status', controller.updateStatus);
```
- Метод `POST /tasks/:id/status`: вызывается при изменении выпадающего списка статуса в карточке задачи.

### Строка 11: Удаление задачи
```typescript
  router.post('/tasks/:id/delete', controller.delete);
```
- Метод `POST /tasks/:id/delete`: удаляет задачу и все прикрепленные к ней файлы.

### Строка 12: Добавление файла к существующей задаче
```typescript
  router.post('/tasks/:id/attachments', upload.single('attachment'), controller.addAttachment);
```
- Метод `POST /tasks/:id/attachments`: принимает отдельный файл через быструю кнопку прикрепления в карточке задачи.

### Строка 13: Удаление файла из задачи
```typescript
  router.post('/tasks/:id/attachments/:attachmentId/delete', controller.deleteAttachment);
```
- Метод `POST /tasks/:id/attachments/:attachmentId/delete`: удаляет конкретное вложение по двум составным параметрам пути.

### Строка 14: Скачивание файла вложения
```typescript
  router.get('/tasks/:id/attachments/:attachmentId/download', controller.downloadAttachment);
```
- Метод `GET /tasks/:id/attachments/:attachmentId/download`: отдает бинарный поток файла клиенту.

### Строки 16–17: Возврат роутера
```typescript
  return router;
}
```
- Возвращает сконфигурированный экземпляр `Router` для подключения в [src/app.ts](file:///d:/SPP/7sem/SPP/src/app.ts).
