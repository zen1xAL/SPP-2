import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './db.js';
import { hashToken } from './auth.js';
import { logger } from './logger.js';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly resetUrl: string;
  readonly token: string;
  readonly expiresAt: string;
}

let latestEmail: EmailMessage | null = null;

export async function createPasswordResetToken(userId: string, email: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashed = hashToken(rawToken);
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await pool.query(
    'INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, hashed, expiresAt]
  );

  const resetUrl = `/reset-password?token=${rawToken}`;

  latestEmail = {
    to: email,
    subject: 'Восстановление доступа к TaskFlow',
    resetUrl,
    token: rawToken,
    expiresAt: expiresAt.toISOString()
  };

  logger.info('Сформирована ссылка для восстановления доступа через Email', {
    action: 'auth.password_reset_email_sent',
    recipient: email,
    expiresAt: expiresAt.toISOString(),
    resetUrl
  });

  return rawToken;
}

export function getLatestResetEmail(): EmailMessage | null {
  return latestEmail;
}
