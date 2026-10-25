import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  TICK_RATE: 30,
  TICK_INTERVAL_MS: Math.floor(1000 / 30),
  MAP_WIDTH: 19,
  MAP_HEIGHT: 15,
  TILE_SIZE: 40,
  TANK_SIZE: 30,
  TANK_SPEED: 130,
  BULLET_SPEED: 320,
  BULLET_SIZE: 6,
  BULLET_COOLDOWN_MS: 400,
  RAPID_COOLDOWN_MS: 200,
  SPEED_BOOST_MULTIPLIER: 1.45,
  BONUS_DURATION_MS: 9000,
  BONUS_LIFETIME_MS: 18000,
  BONUS_SPAWN_INTERVAL_MS: 10000,
  MAX_ACTIVE_BONUSES: 6,
  MAX_PLAYERS_PER_ROOM: 8,
  BOT_FILL_TARGET: 2,
  DATABASE_URL: process.env.DATABASE_URL || '',
  DATA_DIR: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
  IS_PRODUCTION: process.env.NODE_ENV === 'production'
};
