import type { WebSocket } from 'ws';
import { CONFIG } from '../config.js';
import { savePlayerStats } from '../db.js';
import type { Direction, Position, Tank } from './types.js';
import { getSpawnPositions } from './map.js';
import { checkAABB, getTankBox, moveWithSlide } from './physics.js';
import {
  COMBAT_CONFIG,
  DIRECTION_VECTORS,
  SCORE_VALUES,
  TANK_PALETTE
} from './constants.js';

export interface PlayerInputState {
  direction: Direction;
  isMoving: boolean;
  sequence: number;
}

export class PlayerManager {
  private tanks = new Map<string, Tank>();
  private inputStates = new Map<string, PlayerInputState>();
  private sockets = new Map<string, WebSocket>();
  private sessionToPlayerId = new Map<string, string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();

  public findSafeSpawn(excludeTankId?: string): Position {
    const spawns = getSpawnPositions();
    const aliveTanks = Array.from(this.tanks.values()).filter(
      (t) => t.isAlive && t.id !== excludeTankId
    );

    const safeSpawns = spawns.filter((s) => {
      const spawnBox = getTankBox(s.x, s.y);
      return !aliveTanks.some((t) => checkAABB(spawnBox, getTankBox(t.x, t.y)));
    });

    if (safeSpawns.length > 0) {
      return safeSpawns[Math.floor(Math.random() * safeSpawns.length)];
    }

    if (aliveTanks.length === 0) {
      return spawns[0];
    }

    return spawns.reduce((best, candidate) => {
      const distToClosest = aliveTanks.reduce(
        (min, t) => Math.min(min, Math.hypot(t.x - candidate.x, t.y - candidate.y)),
        Infinity
      );
      const bestDist = aliveTanks.reduce(
        (min, t) => Math.min(min, Math.hypot(t.x - best.x, t.y - best.y)),
        Infinity
      );
      return distToClosest > bestDist ? candidate : best;
    }, spawns[0]);
  }

  public addPlayer(
    id: string,
    name: string,
    color: string,
    sessionId: string,
    ws: WebSocket
  ): Tank {
    const existingPlayerId = this.sessionToPlayerId.get(sessionId);
    if (existingPlayerId && this.tanks.has(existingPlayerId)) {
      const existing = this.tanks.get(existingPlayerId)!;
      this.replaceSocket(existing.id, ws);
      this.cancelDisconnectTimer(existing.id);
      return existing;
    }

    const spawn = this.findSafeSpawn(id);
    const spawnIndex = this.tanks.size % TANK_PALETTE.length;
    const cleanName =
      name.trim().slice(0, COMBAT_CONFIG.MAX_NAME_LENGTH) || `Tank-${id.slice(0, 4)}`;

    const tank: Tank = {
      id,
      name: cleanName,
      color: color || TANK_PALETTE[spawnIndex],
      x: spawn.x,
      y: spawn.y,
      direction: 'UP',
      health: 3,
      maxHealth: 3,
      isAlive: true,
      speed: CONFIG.TANK_SPEED,
      bulletCooldownMs: CONFIG.BULLET_COOLDOWN_MS,
      lastShotAt: 0,
      shieldUntil: 0,
      speedUntil: 0,
      rapidUntil: 0,
      sessionId,
      stats: {
        kills: 0,
        deaths: 0,
        score: 0,
        wallsDestroyed: 0,
        bonusesCollected: 0
      }
    };

    this.tanks.set(id, tank);
    this.sockets.set(id, ws);
    this.sessionToPlayerId.set(sessionId, id);
    this.inputStates.set(id, { direction: 'UP', isMoving: false, sequence: 0 });

    return tank;
  }

  private replaceSocket(playerId: string, newWs: WebSocket): void {
    const oldWs = this.sockets.get(playerId);
    if (oldWs && oldWs !== newWs && oldWs.readyState === oldWs.OPEN) {
      try {
        oldWs.close();
      } catch {}
    }
    this.sockets.set(playerId, newWs);
  }

