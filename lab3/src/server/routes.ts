import { promises as fs } from 'node:fs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './db.js';
import { upload, sanitizeFileName, getUploadFilePath, deletePhysicalFile } from './upload.js';
import {
  authenticateToken,
  requireRole,
  generateAccessToken,
  hashToken,
  type UserRole
} from './auth.js';
import {
  checkLoginRateLimit,
  recordFailedLogin,
  resetFailedLogin
} from './rateLimiter.js';
import { createPasswordResetToken, getLatestResetEmail } from './email.js';
import { logger } from './logger.js';

export const apiRouter = Router();

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed']);
const VALID_ROLES = new Set<UserRole>(['admin', 'manager', 'viewer']);

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

apiRouter.post('/auth/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, role } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({
        error: 'Укажите корректный адрес электронной почты',
        code: 'VALIDATION_ERROR',
        statusCode: 400
      });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({
        error: 'Пароль должен содержать не менее 6 символов',
        code: 'VALIDATION_ERROR',
        statusCode: 400
      });
      return;
    }

    const assignedRole: UserRole = role && VALID_ROLES.has(role as UserRole) ? (role as UserRole) : 'viewer';

    const checkRes = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (checkRes.rows.length > 0) {
      res.status(409).json({
        error: 'Пользователь с таким адресом электронной почты уже зарегистрирован',
        code: 'EMAIL_ALREADY_EXISTS',
        statusCode: 409
      });
      return;
    }

    const userId = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);

    await pool.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [userId, email.trim().toLowerCase(), passwordHash, assignedRole]
    );

    logger.info('Зарегистрирован новый пользователь', {
      action: 'auth.register',
      userId,
      email: email.trim().toLowerCase(),
      role: assignedRole
    });

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: {
        id: userId,
        email: email.trim().toLowerCase(),
        role: assignedRole
      }
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/auth/login', checkLoginRateLimit, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({
        error: 'Email и пароль обязательны для входа',
        code: 'INVALID_INPUT',
        statusCode: 400
      });
      return;
    }

    const userRes = await pool.query(
      'SELECT id, email, password_hash, role, failed_attempts, locked_until FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      recordFailedLogin(clientIp);
      res.status(401).json({
        error: 'Неверный адрес электронной почты или пароль',
        code: 'INVALID_CREDENTIALS',
        statusCode: 401
      });
      return;
    }

    const user = userRes.rows[0];

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const remainingSec = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000);
      res.setHeader('Retry-After', remainingSec.toString());
      res.status(429).json({
        error: `Учетная запись временно заблокирована из-за частых неудачных попыток. Повторите через ${Math.ceil(remainingSec / 60)} мин.`,
        code: 'ACCOUNT_LOCKED',
        statusCode: 429,
        retryAfterSeconds: remainingSec
      });
      return;
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      recordFailedLogin(clientIp);
      const newAttempts = user.failed_attempts + 1;
      let lockTimestamp: Date | null = null;

      if (newAttempts >= 5) {
        lockTimestamp = new Date(Date.now() + 15 * 60 * 1000);
        await pool.query(
          'UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3',
          [newAttempts, lockTimestamp, user.id]
        );
        logger.warn('Учетная запись заблокирована по превышению попыток пароля', {
          action: 'auth.account_locked',
          userId: user.id,
          email: user.email
        });
      } else {
        await pool.query(
          'UPDATE users SET failed_attempts = $1 WHERE id = $2',
          [newAttempts, user.id]
        );
      }

      res.status(401).json({
        error: 'Неверный адрес электронной почты или пароль',
        code: 'INVALID_CREDENTIALS',
        statusCode: 401
      });
      return;
    }

    await pool.query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );
    resetFailedLogin(clientIp);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const token = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId
    });

    const tokenHashed = hashToken(token);
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';

    await pool.query(`
      INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [sessionId, user.id, tokenHashed, clientIp, userAgent, expiresAt]);

    logger.info('Успешная аутентификация пользователя', {
      action: 'auth.login_success',
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId
    });

    res.status(200).json({
      message: 'Успешный вход в систему',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      session: {
        id: sessionId,
        expiresAt: expiresAt.toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/auth/logout', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.sessionId) {
      await pool.query('UPDATE sessions SET is_revoked = true WHERE id = $1', [req.user.sessionId]);
      logger.info('Сессия завершена пользователем', {
        action: 'auth.logout',
        userId: req.user.id,
        sessionId: req.user.sessionId
      });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/auth/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    user: req.user
  });
});

apiRouter.get('/auth/sessions', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const isGlobalAdmin = req.user?.role === 'admin';
    const query = isGlobalAdmin
      ? `
        SELECT s.id, s.user_id as "userId", u.email, s.ip_address as "ipAddress", s.user_agent as "userAgent",
               s.created_at as "createdAt", s.expires_at as "expiresAt", s.is_revoked as "isRevoked"
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        ORDER BY s.created_at DESC LIMIT 50;
      `
      : `
        SELECT s.id, s.user_id as "userId", u.email, s.ip_address as "ipAddress", s.user_agent as "userAgent",
               s.created_at as "createdAt", s.expires_at as "expiresAt", s.is_revoked as "isRevoked"
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC;
      `;

    const params = isGlobalAdmin ? [] : [req.user?.id];
    const result = await pool.query(query, params);

    const sessions = result.rows.map((row) => ({
      ...row,
      isCurrent: row.id === req.user?.sessionId,
      isExpired: new Date(row.expiresAt).getTime() < Date.now()
    }));

    res.status(200).json({ sessions });
  } catch (err) {
    next(err);
  }
});

apiRouter.delete('/auth/sessions/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const isGlobalAdmin = req.user?.role === 'admin';

    const checkRes = await pool.query('SELECT user_id FROM sessions WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({
        error: 'Сессия не найдена',
        code: 'SESSION_NOT_FOUND',
        statusCode: 404
      });
      return;
    }

    if (!isGlobalAdmin && checkRes.rows[0].user_id !== req.user?.id) {
      res.status(403).json({
        error: 'Запрещено отзывать сессии других пользователей',
        code: 'FORBIDDEN',
        statusCode: 403
      });
      return;
    }

    await pool.query('UPDATE sessions SET is_revoked = true WHERE id = $1', [id]);

    logger.info('Сессия отозвана', {
      action: 'auth.session_revoked',
      revokedSessionId: id,
      operatorId: req.user?.id
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/auth/forgot-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        error: 'Укажите адрес электронной почты',
        code: 'VALIDATION_ERROR',
        statusCode: 400
      });
      return;
    }

    const userRes = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    let previewToken: string | null = null;

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      previewToken = await createPasswordResetToken(user.id, user.email);
    }

    res.status(200).json({
      message: 'Если учетная запись существует, ссылка для сброса пароля сформирована',
      previewToken
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/auth/reset-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        error: 'Токен сброса пароля обязателен',
        code: 'VALIDATION_ERROR',
        statusCode: 400
      });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({
        error: 'Новый пароль должен содержать минимум 6 символов',
        code: 'VALIDATION_ERROR',
        statusCode: 400
      });
      return;
    }

    const tokenHashed = hashToken(token.trim());
    const resetRes = await pool.query(`
      SELECT id, user_id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = $1
    `, [tokenHashed]);

    if (resetRes.rows.length === 0) {
      res.status(422).json({
        error: 'Недействительный токен сброса пароля',
        code: 'INVALID_RESET_TOKEN',
        statusCode: 422
      });
      return;
    }

    const record = resetRes.rows[0];
    if (record.used_at) {
      res.status(422).json({
        error: 'Данный одноразовый токен сброса пароля уже был использован',
        code: 'RESET_TOKEN_ALREADY_USED',
        statusCode: 422
      });
      return;
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      res.status(422).json({
        error: 'Срок действия токена сброса пароля истек',
        code: 'RESET_TOKEN_EXPIRED',
        statusCode: 422
      });
      return;
    }

    const newHash = bcrypt.hashSync(newPassword, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2',
        [newHash, record.user_id]
      );
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [record.id]);
      await client.query('UPDATE sessions SET is_revoked = true WHERE user_id = $1', [record.user_id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    logger.info('Пароль успешно сброшен и обновлен', {
      action: 'auth.password_reset_success',
      userId: record.user_id
    });

    res.status(200).json({
      message: 'Пароль успешно обновлен. Все активные сессии завершены. Войдите с новым паролем.'
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/auth/email-preview', (_req: Request, res: Response): void => {
  const emailMsg = getLatestResetEmail();
  res.status(200).json({ latestEmail: emailMsg });
});

apiRouter.get('/tasks', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
        t.author_id as "authorId",
        u.email as "authorEmail",
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
      LEFT JOIN users u ON t.author_id = u.id
      LEFT JOIN attachments a ON t.id = a.task_id
      GROUP BY t.id, u.email
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

apiRouter.get('/tasks/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.title, 
        t.description, 
        t.status, 
        to_char(t.due_date, 'YYYY-MM-DD') as "dueDate", 
        t.author_id as "authorId",
        u.email as "authorEmail",
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
      LEFT JOIN users u ON t.author_id = u.id
      LEFT JOIN attachments a ON t.id = a.task_id
      WHERE t.id = $1
      GROUP BY t.id, u.email;
    `, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Задача с указанным идентификатором не найдена',
        code: 'TASK_NOT_FOUND',
        statusCode: 404
      });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

