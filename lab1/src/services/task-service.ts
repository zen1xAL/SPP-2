import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  Attachment,
  CreateTaskDTO,
  Task,
  TaskFilter,
  TaskStats,
  TaskStatus,
  UpdateTaskDTO
} from '../domain/models/task.js';
import { isOverdue, isValidStatus } from '../domain/models/task.js';
import type { ITaskRepository } from '../storage/task-repository.interface.js';

export class TaskService {
  constructor(
    private readonly repository: ITaskRepository,
    private readonly uploadDir: string = './uploads'
  ) {}

  async getTasks(filter: TaskFilter = 'all'): Promise<{ tasks: Task[]; stats: TaskStats }> {
    const allTasks = await this.repository.findAll();

    const stats: TaskStats = {
      total: allTasks.length,
      pending: allTasks.filter((t) => t.status === 'pending').length,
      inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      overdue: allTasks.filter((t) => isOverdue(t.dueDate, t.status)).length
    };

    let filteredTasks = allTasks;
    if (filter !== 'all') {
      filteredTasks = allTasks.filter((t) => t.status === filter);
    }

    return { tasks: filteredTasks, stats };
  }

  async getTaskById(id: string): Promise<Task | null> {
    return this.repository.findById(id);
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const trimmedTitle = dto.title?.trim();
    if (!trimmedTitle) {
      throw new Error('Название задачи обязательно для заполнения');
    }

    const status: TaskStatus = dto.status && isValidStatus(dto.status) ? dto.status : 'pending';
    const now = new Date().toISOString();

    const attachments: Attachment[] = dto.attachment ? [dto.attachment] : [];

    const task: Task = {
      id: uuidv4(),
      title: trimmedTitle,
      description: dto.description?.trim() ?? '',
      status,
      dueDate: dto.dueDate && dto.dueDate.trim() ? dto.dueDate.trim() : null,
      createdAt: now,
      updatedAt: now,
      attachments
    };

    return this.repository.create(task);
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    if (!isValidStatus(status)) {
      throw new Error(`Недопустимый статус задачи: ${status}`);
    }

    const task = await this.repository.findById(id);
    if (!task) {
      throw new Error(`Задача с идентификатором ${id} не найдена`);
    }

    const updatedTask: Task = {
      ...task,
      status,
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }

  async updateTask(id: string, dto: UpdateTaskDTO): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) {
      throw new Error(`Задача с идентификатором ${id} не найдена`);
    }

    const updatedTask: Task = {
      ...task,
      title: dto.title !== undefined ? dto.title.trim() : task.title,
      description: dto.description !== undefined ? dto.description.trim() : task.description,
      status: dto.status && isValidStatus(dto.status) ? dto.status : task.status,
      dueDate: dto.dueDate !== undefined ? (dto.dueDate ? dto.dueDate.trim() : null) : task.dueDate,
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.repository.findById(id);
    if (!task) {
      return false;
    }

    for (const attachment of task.attachments) {
      await this.deletePhysicalFile(attachment.storedName);
    }

    return this.repository.delete(id);
  }

  async addAttachment(taskId: string, attachment: Attachment): Promise<Task> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      await this.deletePhysicalFile(attachment.storedName);
      throw new Error(`Задача с идентификатором ${taskId} не найдена`);
    }

    const updatedTask: Task = {
      ...task,
      attachments: [...task.attachments, attachment],
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }

  async removeAttachment(taskId: string, attachmentId: string): Promise<Task> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new Error(`Задача с идентификатором ${taskId} не найдена`);
    }

    const attachmentToRemove = task.attachments.find((a) => a.id === attachmentId);
    if (!attachmentToRemove) {
      throw new Error(`Вложение с идентификатором ${attachmentId} не найдено`);
    }

    await this.deletePhysicalFile(attachmentToRemove.storedName);

    const updatedTask: Task = {
      ...task,
      attachments: task.attachments.filter((a) => a.id !== attachmentId),
      updatedAt: new Date().toISOString()
    };

    return this.repository.update(updatedTask);
  }

  async getAttachment(taskId: string, attachmentId: string): Promise<Attachment | null> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      return null;
    }
    const attachment = task.attachments.find((a) => a.id === attachmentId);
    return attachment ?? null;
  }

  private async deletePhysicalFile(storedName: string): Promise<void> {
    try {
      const safeName = path.basename(storedName);
      const filePath = path.resolve(this.uploadDir, safeName);
      await fs.unlink(filePath);
    } catch {
      return;
    }
  }
}
