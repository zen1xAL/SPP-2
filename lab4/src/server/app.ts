import express, { type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLeaderboard, getRecentMatches } from './db.js';
import type { GameRoom } from './game/room.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveClientDir(): string {
  const candidates = [
    path.resolve(__dirname, '../client'),
    path.resolve(__dirname, '../../src/client'),
    path.resolve(__dirname, '../../../src/client'),
    path.resolve(process.cwd(), 'src/client'),
    path.resolve(process.cwd(), 'client'),
    path.resolve(__dirname, '../../client')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return candidates[0];
}

export function createApp(getRoom?: () => GameRoom): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const clientDir = resolveClientDir();
  app.use(express.static(clientDir));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'CyberTanks Realtime Arena',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/leaderboard', async (_req: Request, res: Response) => {
    try {
      if (getRoom) {
        const room = getRoom();
        if (room && typeof room.flushStats === 'function') {
          await room.flushStats();
        }
      }
      const top = await getLeaderboard(15);
      res.json({ leaderboard: top });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка получения таблицы лидеров' });
    }
  });

  app.get('/api/matches', async (_req: Request, res: Response) => {
    try {
      const matches = await getRecentMatches(10);
      res.json({ matches });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка получения истории матчей' });
    }
  });

  app.get('/api/arena/stats', (_req: Request, res: Response) => {
    if (!getRoom) {
      res.json({ activePlayers: 0 });
      return;
    }
    const room = getRoom();
    const snapshot = room.getSnapshot();
    res.json({
      activePlayers: snapshot.tanks.length,
      alivePlayers: snapshot.tanks.filter((t) => t.isAlive).length,
      activeBullets: snapshot.bullets.length,
      activeBonuses: snapshot.bonuses.length,
      tick: snapshot.tick
    });
  });

  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return app;
}