apiRouter.post(
  '/tasks',
  authenticateToken,
  requireRole('admin', 'manager'),
  upload.single('attachment'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, description, status, dueDate } = req.body;

      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) {
        if (req.file) {
          await deletePhysicalFile(req.file.filename);
        }
        res.status(400).json({
          error: 'Название задачи обязательно для заполнения',
          code: 'VALIDATION_ERROR',
          statusCode: 400
        });
        return;
      }

      const taskStatus = status && VALID_STATUSES.has(status) ? status : 'pending';
      const parsedDueDate = typeof dueDate === 'string' && dueDate.trim() ? dueDate.trim() : null;
      const taskId = uuidv4();
      const authorId = req.user?.id || null;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const taskRes = await client.query(`
          INSERT INTO tasks (id, title, description, status, due_date, author_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING 
            id, title, description, status, 
            to_char(due_date, 'YYYY-MM-DD') as "dueDate", 
            author_id as "authorId",
            created_at as "createdAt", 
            updated_at as "updatedAt"
        `, [taskId, trimmedTitle, typeof description === 'string' ? description.trim() : '', taskStatus, parsedDueDate, authorId]);

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
          authorEmail: req.user?.email,
          attachments
        };

        logger.info('Задача успешно создана', {
          action: 'task.created',
          taskId,
          authorId,
          role: req.user?.role
        });

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
  }
);

