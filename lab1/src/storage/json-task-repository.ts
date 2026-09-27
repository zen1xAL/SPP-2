import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Task } from '../domain/models/task.js';
import type { ITaskRepository } from './task-repository.interface.js';

export class JsonTaskRepository implements ITaskRepository {
  private readonly filePath: string;
  private isInitialized = false;

  constructor(filePath: string = './data/tasks.json') {
    this.filePath = path.resolve(filePath);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      const initialTasks: Task[] = [
        {
          id: 'task-1-sample',
          title: 'Изучить требования лабораторной работы №1',
          description: 'Ознакомиться с серверным рендерингом на Express + EJS, формами и прикреплением файлов.',
          status: 'completed',
          dueDate: new Date().toISOString().slice(0, 10),
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
          attachments: []
        },
        {
          id: 'task-2-sample',
          title: 'Реализовать фильтрацию задач по статусу',
          description: 'Добавить переключение фильтров Все / Ожидает / В работе / Завершена с поддержкой PRG.',
          status: 'in_progress',
          dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attachments: []
        },
        {
          id: 'task-3-sample',
          title: 'Подготовить отчет по лабораторной работе',
          description: 'Сформировать демонстрационные скриншоты работы приложения и прикрепить файлы к задачам.',
          status: 'pending',
          dueDate: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attachments: []
        }
      ];
      await fs.writeFile(this.filePath, JSON.stringify(initialTasks, null, 2), 'utf-8');
    }

    this.isInitialized = true;
  }

  private async readTasks(): Promise<Task[]> {
    await this.ensureInitialized();
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeTasks(tasks: Task[]): Promise<void> {
    await this.ensureInitialized();
    const tempFile = `${this.filePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2), 'utf-8');
    await fs.rename(tempFile, this.filePath);
  }

  async findAll(): Promise<Task[]> {
    return this.readTasks();
  }

  async findById(id: string): Promise<Task | null> {
    const tasks = await this.readTasks();
    const task = tasks.find((t) => t.id === id);
    return task ?? null;
  }

  async create(task: Task): Promise<Task> {
    const tasks = await this.readTasks();
    tasks.unshift(task);
    await this.writeTasks(tasks);
    return task;
  }

  async update(task: Task): Promise<Task> {
    const tasks = await this.readTasks();
    const index = tasks.findIndex((t) => t.id === task.id);
    if (index === -1) {
      throw new Error(`Task with id ${task.id} not found`);
    }
    tasks[index] = task;
    await this.writeTasks(tasks);
    return task;
  }

  async delete(id: string): Promise<boolean> {
    const tasks = await this.readTasks();
    const initialLength = tasks.length;
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === initialLength) {
      return false;
    }
    await this.writeTasks(filtered);
    return true;
  }
}
