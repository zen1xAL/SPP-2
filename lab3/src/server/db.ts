import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/taskdb'
});

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'viewer',
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(128) NOT NULL,
        user_agent VARCHAR(512) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_revoked BOOLEAN NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        due_date DATE,
        author_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        size BIGINT NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    const usersCountRes = await client.query('SELECT COUNT(*) FROM users');
    const usersCount = parseInt(usersCountRes.rows[0].count, 10);

    if (usersCount === 0) {
      logger.info('Инициализация начальных пользователей (Seed users: admin, manager, viewer)...');

      const adminId = uuidv4();
      const managerId = uuidv4();
      const viewerId = uuidv4();

      const adminHash = bcrypt.hashSync('AdminPass123!', 10);
      const managerHash = bcrypt.hashSync('ManagerPass123!', 10);
      const viewerHash = bcrypt.hashSync('ViewerPass123!', 10);

      await client.query(`
        INSERT INTO users (id, email, password_hash, role)
        VALUES 
          ($1, $2, $3, $4),
          ($5, $6, $7, $8),
          ($9, $10, $11, $12)
      `, [
        adminId, 'admin@taskflow.local', adminHash, 'admin',
        managerId, 'manager@taskflow.local', managerHash, 'manager',
        viewerId, 'viewer@taskflow.local', viewerHash, 'viewer'
      ]);

      const tasksCountRes = await client.query('SELECT COUNT(*) FROM tasks');
      const tasksCount = parseInt(tasksCountRes.rows[0].count, 10);

      if (tasksCount === 0) {
        const today = new Date().toISOString().slice(0, 10);
        const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);

        await client.query(`
          INSERT INTO tasks (id, title, description, status, due_date, author_id)
          VALUES 
            ($1, $2, $3, $4, $5, $6),
            ($7, $8, $9, $10, $11, $12),
            ($13, $14, $15, $16, $17, $18)
        `, [
          uuidv4(), 'Изучить RBAC и временные ключи JWT', 'Обеспечить разграничение доступа для 3 ролей: admin, manager, viewer.', 'completed', today, adminId,
          uuidv4(), 'Проверить защиту от подбора паролей', 'Протестировать блокировку входа при 5 неверных попытках (HTTP 429).', 'in_progress', future, managerId,
          uuidv4(), 'Проверить контроль активных подключений', 'Реализовать отображение активных сессий и возможность удаленного отзыва.', 'pending', future, adminId
        ]);
      }
    }
  } finally {
    client.release();
  }
}