apiRouter.put(
  '/tasks/:id',
  authenticateToken,
  requireRole('admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { title, description, status, dueDate } = req.body;

      const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        res.status(404).json({
          error: 'Задача не найдена',
          code: 'TASK_NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      const current = check.rows[0];

      let newTitle = current.title;
      if (title !== undefined) {
        const trimmed = typeof title === 'string' ? title.trim() : '';
        if (!trimmed) {
          res.status(400).json({
            error: 'Название задачи не может быть пустым',
            code: 'VALIDATION_ERROR',
            statusCode: 400
          });
          return;
        }
        newTitle = trimmed;
      }

      const newDescription = description !== undefined ? (typeof description === 'string' ? description.trim() : '') : current.description;
      
      let newStatus = current.status;
      if (status !== undefined) {
        if (!VALID_STATUSES.has(status)) {
          res.status(400).json({
            error: `Недопустимый статус задачи: ${status}`,
            code: 'VALIDATION_ERROR',
            statusCode: 400
          });
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
          t.author_id as "authorId",
          u.email as "authorEmail",
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
        LEFT JOIN users u ON t.author_id = u.id
        LEFT JOIN attachments a ON t.id = a.task_id
        WHERE t.id = $1
        GROUP BY t.id, u.email;
      `, [id]);

      logger.info('Задача успешно обновлена', {
        action: 'task.updated',
        taskId: id,
        operatorId: req.user?.id
      });

      res.status(200).json(updatedResult.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.delete(
  '/tasks/:id',
  authenticateToken,
  requireRole('admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const attRes = await pool.query('SELECT stored_name FROM attachments WHERE task_id = $1', [id]);
      for (const row of attRes.rows) {
        await deletePhysicalFile(row.stored_name);
      }

      const deleteRes = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
      if (deleteRes.rows.length === 0) {
        res.status(404).json({
          error: 'Задача не найдена',
          code: 'TASK_NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      logger.info('Задача удалена', {
        action: 'task.deleted',
        taskId: id,
        operatorId: req.user?.id
      });

      res.status(200).json({ message: 'Задача успешно удалена', id });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.post(
  '/tasks/:id/attachments',
  authenticateToken,
  requireRole('admin', 'manager'),
  upload.single('attachment'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
      if (taskCheck.rows.length === 0) {
        if (req.file) {
          await deletePhysicalFile(req.file.filename);
        }
        res.status(404).json({
          error: 'Задача не найдена',
          code: 'TASK_NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          error: 'Файл не выбран для загрузки',
          code: 'VALIDATION_ERROR',
          statusCode: 400
        });
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

      logger.info('К задаче прикреплен новый файл', {
        action: 'attachment.created',
        taskId: id,
        attachmentId,
        fileName: safeOriginalName
      });

      res.status(201).json(insertRes.rows[0]);
    } catch (err) {
      if (req.file) {
        await deletePhysicalFile(req.file.filename);
      }
      next(err);
    }
  }
);

apiRouter.delete(
  '/tasks/:id/attachments/:attachmentId',
  authenticateToken,
  requireRole('admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, attachmentId } = req.params;

      const attRes = await pool.query('SELECT stored_name FROM attachments WHERE id = $1 AND task_id = $2', [attachmentId, id]);
      if (attRes.rows.length === 0) {
        res.status(404).json({
          error: 'Вложение не найдено',
          code: 'ATTACHMENT_NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      await deletePhysicalFile(attRes.rows[0].stored_name);
      await pool.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
      await pool.query('UPDATE tasks SET updated_at = NOW() WHERE id = $1', [id]);

      logger.info('Вложение удалено', {
        action: 'attachment.deleted',
        taskId: id,
        attachmentId
      });

      res.status(200).json({ message: 'Вложение успешно удалено', attachmentId });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.get(
  '/tasks/:id/attachments/:attachmentId/download',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, attachmentId } = req.params;

      const attRes = await pool.query('SELECT original_name, stored_name FROM attachments WHERE id = $1 AND task_id = $2', [attachmentId, id]);
      if (attRes.rows.length === 0) {
        res.status(404).json({
          error: 'Вложение не найдено',
          code: 'ATTACHMENT_NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      const { original_name, stored_name } = attRes.rows[0];
      const filePath = getUploadFilePath(stored_name);

      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({
          error: 'Физический файл не найден на сервере',
          code: 'FILE_NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      res.download(filePath, original_name);
    } catch (err) {
      next(err);
    }
  }
);
