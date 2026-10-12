import { type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly requestId?: string;
  readonly method?: string;
  readonly url?: string;
  readonly statusCode?: number;
  readonly responseTimeMs?: number;
  readonly ip?: string;
  readonly userId?: string;
  readonly role?: string;
  readonly action?: string;
  readonly error?: string;
  readonly stack?: string;
  readonly details?: unknown;
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

function writeLog(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'debug',
      message,
      ...context
    });
  },

  info(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...context
    });
  },

  warn(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...context
    });
  },

  error(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      ...context
    });
  }
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.id = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const statusCode = res.statusCode;
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](`HTTP ${req.method} ${req.originalUrl || req.url}`, {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      responseTimeMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
  });

  next();
}
