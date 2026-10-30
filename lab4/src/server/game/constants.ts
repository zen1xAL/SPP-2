import type { BonusType, Direction, Position } from './types.js';

export const DIRECTION_VECTORS: Readonly<Record<Direction, Position>> = {
  UP: { x: 0, y: -1 },
  RIGHT: { x: 1, y: 0 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 }
};

export const SCORE_VALUES = {
  KILL: 100,
  WALL_DESTROY: 15,
  BONUS_COLLECT: 30
} as const;

export const COMBAT_CONFIG = {
  CRATE_HALF_SIZE: 14,
  RESPAWN_DELAY_MS: 3000,
  RESPAWN_SHIELD_MS: 2500,
  DISCONNECT_GRACE_PERIOD_MS: 30000,
  RECENT_CONFLICTS_LIMIT: 20,
  SNAPSHOT_CONFLICTS_LIMIT: 5,
  WALL_BONUS_DROP_CHANCE: 0.35,
  MAX_NAME_LENGTH: 16
} as const;

export const TANK_PALETTE: readonly string[] = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4'
];

export const BONUS_TYPES: readonly BonusType[] = [
  'SHIELD',
  'SPEED_BOOST',
  'RAPID_FIRE',
  'NUKE'
];
