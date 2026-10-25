import { describe, it, expect } from 'vitest';
import { createStandardMap, destroyWall, getSpawnPositions } from '../src/server/game/map.js';
import {
  checkAABB,
  checkWallCollision,
  getTankBox,
  getTileBox,
  moveWithSlide
} from '../src/server/game/physics.js';
import { CONFIG } from '../src/server/config.js';

describe('CyberTanks Map and Physics System', () => {
  it('creates standard map with perimeter walls and tactical corridors', () => {
    const map = createStandardMap();
    expect(map.width).toBe(CONFIG.MAP_WIDTH);
    expect(map.height).toBe(CONFIG.MAP_HEIGHT);

    for (let x = 0; x < map.width; x++) {
      expect(map.grid[0][x]).toBe(1);
      expect(map.grid[map.height - 1][x]).toBe(1);
    }
    for (let y = 0; y < map.height; y++) {
      expect(map.grid[y][0]).toBe(1);
      expect(map.grid[y][map.width - 1]).toBe(1);
    }
  });

  it('destroys destructible brick wall and ignores steel wall', () => {
    const map = createStandardMap();

    expect(destroyWall(map.grid, 0, 0)).toBe(false);
    expect(map.grid[0][0]).toBe(1);

    map.grid[3][3] = 2;
    expect(destroyWall(map.grid, 3, 3)).toBe(true);
    expect(map.grid[3][3]).toBe(0);
  });

  it('generates valid spawn positions inside the arena', () => {
    const spawns = getSpawnPositions();
    expect(spawns.length).toBeGreaterThanOrEqual(4);

    for (const s of spawns) {
      expect(s.x).toBeGreaterThan(CONFIG.TILE_SIZE);
      expect(s.x).toBeLessThan((CONFIG.MAP_WIDTH - 1) * CONFIG.TILE_SIZE);
      expect(s.y).toBeGreaterThan(CONFIG.TILE_SIZE);
      expect(s.y).toBeLessThan((CONFIG.MAP_HEIGHT - 1) * CONFIG.TILE_SIZE);
    }
  });

  it('correctly detects AABB collisions and wall sliding', () => {
    const box1 = getTankBox(100, 100, 30);
    const box2 = getTankBox(120, 100, 30);
    const box3 = getTankBox(200, 200, 30);

    expect(checkAABB(box1, box2)).toBe(true);
    expect(checkAABB(box1, box3)).toBe(false);

    const map = createStandardMap();
    const startX = 60;
    const startY = 60;

    const nextPos = moveWithSlide(startX, startY, 5, 0, map.grid, 'my-tank', []);
    expect(nextPos.x).toBe(65);
    expect(nextPos.y).toBe(60);
  });

  it('allows overlapping tanks to move apart and unstick', () => {
    const map = createStandardMap();
    const otherTank = {
      id: 'other',
      name: 'Other',
      color: '#ef4444',
      x: 100,
      y: 100,
      direction: 'UP' as const,
      health: 3,
      maxHealth: 3,
      isAlive: true,
      speed: 130,
      bulletCooldownMs: 400,
      lastShotAt: 0,
      shieldUntil: 0,
      speedUntil: 0,
      rapidUntil: 0,
      sessionId: 's-other',
      stats: { kills: 0, deaths: 0, score: 0, wallsDestroyed: 0, bonusesCollected: 0 }
    };

    // Tank starts overlapping with otherTank at (105, 100)
    const myStartX = 105;
    const myStartY = 100;

    // Moving right (away from otherTank at x=100) must succeed!
    const moveAway = moveWithSlide(myStartX, myStartY, 5, 0, map.grid, 'my-tank', [otherTank]);
    expect(moveAway.x).toBe(110);

    // Moving left (further into otherTank) must be blocked!
    const moveCloser = moveWithSlide(myStartX, myStartY, -5, 0, map.grid, 'my-tank', [otherTank]);
    expect(moveCloser.x).toBe(105);
  });
});
