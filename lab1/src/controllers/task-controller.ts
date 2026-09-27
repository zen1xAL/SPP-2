import { promises as fs } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import type { TaskFilter, TaskStatus } from '../domain/models/task.js';
import { formatFileSize, isOverdue, isValidFilter, isValidStatus } from '../domain/models/task.js';
import { fileToAttachment, getUploadPath } from '../middleware/upload.js';
import type { TaskService } from '../services/task-service.js';

function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export class TaskController {
  constructor(private readonly taskService: TaskService) {}

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
}
