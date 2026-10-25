export type Direction = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';

export type BonusType = 'SHIELD' | 'RAPID_FIRE' | 'SPEED_BOOST' | 'NUKE';

export type CellType = 0 | 1 | 2 | 3;

export interface Position {
  x: number;
  y: number;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  score: number;
  wallsDestroyed: number;
  bonusesCollected: number;
}

export interface Tank {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  direction: Direction;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  speed: number;
  bulletCooldownMs: number;
  lastShotAt: number;
  shieldUntil: number;
  speedUntil: number;
  rapidUntil: number;
  stats: PlayerStats;
  sessionId: string;
  isBot?: boolean;
}

export interface Bullet {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  damage: number;
  createdAt: number;
}

export interface BonusCrate {
  id: string;
  type: BonusType;
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

export interface GameMap {
  width: number;
  height: number;
  tileSize: number;
  grid: number[][];
}

export interface ConflictEvent {
  id: string;
  type: 'BONUS_PICKUP' | 'WALL_HIT' | 'TANK_COLLISION';
  timestamp: number;
  winnerPlayerId: string;
  loserPlayerId?: string;
  targetId: string;
  resolution: string;
}

export interface GameSnapshot {
  tick: number;
  timestamp: number;
  tanks: Tank[];
  bullets: Bullet[];
  bonuses: BonusCrate[];
  destroyedWalls: Position[];
  conflicts: ConflictEvent[];
}
