import { promises as fs } from 'node:fs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './db.js';
import { upload, sanitizeFileName, getUploadFilePath, deletePhysicalFile } from './upload.js';

export const apiRouter = Router();

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed']);

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'completed') {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  return due.getTime() < today.getTime();
}

apiRouter.get('/tasks', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawFilter = req.query.status as string | undefined;
    const filter = rawFilter && (rawFilter === 'all' || VALID_STATUSES.has(rawFilter)) ? rawFilter : 'all';

    const result = await pool.query(`
      SELECT 
        t.id, 
        t.title, 
        t.description, 
        t.status, 
        to_char(t.due_date, 'YYYY-MM-DD') as "dueDate", 
        t.created_at as "createdAt", 
        t.updated_at as "updatedAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'originalName', a.original_name,
              'storedName', a.stored_name,
              'mimeType', a.mime_type,
              'size', a.size::text,
              'uploadedAt', a.uploaded_at
            )
          ) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as attachments
      FROM tasks t
      LEFT JOIN attachments a ON t.id = a.task_id
      GROUP BY t.id
      ORDER BY t.created_at DESC;
    `);

    const allTasks = result.rows;

    const stats = {
      total: allTasks.length,
      pending: allTasks.filter((t) => t.status === 'pending').length,
      inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      overdue: allTasks.filter((t) => isOverdue(t.dueDate, t.status)).length
    };

    let tasks = allTasks;
    if (filter !== 'all') {
      tasks = allTasks.filter((t) => t.status === filter);
    }

    res.status(200).json({ tasks, stats });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/tasks/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.title, 
        t.description, 
        t.status, 
        to_char(t.due_date, 'YYYY-MM-DD') as "dueDate", 
        t.created_at as "createdAt", 
        t.updated_at as "updatedAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'originalName', a.original_name,
              'storedName', a.stored_name,
              'mimeType', a.mime_type,
              'size', a.size::text,
              'uploadedAt', a.uploaded_at
            )
          ) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as attachments
      FROM tasks t
      LEFT JOIN attachments a ON t.id = a.task_id
      WHERE t.id = $1
      GROUP BY t.id;
    `, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Задача с указанным идентификатором не найдена' });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/tasks', upload.single('attachment'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { title, description, status, dueDate } = req.body;

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) {
      if (req.file) {
        await deletePhysicalFile(req.file.filename);
      }
      res.status(400).json({ error: 'Название задачи обязательно для заполнения' });
      return;
    }

    const taskStatus = status && VALID_STATUSES.has(status) ? status : 'pending';
    const parsedDueDate = typeof dueDate === 'string' && dueDate.trim() ? dueDate.trim() : null;
    const taskId = uuidv4();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const taskRes = await client.query(`
        INSERT INTO tasks (id, title, description, status, due_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING 
          id, title, description, status, 
          to_char(due_date, 'YYYY-MM-DD') as "dueDate", 
          created_at as "createdAt", 
          updated_at as "updatedAt"
      `, [taskId, trimmedTitle, typeof description === 'string' ? description.trim() : '', taskStatus, parsedDueDate]);

      const attachments: Array<Record<string, unknown>> = [];

      if (req.file) {
        const attachmentId = uuidv4();
        const safeOriginalName = sanitizeFileName(req.file.originalname) || 'attachment';

        const attRes = await client.query(`
          INSERT INTO attachments (id, task_id, original_name, stored_name, mime_type, size)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, original_name as "originalName", stored_name as "storedName", mime_type as "mimeType", size::text, uploaded_at as "uploadedAt"
        `, [
          attachmentId,
          taskId,
          safeOriginalName,
          req.file.filename,
          req.file.mimetype || 'application/octet-stream',
          req.file.size
        ]);

        attachments.push(attRes.rows[0]);
      }

      await client.query('COMMIT');

      const createdTask = {
        ...taskRes.rows[0],
        attachments
      };

      res.status(201).json(createdTask);
    } catch (dbErr) {
      await client.query('ROLLBACK');
      if (req.file) {
        await deletePhysicalFile(req.file.filename);
      }
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

apiRouter.put('/tasks/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, status, dueDate } = req.body;

    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const current = check.rows[0];

    let newTitle = current.title;
    if (title !== undefined) {
      const trimmed = typeof title === 'string' ? title.trim() : '';
      if (!trimmed) {
        res.status(400).json({ error: 'Название задачи не может быть пустым' });
        return;
      }
      newTitle = trimmed;
    }

    const newDescription = description !== undefined ? (typeof description === 'string' ? description.trim() : '') : current.description;
    
    let newStatus = current.status;
    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        res.status(400).json({ error: `Недопустимый статус задачи: ${status}` });
        return;
      }
      newStatus = status;
    }

    const newDueDate = dueDate !== undefined ? (dueDate && typeof dueDate === 'string' && dueDate.trim() ? dueDate.trim() : null) : current.due_date;

    await pool.query(`
      UPDATE tasks
      SET title = $1, description = $2, status = $3, due_date = $4, updated_at = NOW()
      WHERE id = $5
    `, [newTitle, newDescription, newStatus, newDueDate, id]);

    const updatedResult = await pool.query(`
      SELECT 
        t.id, 
        t.title, 
        t.description, 
        t.status, 
        to_char(t.due_date, 'YYYY-MM-DD') as "dueDate", 
        t.created_at as "createdAt", 
        t.updated_at as "updatedAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'originalName', a.original_name,
              'storedName', a.stored_name,
              'mimeType', a.mime_type,
              'size', a.size::text,
              'uploadedAt', a.uploaded_at
            )
          ) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as attachments
      FROM tasks t
      LEFT JOIN attachments a ON t.id = a.task_id
      WHERE t.id = $1
      GROUP BY t.id;
    `, [id]);

    res.status(200).json(updatedResult.rows[0]);
  } catch (err) {
    next(err);
  }
});

apiRouter.delete('/tasks/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const attRes = await pool.query('SELECT stored_name FROM attachments WHERE task_id = $1', [id]);
    for (const row of attRes.rows) {
      await deletePhysicalFile(row.stored_name);
    }

    const deleteRes = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
    if (deleteRes.rows.length === 0) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    res.status(200).json({ message: 'Задача успешно удалена', id });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/tasks/:id/attachments', upload.single('attachment'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskCheck.rows.length === 0) {
      if (req.file) {
        await deletePhysicalFile(req.file.filename);
      }
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не выбран для загрузки' });
      return;
    }

    const attachmentId = uuidv4();
    const safeOriginalName = sanitizeFileName(req.file.originalname) || 'attachment';

    const insertRes = await pool.query(`
      INSERT INTO attachments (id, task_id, original_name, stored_name, mime_type, size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, original_name as "originalName", stored_name as "storedName", mime_type as "mimeType", size::text, uploaded_at as "uploadedAt"
    `, [
      attachmentId,
      id,
      safeOriginalName,
      req.file.filename,
      req.file.mimetype || 'application/octet-stream',
      req.file.size
    ]);

    await pool.query('UPDATE tasks SET updated_at = NOW() WHERE id = $1', [id]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    if (req.file) {
      await deletePhysicalFile(req.file.filename);
    }
    next(err);
  }
});

apiRouter.delete('/tasks/:id/attachments/:attachmentId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, attachmentId } = req.params;

    const attRes = await pool.query('SELECT stored_name FROM attachments WHERE id = $1 AND task_id = $2', [attachmentId, id]);
    if (attRes.rows.length === 0) {
      res.status(404).json({ error: 'Вложение не найдено' });
      return;
    }

    await deletePhysicalFile(attRes.rows[0].stored_name);
    await pool.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
    await pool.query('UPDATE tasks SET updated_at = NOW() WHERE id = $1', [id]);

    res.status(200).json({ message: 'Вложение успешно удалено', attachmentId });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/tasks/:id/attachments/:attachmentId/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, attachmentId } = req.params;

    const attRes = await pool.query('SELECT original_name, stored_name FROM attachments WHERE id = $1 AND task_id = $2', [attachmentId, id]);
    if (attRes.rows.length === 0) {
      res.status(404).json({ error: 'Вложение не найдено' });
      return;
    }

    const { original_name, stored_name } = attRes.rows[0];
    const filePath = getUploadFilePath(stored_name);

    try {
      await fs.access(filePath);
    } catch {
      res.status(404).json({ error: 'Физический файл не найден на сервере' });
      return;
    }

    res.download(filePath, original_name);
  } catch (err) {
    next(err);
  }
});
