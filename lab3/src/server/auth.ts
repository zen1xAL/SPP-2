import crypto from 'node:crypto';
import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly sessionId: string;
}

export interface TokenPayload {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_temporary_key_taskflow_jwt_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({
      error: 'Требуется токен авторизации (Bearer)',
      code: 'UNAUTHORIZED',
      statusCode: 401
    });
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      error: 'Недействительный или истекший временный ключ доступа',
      code: 'TOKEN_EXPIRED',
      statusCode: 401
    });
    return;
  }

  try {
    const sessionRes = await pool.query(
      'SELECT is_revoked, expires_at FROM sessions WHERE id = $1',
      [payload.sessionId]
    );

    if (sessionRes.rows.length === 0) {
      res.status(401).json({
        error: 'Сессия не найдена',
        code: 'SESSION_NOT_FOUND',
        statusCode: 401
      });
      return;
    }

    const session = sessionRes.rows[0];
    if (session.is_revoked) {
      res.status(401).json({
        error: 'Сессия была отозвана',
        code: 'SESSION_REVOKED',
        statusCode: 401
      });
      return;
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      res.status(401).json({
        error: 'Срок действия сессии истек',
        code: 'SESSION_EXPIRED',
        statusCode: 401
      });
      return;
    }

    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Пользователь не аутентифицирован',
        code: 'UNAUTHORIZED',
        statusCode: 401
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Недостаточно прав. Требуются роли: ${allowedRoles.join(', ')}. Ваша роль: ${req.user.role}`,
        code: 'FORBIDDEN',
        statusCode: 403
      });
      return;
    }

    next();
  };
}
