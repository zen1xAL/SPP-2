import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/taskdb'
});

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        due_date DATE,
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

    const countRes = await client.query('SELECT COUNT(*) FROM tasks');
    const count = parseInt(countRes.rows[0].count, 10);

    if (count === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);

      await client.query(`
        INSERT INTO tasks (id, title, description, status, due_date)
        VALUES 
          ($1, $2, $3, $4, $5),
          ($6, $7, $8, $9, $10),
          ($11, $12, $13, $14, $15)
      `, [
        uuidv4(), 'Изучить требования Лабораторной работы №2', 'Разработать SPA на React, REST API на Express, подключить PostgreSQL и упаковать в Docker.', 'completed', today,
        uuidv4(), 'Реализовать SPA на React с REST API', 'Обеспечить CRUD-операции над задачами и прикреплением файлов без перезагрузки страниц.', 'in_progress', future,
        uuidv4(), 'Проверить развертывание в Docker Compose', 'Собрать контейнеры backend + frontend + PostgreSQL и провести тестирование.', 'pending', future
      ]);
    }
  } finally {
    client.release();
  }
}
