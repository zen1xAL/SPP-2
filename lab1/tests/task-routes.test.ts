import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('HTTP SSR Task Routes Integration Tests', () => {
  const testDir = path.resolve('./data/test-routes');
  const testDataFile = path.join(testDir, 'tasks.json');
  const testUploadDir = path.join(testDir, 'uploads');

  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.DATA_FILE = testDataFile;
    process.env.UPLOAD_DIR = testUploadDir;

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testUploadDir, { recursive: true });
    await fs.writeFile(testDataFile, JSON.stringify([], null, 2), 'utf-8');

    app = createApp();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('GET / should return 200 OK with rendered HTML', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('TaskFlow SSR');
    expect(res.text).toContain('Всего задач');
  });

  it('GET /?status=pending should filter correctly and return 200 OK', async () => {
    const res = await request(app).get('/?status=pending');

    expect(res.status).toBe(200);
    expect(res.text).toContain('filter-pill active');
  });

  it('POST /tasks should implement PRG pattern (redirect 303) on task creation', async () => {
    const res = await request(app)
      .post('/tasks')
      .field('title', 'Интеграционный тест создания задачи')
      .field('description', 'Тестовое описание')
      .field('status', 'in_progress')
      .field('dueDate', '2026-12-31')
      .field('currentFilter', 'all');

    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/?status=all');
    expect(res.headers.location).toContain('success=');

    const followRes = await request(app).get('/');
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain('Интеграционный тест создания задачи');
    expect(followRes.text).toContain('31.12.2026');
  });

  it('POST /tasks with empty title should reject with redirect to error', async () => {
    const res = await request(app)
      .post('/tasks')
      .field('title', '   ')
      .field('currentFilter', 'all');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
  });

  it('POST /tasks with file attachment should upload and bind file to task', async () => {
    const dummyFilePath = path.join(testDir, 'sample-upload.txt');
    await fs.writeFile(dummyFilePath, 'Файл вложения для теста SSR');

    const res = await request(app)
      .post('/tasks')
      .field('title', 'Задача с прикрепленным файлом')
      .field('currentFilter', 'all')
      .attach('attachment', dummyFilePath);

    expect(res.status).toBe(303);

    const followRes = await request(app).get('/');
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain('Задача с прикрепленным файлом');
    expect(followRes.text).toContain('sample-upload.txt');
  });

  it('GET /tasks/:id/attachments/:attachmentId/download should download file', async () => {
    const rawData = await fs.readFile(testDataFile, 'utf-8');
    const tasks = JSON.parse(rawData);
    const taskWithAtt = tasks.find((t: { attachments: unknown[] }) => t.attachments.length > 0);

    expect(taskWithAtt).toBeDefined();
    const att = taskWithAtt.attachments[0];

    const res = await request(app).get(
      `/tasks/${taskWithAtt.id}/attachments/${att.id}/download`
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toBe('Файл вложения для теста SSR');
  });

  it('GET /tasks/:id/attachments/non-existent/download should return 404', async () => {
    const res = await request(app).get(
      '/tasks/some-task/attachments/non-existent-id/download'
    );
    expect(res.status).toBe(404);
  });
});