  private cancelDisconnectTimer(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  public disconnectPlayer(id: string, socket?: WebSocket): void {
    const currentSocket = this.sockets.get(id);
    if (socket && currentSocket && currentSocket !== socket) {
      return;
    }
    this.sockets.delete(id);
    const tank = this.tanks.get(id);
    if (tank) {
      tank.shieldUntil = Date.now() + COMBAT_CONFIG.DISCONNECT_GRACE_PERIOD_MS;
    }
    const timer = setTimeout(() => {
      this.removePlayer(id);
      this.disconnectTimers.delete(id);
    }, COMBAT_CONFIG.DISCONNECT_GRACE_PERIOD_MS);
    this.disconnectTimers.set(id, timer);
  }

  public reconnectPlayer(sessionId: string, ws: WebSocket): Tank | null {
    const playerId = this.sessionToPlayerId.get(sessionId);
    if (!playerId) return null;

    const tank = this.tanks.get(playerId);
    if (!tank) return null;

    this.cancelDisconnectTimer(playerId);
    this.replaceSocket(playerId, ws);
    return tank;
  }

  public removePlayer(id: string): void {
    const tank = this.tanks.get(id);
    if (tank) {
      savePlayerStats(tank.name, tank.stats, false).catch(() => {});
      this.sessionToPlayerId.delete(tank.sessionId);
    }
    this.cancelDisconnectTimer(id);
    this.tanks.delete(id);
    this.sockets.delete(id);
    this.inputStates.delete(id);
  }

  public handleInput(
    id: string,
    direction: Direction,
    isMoving: boolean,
    sequence: number
  ): void {
    const tank = this.tanks.get(id);
    if (!tank || !tank.isAlive) return;

    this.inputStates.set(id, { direction, isMoving, sequence });
    tank.direction = direction;
  }

  public updatePositions(dt: number, grid: number[][]): void {
    const now = Date.now();
    const allTanks = Array.from(this.tanks.values());

    for (const tank of allTanks) {
      if (!tank.isAlive) continue;

      const input = this.inputStates.get(tank.id);
      if (!input || !input.isMoving) continue;

      const speedMultiplier =
        tank.speedUntil > now ? CONFIG.SPEED_BOOST_MULTIPLIER : 1.0;
      const currentSpeed = tank.speed * speedMultiplier;
      const dirVec = DIRECTION_VECTORS[input.direction];
      const deltaX = dirVec.x * currentSpeed * dt;
      const deltaY = dirVec.y * currentSpeed * dt;

      const nextPos = moveWithSlide(
        tank.x,
        tank.y,
        deltaX,
        deltaY,
        grid,
        tank.id,
        allTanks
      );
      tank.x = nextPos.x;
      tank.y = nextPos.y;
    }
  }

  public respawnTank(id: string): void {
    const tank = this.tanks.get(id);
    if (!tank) return;

    const spawn = this.findSafeSpawn(id);
    tank.x = spawn.x;
    tank.y = spawn.y;
    tank.health = tank.maxHealth;
    tank.isAlive = true;
    tank.shieldUntil = Date.now() + COMBAT_CONFIG.RESPAWN_SHIELD_MS;
  }

  public awardKill(killerId: string): Tank | undefined {
    const killer = this.tanks.get(killerId);
    if (killer) {
      killer.stats.kills += 1;
      killer.stats.score += SCORE_VALUES.KILL;
      if (!killer.sessionId.startsWith('bot-')) {
        savePlayerStats(killer.name, killer.stats, false).catch(() => {});
      }
    }
    return killer;
  }

  public recordDeath(victimId: string): void {
    const victim = this.tanks.get(victimId);
    if (victim) {
      victim.stats.deaths += 1;
      victim.isAlive = false;
      if (!victim.sessionId.startsWith('bot-')) {
        savePlayerStats(victim.name, victim.stats, false).catch(() => {});
      }
      setTimeout(() => this.respawnTank(victimId), COMBAT_CONFIG.RESPAWN_DELAY_MS);
    }
  }

  public awardWallDestroy(tankId: string): void {
    const tank = this.tanks.get(tankId);
    if (tank) {
      tank.stats.wallsDestroyed += 1;
      tank.stats.score += SCORE_VALUES.WALL_DESTROY;
    }
  }

  public awardBonusCollected(tankId: string): void {
    const tank = this.tanks.get(tankId);
    if (tank) {
      tank.stats.bonusesCollected += 1;
      tank.stats.score += SCORE_VALUES.BONUS_COLLECT;
    }
  }

  public async flushStats(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const tank of this.tanks.values()) {
      if (!tank.sessionId.startsWith('bot-')) {
        promises.push(savePlayerStats(tank.name, tank.stats, false));
      }
    }
    await Promise.allSettled(promises);
  }

  public getTank(id: string): Tank | undefined {
    return this.tanks.get(id);
  }

  public getAllTanks(): Tank[] {
    return Array.from(this.tanks.values());
  }

  public getSockets(): Map<string, WebSocket> {
    return this.sockets;
  }

  public destroy(): void {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
    for (const tank of this.tanks.values()) {
      savePlayerStats(tank.name, tank.stats, false).catch(() => {});
    }
    this.tanks.clear();
    this.sockets.clear();
    this.inputStates.clear();
    this.sessionToPlayerId.clear();
  }
}
