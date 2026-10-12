import { describe, it, expect } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import {
  generateAccessToken,
  verifyAccessToken,
  hashToken,
  requireRole,
  type AuthenticatedUser
} from '../src/server/auth.js';

describe('RBAC & Temporary Access Keys (JWT) Tests', () => {
  it('should generate and verify temporary JWT tokens correctly', () => {
    const payload = {
      userId: 'user-uuid-1',
      email: 'manager@taskflow.local',
      role: 'manager' as const,
      sessionId: 'session-uuid-1'
    };

    const token = generateAccessToken(payload);
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe('user-uuid-1');
    expect(decoded?.role).toBe('manager');
  });

  it('should return null when verifying invalid tokens', () => {
    expect(verifyAccessToken('invalid.garbage.token')).toBeNull();
  });

  it('should generate deterministic sha256 hashes for sessions', () => {
    const hash1 = hashToken('token-abc-123');
    const hash2 = hashToken('token-abc-123');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  describe('requireRole middleware semantics', () => {
    const createTestApp = (user?: AuthenticatedUser) => {
      const app = express();
      app.use((req: Request, _res: Response, next) => {
        if (user) req.user = user;
        next();
      });
      app.post('/tasks', requireRole('admin', 'manager'), (_req: Request, res: Response) => {
        res.status(201).json({ created: true });
      });
      return app;
    };

    it('should return 401 Unauthorized when user is not authenticated', async () => {
      const app = createTestApp(undefined);
      const res = await request(app).post('/tasks');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 Forbidden when viewer tries to perform mutation', async () => {
      const app = createTestApp({
        id: 'viewer-id',
        email: 'viewer@taskflow.local',
        role: 'viewer',
        sessionId: 'sess-1'
      });

      const res = await request(app).post('/tasks');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.error).toContain('Недостаточно прав');
    });

    it('should allow manager to perform task creation (201 Created)', async () => {
      const app = createTestApp({
        id: 'manager-id',
        email: 'manager@taskflow.local',
        role: 'manager',
        sessionId: 'sess-2'
      });

      const res = await request(app).post('/tasks');
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(true);
    });

    it('should allow admin to perform task creation (201 Created)', async () => {
      const app = createTestApp({
        id: 'admin-id',
        email: 'admin@taskflow.local',
        role: 'admin',
        sessionId: 'sess-3'
      });

      const res = await request(app).post('/tasks');
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(true);
    });
  });
});
