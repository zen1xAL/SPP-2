import { describe, it, expect } from 'vitest';
import { resolveBonusPickupConflict, resolveWallHitConflict, type BonusClaimant, type WallHitClaimant } from '../src/server/game/conflicts.js';
import type { BonusCrate, Bullet, Tank } from '../src/server/game/types.js';

function createMockTank(id: string, name: string): Tank {
  return {
    id,
    name,
    color: '#3b82f6',
    x: 100,
    y: 100,
    direction: 'UP',
    health: 3,
    maxHealth: 3,
    isAlive: true,
    speed: 130,
    bulletCooldownMs: 400,
    lastShotAt: 0,
    shieldUntil: 0,
    speedUntil: 0,
    rapidUntil: 0,
    sessionId: `sess-${id}`,
    stats: { kills: 0, deaths: 0, score: 0, wallsDestroyed: 0, bonusesCollected: 0 }
  };
}

describe('CyberTanks Conflict Resolution System', () => {
  it('resolves uncontested bonus crate pickup', () => {
    const crate: BonusCrate = {
      id: 'crate-1',
      type: 'SHIELD',
      x: 100,
      y: 100,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000
    };
    const tank = createMockTank('tank-1', 'Alpha');
    const claimants: BonusClaimant[] = [{ tank, crate, distance: 5, timestamp: Date.now() }];

    const result = resolveBonusPickupConflict(crate, claimants);
    expect(result).not.toBeNull();
    expect(result?.winner.id).toBe('tank-1');
    expect(result?.losers).toHaveLength(0);
    expect(result?.event.type).toBe('BONUS_PICKUP');
    expect(result?.event.resolution).toContain('UNCONTESTED_ACQUISITION');
  });

  it('resolves concurrent bonus pickup conflict by closest distance and timestamp', () => {
    const crate: BonusCrate = {
      id: 'crate-conflict',
      type: 'SPEED_BOOST',
      x: 200,
      y: 200,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000
    };
    const tankA = createMockTank('tank-A', 'Bravo');
    const tankB = createMockTank('tank-B', 'Charlie');

    const claimants: BonusClaimant[] = [
      { tank: tankB, crate, distance: 12.5, timestamp: 1005 },
      { tank: tankA, crate, distance: 8.2, timestamp: 1000 }
    ];

    const result = resolveBonusPickupConflict(crate, claimants);
    expect(result).not.toBeNull();
    expect(result?.winner.id).toBe('tank-A');
    expect(result?.losers).toHaveLength(1);
    expect(result?.losers[0].id).toBe('tank-B');
    expect(result?.event.winnerPlayerId).toBe('tank-A');
    expect(result?.event.loserPlayerId).toBe('tank-B');
    expect(result?.event.resolution).toContain('CONCURRENT_RESOLVED_DISTANCE_TICK');
  });

  it('resolves concurrent wall hit conflict awarding destruction to earliest bullet', () => {
    const bullet1: Bullet = {
      id: 'b-1',
      ownerId: 'tank-1',
      x: 120,
      y: 80,
      vx: 300,
      vy: 0,
      direction: 'RIGHT',
      damage: 1,
      createdAt: 1000
    };
    const bullet2: Bullet = {
      id: 'b-2',
      ownerId: 'tank-2',
      x: 160,
      y: 80,
      vx: -300,
      vy: 0,
      direction: 'LEFT',
      damage: 1,
      createdAt: 1025
    };

    const claimants: WallHitClaimant[] = [
      { bullet: bullet2, tileX: 3, tileY: 2, timestamp: bullet2.createdAt },
      { bullet: bullet1, tileX: 3, tileY: 2, timestamp: bullet1.createdAt }
    ];

    const result = resolveWallHitConflict(3, 2, claimants);
    expect(result).not.toBeNull();
    expect(result?.winnerBullet.id).toBe('b-1');
    expect(result?.otherBullets).toHaveLength(1);
    expect(result?.event.winnerPlayerId).toBe('tank-1');
    expect(result?.event.loserPlayerId).toBe('tank-2');
    expect(result?.event.resolution).toContain('CONCURRENT_WALL_BREACH_TIMESTAMP');
  });
});
