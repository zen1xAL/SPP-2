import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import {
  checkLoginRateLimit,
  recordFailedLogin,
  resetFailedLogin
} from '../src/server/rateLimiter.js';

describe('Brute-force Rate Limiter (HTTP 429) Tests', () => {
  const testIp = '192.168.1.100';

  beforeEach(() => {
    resetFailedLogin(testIp);
  });

  it('should allow requests under the 5 failed attempts threshold', () => {
    const app = express();
    app.use(checkLoginRateLimit);
    app.post('/login', (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    recordFailedLogin(testIp);
    recordFailedLogin(testIp);
    recordFailedLogin(testIp);

    return request(app)
      .post('/login')
      .set('X-Forwarded-For', testIp)
      .expect(200);
  });

  it('should block requests with 429 and Retry-After header after 5 failed attempts', async () => {
    const app = express();
    app.use(checkLoginRateLimit);
    app.post('/login', (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    for (let i = 0; i < 5; i++) {
      recordFailedLogin(testIp);
    }

    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-For', testIp);

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.error).toContain('Превышен лимит попыток входа');
  });

  it('should unblock IP after resetFailedLogin is called on successful authentication', async () => {
    const app = express();
    app.use(checkLoginRateLimit);
    app.post('/login', (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    for (let i = 0; i < 5; i++) {
      recordFailedLogin(testIp);
    }

    resetFailedLogin(testIp);

    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-For', testIp);

    expect(res.status).toBe(200);
  });
});
