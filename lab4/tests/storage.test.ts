import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initDatabase,
  savePlayerStats,
  recordMatch,
  getLeaderboard,
  getRecentMatches,
  closeDatabase
} from '../src/server/db.js';

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/server/config.js';

describe('CyberTanks Persistent Storage System', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    try {
      const storeFile = path.join(CONFIG.DATA_DIR, 'game_store.json');
      if (fs.existsSync(storeFile)) {
        const store = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
        delete store.players['TestWarrior'];
        delete store.players['TopSniper'];
        store.matches = store.matches.filter((m: { winnerName: string }) => m.winnerName !== 'TestWarrior');
        fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf-8');
      }
    } catch {}
  });

  it('persists player stats and aggregates score and kills', async () => {
    const stats1 = { kills: 3, deaths: 1, score: 350, wallsDestroyed: 5, bonusesCollected: 2 };
    const player1 = await savePlayerStats('TestWarrior', stats1, true);

    expect(player1.name).toBe('TestWarrior');
    expect(player1.totalKills).toBeGreaterThanOrEqual(3);
    expect(player1.totalWins).toBeGreaterThanOrEqual(1);

    const stats2 = { kills: 2, deaths: 0, score: 200, wallsDestroyed: 3, bonusesCollected: 1 };
    const player2 = await savePlayerStats('TestWarrior', stats2, false);

    expect(player2.totalMatches).toBe(player1.totalMatches + 1);
    expect(player2.totalKills).toBe(player1.totalKills + 2);
  });

  it('records match history and retrieves recent matches', async () => {
    const match = await recordMatch('TestWarrior', 120, 5, 8);
    expect(match.winnerName).toBe('TestWarrior');
    expect(match.durationSeconds).toBe(120);

    const recents = await getRecentMatches(5);
    expect(recents.length).toBeGreaterThan(0);
    expect(recents[0].winnerName).toBe('TestWarrior');
  });

  it('returns sorted leaderboard', async () => {
    await savePlayerStats('TopSniper', { kills: 10, deaths: 2, score: 1500, wallsDestroyed: 12, bonusesCollected: 5 }, true);

    const leaders = await getLeaderboard(5);
    expect(leaders.length).toBeGreaterThan(0);
    for (let i = 0; i < leaders.length - 1; i++) {
      expect(leaders[i].highScore).toBeGreaterThanOrEqual(leaders[i + 1].highScore);
    }
  });
});
