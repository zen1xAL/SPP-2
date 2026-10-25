import { v4 as uuidv4 } from 'uuid';
import type { BonusCrate, Bullet, ConflictEvent, Tank } from './types.js';

export interface BonusClaimant {
  tank: Tank;
  crate: BonusCrate;
  distance: number;
  timestamp: number;
}

export interface WallHitClaimant {
  bullet: Bullet;
  tileX: number;
  tileY: number;
  timestamp: number;
}

export function resolveBonusPickupConflict(
  crate: BonusCrate,
  claimants: BonusClaimant[]
): { winner: Tank; losers: Tank[]; event: ConflictEvent } | null {
  if (claimants.length === 0) return null;

  if (claimants.length === 1) {
    const single = claimants[0];
    const event: ConflictEvent = {
      id: uuidv4(),
      type: 'BONUS_PICKUP',
      timestamp: Date.now(),
      winnerPlayerId: single.tank.id,
      targetId: crate.id,
      resolution: 'UNCONTESTED_ACQUISITION'
    };
    return { winner: single.tank, losers: [], event };
  }

  claimants.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.timestamp - b.timestamp;
  });

  const winner = claimants[0].tank;
  const losers = claimants.slice(1).map((c) => c.tank);

  const event: ConflictEvent = {
    id: uuidv4(),
    type: 'BONUS_PICKUP',
    timestamp: Date.now(),
    winnerPlayerId: winner.id,
    loserPlayerId: losers[0]?.id,
    targetId: crate.id,
    resolution: `CONCURRENT_RESOLVED_DISTANCE_TICK (Winner: ${winner.name}, Losers: ${losers.map((l) => l.name).join(', ')})`
  };

  return { winner, losers, event };
}

export function resolveWallHitConflict(
  tileX: number,
  tileY: number,
  claimants: WallHitClaimant[]
): { winnerBullet: Bullet; otherBullets: Bullet[]; event: ConflictEvent } | null {
  if (claimants.length === 0) return null;

  if (claimants.length === 1) {
    const single = claimants[0];
    const event: ConflictEvent = {
      id: uuidv4(),
      type: 'WALL_HIT',
      timestamp: Date.now(),
      winnerPlayerId: single.bullet.ownerId,
      targetId: `${tileX},${tileY}`,
      resolution: 'SINGLE_WALL_BREACH'
    };
    return { winnerBullet: single.bullet, otherBullets: [], event };
  }

  claimants.sort((a, b) => a.timestamp - b.timestamp);

  const winner = claimants[0].bullet;
  const others = claimants.slice(1).map((c) => c.bullet);

  const event: ConflictEvent = {
    id: uuidv4(),
    type: 'WALL_HIT',
    timestamp: Date.now(),
    winnerPlayerId: winner.ownerId,
    loserPlayerId: others[0]?.ownerId,
    targetId: `${tileX},${tileY}`,
    resolution: `CONCURRENT_WALL_BREACH_TIMESTAMP (First bullet by ${winner.ownerId})`
  };

  return { winnerBullet: winner, otherBullets: others, event };
}
