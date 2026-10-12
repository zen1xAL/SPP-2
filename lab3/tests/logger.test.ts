import { describe, it, expect, vi } from 'vitest';
import { logger } from '../src/server/logger.js';

describe('Structured JSON Logger Tests', () => {
  it('should format logs as valid JSON with required metadata', () => {
    let captured = '';
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      captured += str;
      return true;
    });

    logger.info('Тестовое информационное сообщение', {
      requestId: 'test-uuid-1234',
      action: 'test.run',
      userId: 'user-42'
    });

    stdoutSpy.mockRestore();

    expect(captured).toBeTruthy();
    const parsed = JSON.parse(captured.trim());

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Тестовое информационное сообщение');
    expect(parsed.requestId).toBe('test-uuid-1234');
    expect(parsed.action).toBe('test.run');
    expect(parsed.userId).toBe('user-42');
    expect(parsed.timestamp).toBeDefined();
  });

  it('should write errors to process.stderr', () => {
    let captured = '';
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((str) => {
      captured += str;
      return true;
    });

    logger.error('Критическая ошибка базы данных', {
      errorCode: 'DB_DISCONNECTED'
    });

    stderrSpy.mockRestore();

    expect(captured).toBeTruthy();
    const parsed = JSON.parse(captured.trim());
    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('Критическая ошибка базы данных');
    expect(parsed.errorCode).toBe('DB_DISCONNECTED');
  });
});
