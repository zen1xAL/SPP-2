# Разбор файла: src/controllers/task-controller.ts

**Путь к файлу**: [src/controllers/task-controller.ts](file:///d:/SPP/7sem/SPP/src/controllers/task-controller.ts)  
**Роль в архитектуре**: Слой представления и адаптеров контроллеров (Presentation / Controller Layer), обработка входящих HTTP-запросов, реализация паттерна Post-Redirect-Get (PRG) и отдача серверных EJS-шаблонов.

---

## 1. Концептуальное и архитектурное назначение

Класс `TaskController` в [src/controllers/task-controller.ts](file:///d:/SPP/7sem/SPP/src/controllers/task-controller.ts) выступает посредником между сетевым протоколом HTTP и сервисом приложения:
1. **Маршалинг и валидация HTTP-параметров**: извлечение данных из `req.body` (поля HTML-форм), `req.params` (динамические сегменты URL) и `req.query` (параметры строки запроса), защита от передачи массивов вместо строк через функцию `getParam`.
2. **Реализация паттерна Post-Redirect-Get (PRG)**: после любой мутирующей операции (создание, смена статуса, удаление, прикрепление файла) клиент перенаправляется ответом `303 See Other` обратно на GET-маршрут. Это устраняет фундаментальную проблему случайной повторной отправки форм при нажатии `F5` (перезагрузка страницы) в браузере.
3. **Очистка временных файлов при ошибках**: если валидация полей формы на стороне сервера провалилась, контроллер обязан удалить загруженный Multer файл из временного хранилища до отправки редиректа.
4. **Организация скачивания бинарных вложений**: вызов системного метода Express `res.download()`, устанавливающего правильные заголовки `Content-Disposition` и `Content-Type`.

---

## 2. Ключевые паттерны и особенности языка

### 2.1. Стрелочные функции в свойствах класса (Lexical `this` Binding)
При регистрации методов контроллера в роутере Express:
```typescript
router.get('/', controller.index);
```
Если метод `index` объявлен как стандартный метод прототипа (`async index(req, res)`), то при вызове внутри Express ссылка на контекст `this` будет утеряна (`undefined`), что приведет к ошибке `TypeError: Cannot read properties of undefined (reading 'taskService')`.
В контроллере все методы объявлены как **стрелочные свойства экземпляра**:
```typescript
index = async (req: Request, res: Response, next: NextFunction): Promise<void> => { ... };
```
Стрелочная функция лексически захватывает `this` в момент создания экземпляра класса в конструкторе, навсегда связывая метод со своим объектом контроллера без необходимости ручного вызова `.bind(this)`.

### 2.2. Статус 303 See Other в паттерне PRG
Стандарт HTTP/1.1 регламентирует:
- Статус `302 Found` исторически мог приводить к повторным POST-запросам в некоторых старых клиентах.
- Статус `303 See Other` явно приказывает браузеру выполнить переход на указанный URL строго методом `GET`, независимо от метода исходного запроса.

---

## 3. Построчный разбор кода

### Строки 1–7: Импорты
```typescript
import { promises as fs } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import type { TaskFilter, TaskStatus } from '../domain/models/task.js';
import { formatFileSize, isOverdue, isValidFilter, isValidStatus } from '../domain/models/task.js';
import { fileToAttachment, getUploadPath } from '../middleware/upload.js';
import type { TaskService } from '../services/task-service.js';
```
- Импорт файловой системы `fs`, типов Express, доменных моделей и валидаторов.

### Строки 8–13: Вспомогательная функция `getParam`
```typescript
function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}
```
- Защита от атаки HTTP Parameter Pollution: если параметр маршрута или запроса передан несколько раз и Express распарсил его как массив строк, функция безопасно возвращает первый элемент либо пустую строку.

### Строки 15–16: Определение класса и внедрение зависимостей
```typescript
export class TaskController {
  constructor(private readonly taskService: TaskService) {}
```
- Контроллер принимает экземпляр `TaskService` через конструктор.

### Строки 18–48: Метод отображения главной страницы `index`
```typescript
  index = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawFilter = req.query.status as string | undefined;
      const filter: TaskFilter = rawFilter && isValidFilter(rawFilter) ? rawFilter : 'all';

      const error = (req.query.error as string | undefined) ?? null;
      const success = (req.query.success as string | undefined) ?? null;

      const { tasks, stats } = await this.taskService.getTasks(filter);

      res.render('index', {
        title: 'Управление задачами (SSR)',
        tasks,
        stats,
        currentFilter: filter,
        error,
        success,
        helpers: {
          isOverdue,
          formatFileSize,
          formatDate: (dateStr: string | null): string => {
            if (!dateStr) return 'Не указан';
            const [year, month, day] = dateStr.slice(0, 10).split('-');
            return `${day}.${month}.${year}`;
          }
        }
      });
    } catch (err) {
      next(err);
    }
  };
```
- **Строки 20–21**: Извлекает и валидирует query-параметр `status`. Если передан недопустимый статус, подставляется безопасный фильтр `'all'`.
- **Строки 23–24**: Считывает flash-сообщения об ошибках или успехе из URL-параметров.
- **Строка 26**: Запрашивает отфильтрованный список задач и агрегированную статистику из сервиса.
- **Строки 28–44**: Рендерит шаблон `index.ejs`, пробрасывая в контекст данные и хелперы форматирования дат (`formatDate`) и размеров файлов.
- **Строки 45–47**: Любые ошибки передаются в глобальный middleware через `next(err)`.

### Строки 50–83: Создание новой задачи `create`
```typescript
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawFilter = req.body.currentFilter as string | undefined;
    const filter = rawFilter && isValidFilter(rawFilter) ? rawFilter : 'all';

    try {
      const { title, description, status, dueDate } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        res.status(400);
        res.redirect(`/?status=${filter}&error=${encodeURIComponent('Название задачи не может быть пустым')}`);
        return;
      }

      const attachment = req.file ? fileToAttachment(req.file) : undefined;

      await this.taskService.createTask({
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        status: status && isValidStatus(status) ? (status as TaskStatus) : 'pending',
        dueDate: typeof dueDate === 'string' && dueDate.trim() ? dueDate.trim() : null,
        attachment
      });

      res.redirect(303, `/?status=${filter}&success=${encodeURIComponent('Задача успешно создана!')}`);
    } catch (err) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      next(err);
    }
  };
```
- **Строки 51–52**: Сохраняет текущее состояние фильтра для сохранения контекста пользователя после создания задачи.
- **Строки 57–64**: Если заголовок задачи пустой – загруженный файл немедленно удаляется с диска (`fs.unlink`), выставляется статус 400 и производится редирект с сообщением об ошибке.
- **Строка 66**: Преобразует `req.file` в сущность `Attachment`.
- **Строки 68–74**: Вызывает создание задачи в сервисе.
- **Строка 76**: Выполняет PRG-редирект с кодом `303`.

### Строки 85–102: Обновление статуса `updateStatus`
```typescript
  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const { status, currentFilter } = req.body;
      const filter = currentFilter && isValidFilter(currentFilter) ? currentFilter : 'all';

      if (!isValidStatus(status)) {
        res.redirect(303, `/?status=${filter}&error=${encodeURIComponent('Недопустимый статус задачи')}`);
        return;
      }

      await this.taskService.updateTaskStatus(id, status);

      res.redirect(303, `/?status=${filter}&success=${encodeURIComponent('Статус задачи обновлен')}`);
    } catch (err) {
      next(err);
    }
  };
```
- Извлекает `id` задачи и целевой статус из формы, валидирует его и перенаправляет обратно на страницу с сохранением фильтра.

### Строки 104–120: Удаление задачи `delete`
```typescript
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const { currentFilter } = req.body;
      const filter = currentFilter && isValidFilter(currentFilter) ? currentFilter : 'all';

      const deleted = await this.taskService.deleteTask(id);
      if (!deleted) {
        res.redirect(303, `/?status=${filter}&error=${encodeURIComponent('Задача не найдена')}`);
        return;
      }

      res.redirect(303, `/?status=${filter}&success=${encodeURIComponent('Задача удалена')}`);
    } catch (err) {
      next(err);
    }
  };
```
- Вызывает удаление задачи и всех связанных файлов в сервисе, возвращая редирект с уведомлением.

### Строки 122–143: Прикрепление файла к существующей задаче `addAttachment`
```typescript
  addAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = getParam(req.params.id);
    const { currentFilter } = req.body;
    const filter = currentFilter && isValidFilter(currentFilter) ? currentFilter : 'all';

    try {
      if (!req.file) {
        res.redirect(303, `/?status=${filter}&error=${encodeURIComponent('Файл не выбран для загрузки')}`);
        return;
      }

      const attachment = fileToAttachment(req.file);
      await this.taskService.addAttachment(id, attachment);

      res.redirect(303, `/?status=${filter}&success=${encodeURIComponent('Файл успешно прикреплен к задаче')}`);
    } catch (err) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      next(err);
    }
  };
```
- Проверяет наличие загруженного файла (`req.file`), конвертирует его и привязывает к задаче. При ошибках чистит файл на диске.

### Строки 145–158: Удаление вложения `deleteAttachment`
```typescript
  deleteAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const attachmentId = getParam(req.params.attachmentId);
      const { currentFilter } = req.body;
      const filter = currentFilter && isValidFilter(currentFilter) ? currentFilter : 'all';

      await this.taskService.removeAttachment(id, attachmentId);

      res.redirect(303, `/?status=${filter}&success=${encodeURIComponent('Вложение удалено')}`);
    } catch (err) {
      next(err);
    }
  };
```
- Извлекает идентификатор задачи и идентификатор файла, удаляет физический файл и запись.

### Строки 160–184: Скачивание вложения `downloadAttachment`
```typescript
  downloadAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const attachmentId = getParam(req.params.attachmentId);
      const attachment = await this.taskService.getAttachment(id, attachmentId);

      if (!attachment) {
        res.status(404).send('Вложение не найдено');
        return;
      }

      const filePath = getUploadPath(attachment.storedName);

      try {
        await fs.access(filePath);
      } catch {
        res.status(404).send('Физический файл вложения не найден на сервере');
        return;
      }

      res.download(filePath, attachment.originalName);
    } catch (err) {
      next(err);
    }
  };
```
- **Строки 166–169**: Если метаданные файла отсутствуют в задаче, возвращает статус `404 Not Found`.
- **Строки 173–178**: Проверяет физическое наличие файла на диске через `fs.access`. Если файл был случайно удален из файловой системы, отдается понятный ответ 404 без падения сервера.
- **Строка 180**: Метод `res.download(filePath, attachment.originalName)` открывает файловый поток и передает файл клиенту с исходным человекочитаемым именем (например, `отчет.docx`).
