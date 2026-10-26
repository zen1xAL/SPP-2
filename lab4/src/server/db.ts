import fs from 'node:fs';
import path from 'node:path';
import pkg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from './config.js';
import type { PlayerStats } from './game/types.js';

const { Pool } = pkg;

export interface PersistentPlayer {
  id: string;
  name: string;
  totalMatches: number;
  totalKills: number;
  totalDeaths: number;
  totalWins: number;
  highScore: number;
  totalWallsDestroyed: number;
  totalBonusesCollected: number;
  createdAt: string;
  lastPlayedAt: string;
}

export interface PersistentMatch {
  id: string;
  winnerName: string;
  durationSeconds: number;
  totalKills: number;
  totalWallsDestroyed: number;
  createdAt: string;
}

let pool: pkg.Pool | null = null;
const localFilePath = path.join(CONFIG.DATA_DIR, 'game_store.json');

interface LocalStoreData {
  players: Record<string, PersistentPlayer>;
  matches: PersistentMatch[];
}

function ensureDataDirectory(): void {
  if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  }
}

function readLocalStore(): LocalStoreData {
  ensureDataDirectory();
  if (!fs.existsSync(localFilePath)) {
    const initial: LocalStoreData = { players: {}, matches: [] };
    fs.writeFileSync(localFilePath, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(localFilePath, 'utf-8');
    return JSON.parse(raw) as LocalStoreData;
  } catch {
    return { players: {}, matches: [] };
  }
}

function writeLocalStore(data: LocalStoreData): void {
  ensureDataDirectory();
  fs.writeFileSync(localFilePath, JSON.stringify(data, null, 2), 'utf-8');
}


export async function initDatabase(): Promise<void> {
  ensureDataDirectory();

  if (CONFIG.DATABASE_URL) {
    try {
      pool = new Pool({
        connectionString: CONFIG.DATABASE_URL,
        ssl: CONFIG.IS_PRODUCTION ? { rejectUnauthorized: false } : undefined
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS players (
          id UUID PRIMARY KEY,
          name VARCHAR(64) UNIQUE NOT NULL,
          total_matches INTEGER DEFAULT 0,
          total_kills INTEGER DEFAULT 0,
          total_deaths INTEGER DEFAULT 0,
          total_wins INTEGER DEFAULT 0,
          high_score INTEGER DEFAULT 0,
          total_walls_destroyed INTEGER DEFAULT 0,
          total_bonuses_collected INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_played_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS match_history (
          id UUID PRIMARY KEY,
          winner_name VARCHAR(64) NOT NULL,
          duration_seconds INTEGER NOT NULL,
          total_kills INTEGER NOT NULL,
          total_walls_destroyed INTEGER NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      return;
    } catch {
      pool = null;
    }
  }

  readLocalStore();
}

export async function savePlayerStats(name: string, stats: PlayerStats, won: boolean): Promise<PersistentPlayer> {
  const cleanName = name.trim().slice(0, 32) || 'CyberTank';
  const now = new Date().toISOString();

  if (pool) {
    try {
      const res = await pool.query(
        `
        INSERT INTO players (
          id, name, total_matches, total_kills, total_deaths, total_wins,
          high_score, total_walls_destroyed, total_bonuses_collected, last_played_at
        ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (name) DO UPDATE SET
          total_matches = players.total_matches + 1,
          total_kills = players.total_kills + EXCLUDED.total_kills,
          total_deaths = players.total_deaths + EXCLUDED.total_deaths,
          total_wins = players.total_wins + EXCLUDED.total_wins,
          high_score = GREATEST(players.high_score, EXCLUDED.high_score),
          total_walls_destroyed = players.total_walls_destroyed + EXCLUDED.total_walls_destroyed,
          total_bonuses_collected = players.total_bonuses_collected + EXCLUDED.total_bonuses_collected,
          last_played_at = NOW()
        RETURNING *;
      `,
        [
          uuidv4(),
          cleanName,
          stats.kills,
          stats.deaths,
          won ? 1 : 0,
          stats.score,
          stats.wallsDestroyed,
          stats.bonusesCollected
        ]
      );

      const row = res.rows[0];
      return {
        id: row.id,
        name: row.name,
        totalMatches: row.total_matches,
        totalKills: row.total_kills,
        totalDeaths: row.total_deaths,
        totalWins: row.total_wins,
        highScore: row.high_score,
        totalWallsDestroyed: row.total_walls_destroyed,
        totalBonusesCollected: row.total_bonuses_collected,
        createdAt: row.created_at,
        lastPlayedAt: row.last_played_at
      };
    } catch {
      // Fallback to local
    }
  }

  const store = readLocalStore();
  const existing = store.players[cleanName];

  if (existing) {
    existing.totalMatches += 1;
    existing.totalKills += stats.kills;
    existing.totalDeaths += stats.deaths;
    if (won) existing.totalWins += 1;
    existing.highScore = Math.max(existing.highScore, stats.score);
    existing.totalWallsDestroyed += stats.wallsDestroyed;
    existing.totalBonusesCollected += stats.bonusesCollected;
    existing.lastPlayedAt = now;
    writeLocalStore(store);
    return existing;
  }

  const newPlayer: PersistentPlayer = {
    id: uuidv4(),
    name: cleanName,
    totalMatches: 1,
    totalKills: stats.kills,
    totalDeaths: stats.deaths,
    totalWins: won ? 1 : 0,
    highScore: stats.score,
    totalWallsDestroyed: stats.wallsDestroyed,
    totalBonusesCollected: stats.bonusesCollected,
    createdAt: now,
    lastPlayedAt: now
  };

  store.players[cleanName] = newPlayer;
  writeLocalStore(store);
  return newPlayer;
}

export async function recordMatch(
  winnerName: string,
  durationSeconds: number,
  totalKills: number,
  totalWallsDestroyed: number
): Promise<PersistentMatch> {
  const match: PersistentMatch = {
    id: uuidv4(),
    winnerName,
    durationSeconds,
    totalKills,
    totalWallsDestroyed,
    createdAt: new Date().toISOString()
  };

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO match_history (id, winner_name, duration_seconds, total_kills, total_walls_destroyed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [match.id, match.winnerName, match.durationSeconds, match.totalKills, match.totalWallsDestroyed, match.createdAt]
      );
      return match;
    } catch {
      // Fallback
    }
  }

  const store = readLocalStore();
  store.matches.unshift(match);
  if (store.matches.length > 50) {
    store.matches = store.matches.slice(0, 50);
  }
  writeLocalStore(store);
  return match;
}

export async function getLeaderboard(limit = 10): Promise<PersistentPlayer[]> {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM players ORDER BY high_score DESC, total_wins DESC LIMIT $1`,
        [limit]
      );
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        totalMatches: row.total_matches,
        totalKills: row.total_kills,
        totalDeaths: row.total_deaths,
        totalWins: row.total_wins,
        highScore: row.high_score,
        totalWallsDestroyed: row.total_walls_destroyed,
        totalBonusesCollected: row.total_bonuses_collected,
        createdAt: row.created_at,
        lastPlayedAt: row.last_played_at
      }));
    } catch {
      // Fallback
    }
  }

  const store = readLocalStore();
  return Object.values(store.players)
    .sort((a, b) => b.highScore - a.highScore || b.totalWins - a.totalWins)
    .slice(0, limit);
}

export async function getRecentMatches(limit = 10): Promise<PersistentMatch[]> {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM match_history ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return res.rows.map((row) => ({
        id: row.id,
        winnerName: row.winner_name,
        durationSeconds: row.duration_seconds,
        totalKills: row.total_kills,
        totalWallsDestroyed: row.total_walls_destroyed,
        createdAt: row.created_at
      }));
    } catch {
      // Fallback
    }
  }

  const store = readLocalStore();
  return store.matches.slice(0, limit);
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
