import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonTaskRepository } from '../src/storage/json-task-repository.js';
import { TaskService } from '../src/services/task-service.js';
import type { Attachment, TaskStatus } from '../src/domain/models/task.js';

describe('TaskService Unit Tests', () => {
  const testDataDir = path.resolve('./data/test-service');
  const testDataFile = path.join(testDataDir, 'tasks.json');
  const testUploadDir = path.join(testDataDir, 'uploads');

  let service: TaskService;

  beforeEach(async () => {
    await fs.mkdir(testDataDir, { recursive: true });
    await fs.mkdir(testUploadDir, { recursive: true });
    await fs.writeFile(testDataFile, JSON.stringify([], null, 2), 'utf-8');

    const repository = new JsonTaskRepository(testDataFile);
    service = new TaskService(repository, testUploadDir);
  });

  afterEach(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('should create a task with default pending status and valid fields', async () => {
    const task = await service.createTask({
      title: 'Новая тестовая задача',
      description: 'Подробное описание задачи',
      dueDate: '2026-10-15'
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Новая тестовая задача');
    expect(task.description).toBe('Подробное описание задачи');
    expect(task.status).toBe('pending');
    expect(task.dueDate).toBe('2026-10-15');
    expect(task.attachments).toHaveLength(0);
  });

  it('should throw error when creating a task with empty title', async () => {
    await expect(service.createTask({ title: '   ' })).rejects.toThrow(
      'Название задачи обязательно для заполнения'
    );
  });

  it('should update task status correctly', async () => {
    const task = await service.createTask({ title: 'Задача в работе' });
    const updated = await service.updateTaskStatus(task.id, 'in_progress');

    expect(updated.status).toBe('in_progress');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(task.updatedAt).getTime()
    );
  });

  it('should throw error when updating to invalid status', async () => {
    const task = await service.createTask({ title: 'Тест некорректного статуса' });
    await expect(
      service.updateTaskStatus(task.id, 'unknown_status' as unknown as TaskStatus)
    ).rejects.toThrow('Недопустимый статус задачи');
  });

  it('should filter tasks by status and calculate accurate stats', async () => {
    await service.createTask({ title: 'Task 1', status: 'pending', dueDate: '2020-01-01' });
    await service.createTask({ title: 'Task 2', status: 'in_progress', dueDate: '2099-01-01' });
    await service.createTask({ title: 'Task 3', status: 'completed', dueDate: '2020-01-01' });

    const all = await service.getTasks('all');
    expect(all.tasks).toHaveLength(3);
    expect(all.stats.total).toBe(3);
    expect(all.stats.pending).toBe(1);
    expect(all.stats.inProgress).toBe(1);
    expect(all.stats.completed).toBe(1);
    expect(all.stats.overdue).toBe(1);

    const pendingOnly = await service.getTasks('pending');
    expect(pendingOnly.tasks).toHaveLength(1);
    expect(pendingOnly.tasks[0].title).toBe('Task 1');
  });

  it('should attach and remove files, deleting physical files', async () => {
    const task = await service.createTask({ title: 'Задача с файлом' });

    const storedFileName = 'test-file.txt';
    const filePath = path.join(testUploadDir, storedFileName);
    await fs.writeFile(filePath, 'Пример содержимого файла');

    const attachment: Attachment = {
      id: 'att-1',
      originalName: 'документ.txt',
      storedName: storedFileName,
      mimeType: 'text/plain',
      size: 24,
      uploadedAt: new Date().toISOString()
    };

    const taskWithAtt = await service.addAttachment(task.id, attachment);
    expect(taskWithAtt.attachments).toHaveLength(1);

    await expect(fs.access(filePath)).resolves.toBeUndefined();

    const taskWithoutAtt = await service.removeAttachment(task.id, attachment.id);
    expect(taskWithoutAtt.attachments).toHaveLength(0);

    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('should delete task and all its associated physical files', async () => {
    const storedFileName = 'delete-me.txt';
    const filePath = path.join(testUploadDir, storedFileName);
    await fs.writeFile(filePath, 'Тестовый файл для удаления');

    const attachment: Attachment = {
      id: 'att-del',
      originalName: 'delete-me.txt',
      storedName: storedFileName,
      mimeType: 'text/plain',
      size: 25,
      uploadedAt: new Date().toISOString()
    };

    const task = await service.createTask({
      title: 'Задача на удаление',
      attachment
    });

    const deleted = await service.deleteTask(task.id);
    expect(deleted).toBe(true);

    const found = await service.getTaskById(task.id);
    expect(found).toBeNull();

    await expect(fs.access(filePath)).rejects.toThrow();
  });
});
