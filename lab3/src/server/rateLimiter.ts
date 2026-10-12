import { type Request, type Response, type NextFunction } from 'express';
import { logger } from './logger.js';

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

const ipAttempts = new Map<string, AttemptRecord>();

export function checkLoginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || 'unknown');
  const clientIp = rawIp.replace(/^.*:/, '');
  const now = Date.now();

  const record = ipAttempts.get(clientIp);

  if (record && record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    res.setHeader('Retry-After', remainingSeconds.toString());
    
    logger.warn('Заблокирована попытка входа из-за превышения лимита запросов', {
      ip: clientIp,
      action: 'auth.rate_limited',
      retryAfterSeconds: remainingSeconds
    });

    res.status(429).json({
      error: `Превышен лимит попыток входа. Повторите попытку через ${Math.ceil(remainingSeconds / 60)} мин.`,
      code: 'TOO_MANY_REQUESTS',
      statusCode: 429,
      retryAfterSeconds: remainingSeconds
    });
    return;
  }

  next();
}

export function recordFailedLogin(ip: string): void {
  const clientIp = ip.replace(/^.*:/, '');
  const now = Date.now();
  const record = ipAttempts.get(clientIp);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    ipAttempts.set(clientIp, {
      count: 1,
      firstAttemptAt: now,
      lockedUntil: null
    });
    return;
  }

  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    logger.warn('Активирована блокировка IP из-за серии неудачных попыток входа', {
      ip: clientIp,
      attempts: record.count,
      lockoutMinutes: Math.round(LOCKOUT_MS / 60000)
    });
  }
}

export function resetFailedLogin(ip: string): void {
  const clientIp = ip.replace(/^.*:/, '');
  ipAttempts.delete(clientIp);
}
