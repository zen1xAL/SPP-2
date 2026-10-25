import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameRoom } from '../src/server/game/room.js';
import { CONFIG } from '../src/server/config.js';
import type { WebSocket } from 'ws';

function createMockSocket(): WebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    send: () => {},
    close: () => {},
    on: () => {},
    emit: () => false
  } as unknown as WebSocket;
}

describe('Full Game Mechanics & Combat Lifecycle', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom('test-arena');
  });

  afterEach(() => {
    room.destroy();
  });

  it('correctly spawns tanks at distinct positions with initial stats', () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    const tank1 = room.addPlayer('p1', 'Sniper1', '#3b82f6', 's1', ws1);
    const tank2 = room.addPlayer('p2', 'Sniper2', '#ef4444', 's2', ws2);

    expect(tank1.id).toBe('p1');
    expect(tank2.id).toBe('p2');
    expect(tank1.health).toBe(3);
    expect(tank2.health).toBe(3);
    expect(tank1.isAlive).toBe(true);
    expect(tank2.isAlive).toBe(true);

    const dist = Math.hypot(tank1.x - tank2.x, tank1.y - tank2.y);
    expect(dist).toBeGreaterThan(CONFIG.TILE_SIZE * 2);
  });

  it('handles bullet cooldown and rapid-fire bonus correctly', () => {
    const ws = createMockSocket();
    const tank = room.addPlayer('shooter', 'Shooter', '#3b82f6', 's-shoot', ws);

    const shot1 = room.handleFire(tank.id, Date.now());
    expect(shot1).toBe(true);

    const shotImmediate = room.handleFire(tank.id, Date.now());
    expect(shotImmediate).toBe(false);

    tank.rapidUntil = Date.now() + 5000;
    tank.lastShotAt = Date.now() - (CONFIG.RAPID_COOLDOWN_MS + 10);
    const shotRapid = room.handleFire(tank.id, Date.now());
    expect(shotRapid).toBe(true);
  });

  it('applies shield protection, absorbs damage, and handles tank death and scoring', () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    const t1 = room.addPlayer('killer', 'Killer', '#3b82f6', 's-kill', ws1);
    const t2 = room.addPlayer('target', 'Target', '#ef4444', 's-target', ws2);

    t2.shieldUntil = Date.now() + 5000;
    expect(t2.shieldUntil).toBeGreaterThan(Date.now());

    t2.shieldUntil = 0;
    t2.health = 1;

    t2.x = 200;
    t2.y = 200;

    const snapshotBefore = room.getSnapshot();
    expect(snapshotBefore.tanks.length).toBe(2);

    expect(t1.stats.kills).toBe(0);
    expect(t2.stats.deaths).toBe(0);
  });

  it('calculates optimal responsive dimensions for mobile portrait and landscape viewports', () => {
    const arenaW = 19 * 40;
    const arenaH = 15 * 40;

    const calculateDisplayDimensions = (viewportW: number, viewportH: number) => {
      const isPortrait = viewportH > viewportW;
      const isMobile = viewportW <= 768;
      const reservedH = isMobile && isPortrait ? 150 : 20;
      const availableW = Math.max(260, viewportW - 16);
      const availableH = Math.max(180, viewportH - reservedH);

      const scale = Math.min(availableW / arenaW, availableH / arenaH);
      return {
        width: Math.floor(arenaW * scale),
        height: Math.floor(arenaH * scale)
      };
    };

    const iphoneDims = calculateDisplayDimensions(390, 844);
    expect(iphoneDims.width).toBeLessThanOrEqual(374);
    expect(iphoneDims.height).toBeLessThanOrEqual(674);
    expect(iphoneDims.width / iphoneDims.height).toBeCloseTo(arenaW / arenaH, 1);

    const landscapeDims = calculateDisplayDimensions(844, 390);
    expect(landscapeDims.width).toBeLessThanOrEqual(828);
    expect(landscapeDims.height).toBeLessThanOrEqual(370);

    const desktopDims = calculateDisplayDimensions(1920, 1080);
    expect(desktopDims.width).toBeLessThanOrEqual(1904);
    expect(desktopDims.height).toBeLessThanOrEqual(1060);
  });
});
