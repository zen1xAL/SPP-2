import { v4 as uuidv4 } from 'uuid';
import type { WebSocket } from 'ws';
import { CONFIG } from '../config.js';
import { savePlayerStats, recordMatch } from '../db.js';
import {
  type BonusCrate,
  type BonusType,
  type Bullet,
  type ConflictEvent,
  type Direction,
  type GameMap,
  type GameSnapshot,
  type Position,
  type Tank
} from './types.js';
import { createStandardMap, destroyWall, getSpawnPositions } from './map.js';
import {
  checkAABB,
  getDirectionVector,
  getTankBox,
  getTileBox,
  moveWithSlide
} from './physics.js';
import {
  type BonusClaimant,
  type WallHitClaimant,
  resolveBonusPickupConflict,
  resolveWallHitConflict
} from './conflicts.js';
import type { ServerMessage } from '../ws/protocol.js';

interface PlayerInputState {
  direction: Direction;
  isMoving: boolean;
  sequence: number;
}

const TANK_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

export class GameRoom {
  public readonly id: string;
  public readonly map: GameMap;
  private tanks = new Map<string, Tank>();
  private inputStates = new Map<string, PlayerInputState>();
  private sockets = new Map<string, WebSocket>();
  private sessionToPlayerId = new Map<string, string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private bullets: Bullet[] = [];
  private bonuses: BonusCrate[] = [];
  private destroyedWalls: Position[] = [];
  private recentConflicts: ConflictEvent[] = [];
  private tickInterval: NodeJS.Timeout | null = null;
  private tick = 0;
  private lastBonusSpawnAt = Date.now();
  private matchStartedAt = Date.now();
  private totalMatchKills = 0;
  private totalMatchWalls = 0;

  constructor(id: string) {
    this.id = id;
    this.map = createStandardMap();
    this.startLoop();
  }

  private startLoop(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      this.update(1 / CONFIG.TICK_RATE);
    }, CONFIG.TICK_INTERVAL_MS);
  }

  public stopLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public addPlayer(id: string, name: string, color: string, sessionId: string, ws: WebSocket): Tank {
    const existingPlayerId = this.sessionToPlayerId.get(sessionId);
    if (existingPlayerId && this.tanks.has(existingPlayerId)) {
      const existing = this.tanks.get(existingPlayerId)!;
      const oldWs = this.sockets.get(existing.id);
      if (oldWs && oldWs !== ws && oldWs.readyState === oldWs.OPEN) {
        try { oldWs.close(); } catch {}
      }
      this.sockets.set(existing.id, ws);
      const timer = this.disconnectTimers.get(existing.id);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(existing.id);
      }
      return existing;
    }

    const spawns = getSpawnPositions();
    const spawnIndex = this.tanks.size % spawns.length;
    const spawn = spawns[spawnIndex];

    const tank: Tank = {
      id,
      name: name.trim().slice(0, 16) || `Tank-${id.slice(0, 4)}`,
      color: color || TANK_COLORS[spawnIndex % TANK_COLORS.length],
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

  public disconnectPlayer(id: string, socket?: WebSocket): void {
    const currentSocket = this.sockets.get(id);
    if (socket && currentSocket && currentSocket !== socket) {
      return;
    }
    this.sockets.delete(id);
    const tank = this.tanks.get(id);
    if (tank) {
      tank.shieldUntil = Date.now() + 30000;
    }
    const timer = setTimeout(() => {
      this.removePlayer(id);
      this.disconnectTimers.delete(id);
    }, 30000);
    this.disconnectTimers.set(id, timer);
  }

  public reconnectPlayer(sessionId: string, ws: WebSocket): Tank | null {
    const playerId = this.sessionToPlayerId.get(sessionId);
    if (!playerId) return null;

    const tank = this.tanks.get(playerId);
    if (!tank) return null;

    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }

    const oldWs = this.sockets.get(playerId);
    if (oldWs && oldWs !== ws && oldWs.readyState === oldWs.OPEN) {
      try { oldWs.close(); } catch {}
    }

    this.sockets.set(playerId, ws);
    return tank;
  }

  public removePlayer(id: string): void {
    const tank = this.tanks.get(id);
    if (tank) {
      savePlayerStats(tank.name, tank.stats, false).catch(() => {});
      this.sessionToPlayerId.delete(tank.sessionId);
    }
    const timer = this.disconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(id);
    }
    this.tanks.delete(id);
    this.sockets.delete(id);
    this.inputStates.delete(id);
  }

  public handleInput(id: string, direction: Direction, isMoving: boolean, sequence: number): void {
    const tank = this.tanks.get(id);
    if (!tank || !tank.isAlive) return;

    this.inputStates.set(id, { direction, isMoving, sequence });
    tank.direction = direction;
  }

  public handleFire(id: string, timestamp: number): boolean {
    const tank = this.tanks.get(id);
    if (!tank || !tank.isAlive) return false;

    const now = Date.now();
    const cooldown = tank.rapidUntil > now ? CONFIG.RAPID_COOLDOWN_MS : tank.bulletCooldownMs;

    if (now - tank.lastShotAt < cooldown) {
      return false;
    }

    tank.lastShotAt = now;
    const dirVec = getDirectionVector(tank.direction);
    const spawnDist = CONFIG.TANK_SIZE / 2 + CONFIG.BULLET_SIZE + 2;

    const bullet: Bullet = {
      id: uuidv4(),
      ownerId: tank.id,
      x: tank.x + dirVec.x * spawnDist,
      y: tank.y + dirVec.y * spawnDist,
      vx: dirVec.x * CONFIG.BULLET_SPEED,
      vy: dirVec.y * CONFIG.BULLET_SPEED,
      direction: tank.direction,
      damage: 1,
      createdAt: timestamp || now
    };

    this.bullets.push(bullet);
    return true;
  }

  private update(dt: number): void {
    this.tick += 1;
    const now = Date.now();
    const allTanks = Array.from(this.tanks.values());

    for (const tank of allTanks) {
      if (!tank.isAlive) continue;

      const input = this.inputStates.get(tank.id);
      if (input && input.isMoving) {
        const speedMultiplier = tank.speedUntil > now ? CONFIG.SPEED_BOOST_MULTIPLIER : 1.0;
        const currentSpeed = tank.speed * speedMultiplier;
        const dirVec = getDirectionVector(input.direction);
        const deltaX = dirVec.x * currentSpeed * dt;
        const deltaY = dirVec.y * currentSpeed * dt;

        const nextPos = moveWithSlide(tank.x, tank.y, deltaX, deltaY, this.map.grid, tank.id, allTanks);
        tank.x = nextPos.x;
        tank.y = nextPos.y;
      }
    }

    const remainingBullets: Bullet[] = [];
    const wallHitMap = new Map<string, WallHitClaimant[]>();

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      const ts = CONFIG.TILE_SIZE;
      const tileX = Math.floor(bullet.x / ts);
      const tileY = Math.floor(bullet.y / ts);

      if (tileX < 0 || tileX >= this.map.width || tileY < 0 || tileY >= this.map.height) {
        continue;
      }

      const cell = this.map.grid[tileY][tileX];

      if (cell === 1) {
        continue;
      }

      if (cell === 2) {
        const key = `${tileX},${tileY}`;
        const claimant: WallHitClaimant = { bullet, tileX, tileY, timestamp: bullet.createdAt };
        const existing = wallHitMap.get(key) || [];
        existing.push(claimant);
        wallHitMap.set(key, existing);
        continue;
      }

      let hitTank = false;
      const bulletBox = {
        left: bullet.x - CONFIG.BULLET_SIZE,
        right: bullet.x + CONFIG.BULLET_SIZE,
        top: bullet.y - CONFIG.BULLET_SIZE,
        bottom: bullet.y + CONFIG.BULLET_SIZE
      };

      for (const tank of allTanks) {
        if (!tank.isAlive || tank.id === bullet.ownerId) continue;
        const tankBox = getTankBox(tank.x, tank.y);

        if (checkAABB(bulletBox, tankBox)) {
          hitTank = true;
          if (tank.shieldUntil <= now) {
            tank.health -= bullet.damage;
            if (tank.health <= 0) {
              tank.isAlive = false;
              tank.stats.deaths += 1;

              const killer = this.tanks.get(bullet.ownerId);
              if (killer) {
                killer.stats.kills += 1;
                killer.stats.score += 100;
                this.totalMatchKills += 1;
                this.broadcastKill(killer.id, killer.name, tank.id, tank.name);
              }

              setTimeout(() => this.respawnTank(tank.id), 3000);
            }
          }
          break;
        }
      }

      if (!hitTank) {
        remainingBullets.push(bullet);
      }
    }

    for (const [key, claimants] of wallHitMap.entries()) {
      const [txStr, tyStr] = key.split(',');
      const tx = parseInt(txStr, 10);
      const ty = parseInt(tyStr, 10);

      const conflictResult = resolveWallHitConflict(tx, ty, claimants);
      if (conflictResult) {
        destroyWall(this.map.grid, tx, ty);
        this.destroyedWalls.push({ x: tx, y: ty });
        this.totalMatchWalls += 1;

        const killerTank = this.tanks.get(conflictResult.winnerBullet.ownerId);
        if (killerTank) {
          killerTank.stats.wallsDestroyed += 1;
          killerTank.stats.score += 15;
        }

        if (Math.random() < 0.35 && this.bonuses.length < CONFIG.MAX_PLAYERS_PER_ROOM) {
          this.spawnBonusAt(tx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2, ty * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
        }

        if (claimants.length > 1) {
          this.recentConflicts.push(conflictResult.event);
          this.broadcastConflict(conflictResult.event);
        }
      }
    }

    this.bullets = remainingBullets;

    if (now - this.lastBonusSpawnAt > CONFIG.BONUS_SPAWN_INTERVAL_MS && this.bonuses.length < CONFIG.MAX_ACTIVE_BONUSES) {
      this.lastBonusSpawnAt = now;
      this.spawnRandomBonus();
    }

    const remainingBonuses: BonusCrate[] = [];
    const bonusClaimMap = new Map<string, BonusClaimant[]>();

    for (const crate of this.bonuses) {
      if (crate.expiresAt <= now) continue;

      const crateBox = {
        left: crate.x - 14,
        right: crate.x + 14,
        top: crate.y - 14,
        bottom: crate.y + 14
      };

      for (const tank of allTanks) {
        if (!tank.isAlive) continue;
        const tankBox = getTankBox(tank.x, tank.y);

        if (checkAABB(crateBox, tankBox)) {
          const dist = Math.hypot(tank.x - crate.x, tank.y - crate.y);
          const claimant: BonusClaimant = { tank, crate, distance: dist, timestamp: now };
          const existing = bonusClaimMap.get(crate.id) || [];
          existing.push(claimant);
          bonusClaimMap.set(crate.id, existing);
        }
      }

      if (!bonusClaimMap.has(crate.id)) {
        remainingBonuses.push(crate);
      }
    }

    for (const [crateId, claimants] of bonusClaimMap.entries()) {
      const crate = this.bonuses.find((b) => b.id === crateId);
      if (!crate) continue;

      const res = resolveBonusPickupConflict(crate, claimants);
      if (res) {
        this.applyBonusToTank(res.winner, crate.type);
        res.winner.stats.bonusesCollected += 1;
        res.winner.stats.score += 30;

        if (claimants.length > 1) {
          this.recentConflicts.push(res.event);
          this.broadcastConflict(res.event);
        }
      }
    }

    this.bonuses = remainingBonuses;

    if (this.recentConflicts.length > 20) {
      this.recentConflicts = this.recentConflicts.slice(-20);
    }

    this.broadcastState();
  }

  private applyBonusToTank(tank: Tank, type: BonusType): void {
    const now = Date.now();
    switch (type) {
      case 'SHIELD':
        tank.shieldUntil = now + CONFIG.BONUS_DURATION_MS;
        break;
      case 'SPEED_BOOST':
        tank.speedUntil = now + CONFIG.BONUS_DURATION_MS;
        break;
      case 'RAPID_FIRE':
        tank.rapidUntil = now + CONFIG.BONUS_DURATION_MS;
        break;
      case 'NUKE':
        this.bullets = this.bullets.filter((b) => b.ownerId === tank.id);
        break;
    }
  }

  private spawnRandomBonus(): void {
    const emptyCells: Position[] = [];
    for (let y = 1; y < this.map.height - 1; y++) {
      for (let x = 1; x < this.map.width - 1; x++) {
        if (this.map.grid[y][x] === 0) {
          emptyCells.push({ x, y });
        }
      }
    }

    if (emptyCells.length === 0) return;
    const chosen = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const ts = CONFIG.TILE_SIZE;
    this.spawnBonusAt(chosen.x * ts + ts / 2, chosen.y * ts + ts / 2);
  }

  private spawnBonusAt(x: number, y: number): void {
    const types: BonusType[] = ['SHIELD', 'SPEED_BOOST', 'RAPID_FIRE', 'NUKE'];
    const type = types[Math.floor(Math.random() * types.length)];
    const now = Date.now();

    this.bonuses.push({
      id: uuidv4(),
      type,
      x,
      y,
      createdAt: now,
      expiresAt: now + CONFIG.BONUS_LIFETIME_MS
    });
  }

  private respawnTank(id: string): void {
    const tank = this.tanks.get(id);
    if (!tank) return;

    const spawns = getSpawnPositions();
    const spawn = spawns[Math.floor(Math.random() * spawns.length)];

    tank.x = spawn.x;
    tank.y = spawn.y;
    tank.health = tank.maxHealth;
    tank.isAlive = true;
    tank.shieldUntil = Date.now() + 2500;
  }

  public getSnapshot(): GameSnapshot {
    return {
      tick: this.tick,
      timestamp: Date.now(),
      tanks: Array.from(this.tanks.values()),
      bullets: this.bullets,
      bonuses: this.bonuses,
      destroyedWalls: this.destroyedWalls,
      conflicts: this.recentConflicts.slice(-5)
    };
  }

  private broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const [playerId, ws] of this.sockets.entries()) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(payload, (err) => {
            if (err) {
              this.disconnectPlayer(playerId, ws);
            }
          });
        } catch {
          this.disconnectPlayer(playerId, ws);
        }
      }
    }
  }

  private broadcastState(): void {
    this.broadcast({
      type: 'STATE',
      snapshot: this.getSnapshot()
    });
  }

  private broadcastConflict(event: ConflictEvent): void {
    this.broadcast({
      type: 'CONFLICT',
      event
    });
  }

  private broadcastKill(killerId: string, killerName: string, victimId: string, victimName: string): void {
    this.broadcast({
      type: 'KILL',
      killerId,
      killerName,
      victimId,
      victimName
    });
  }

  public destroy(): void {
    this.stopLoop();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
    for (const tank of this.tanks.values()) {
      savePlayerStats(tank.name, tank.stats, false).catch(() => {});
    }
    const duration = Math.floor((Date.now() - this.matchStartedAt) / 1000);
    const topTank = Array.from(this.tanks.values()).sort((a, b) => b.stats.score - a.stats.score)[0];
    recordMatch(topTank ? topTank.name : 'Unknown', duration, this.totalMatchKills, this.totalMatchWalls).catch(() => {});
    this.tanks.clear();
    this.sockets.clear();
  }
}
