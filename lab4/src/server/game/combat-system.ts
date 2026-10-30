import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import type { Bullet, ConflictEvent, Position, Tank } from './types.js';
import { checkAABB, getTankBox } from './physics.js';
import { destroyWall } from './map.js';
import { type WallHitClaimant, resolveWallHitConflict } from './conflicts.js';
import { DIRECTION_VECTORS } from './constants.js';

export interface CombatCallbacks {
  onKill: (killerId: string, killerName: string, victimId: string, victimName: string) => void;
  onWallDestroyed: (tx: number, ty: number, killerTankId?: string) => void;
  onConflict: (event: ConflictEvent) => void;
}

export class CombatSystem {
  private bullets: Bullet[] = [];
  private destroyedWalls: Position[] = [];
  private totalMatchKills = 0;
  private totalMatchWalls = 0;
  private callbacks: CombatCallbacks;

  constructor(callbacks: CombatCallbacks) {
    this.callbacks = callbacks;
  }

  public handleFire(tank: Tank, timestamp: number): boolean {
    if (!tank.isAlive) return false;

    const now = Date.now();
    const cooldown =
      tank.rapidUntil > now ? CONFIG.RAPID_COOLDOWN_MS : tank.bulletCooldownMs;

    if (now - tank.lastShotAt < cooldown) {
      return false;
    }

    tank.lastShotAt = now;
    const dirVec = DIRECTION_VECTORS[tank.direction];
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

  public update(
    dt: number,
    grid: number[][],
    mapWidth: number,
    mapHeight: number,
    allTanks: Tank[]
  ): void {
    const now = Date.now();
    const remainingBullets: Bullet[] = [];
    const wallHitMap = new Map<string, WallHitClaimant[]>();

    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      const ts = CONFIG.TILE_SIZE;
      const tileX = Math.floor(bullet.x / ts);
      const tileY = Math.floor(bullet.y / ts);

      if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
        continue;
      }

      const cell = grid[tileY][tileX];

      if (cell === 1) {
        continue;
      }

      if (cell === 2) {
        const key = `${tileX},${tileY}`;
        const claimant: WallHitClaimant = {
          bullet,
          tileX,
          tileY,
          timestamp: bullet.createdAt
        };
        const existing = wallHitMap.get(key) || [];
        existing.push(claimant);
        wallHitMap.set(key, existing);
        continue;
      }

      const hitTank = this.checkBulletTankHit(bullet, allTanks, now);
      if (!hitTank) {
        remainingBullets.push(bullet);
      }
    }

    this.resolveWallHits(wallHitMap, grid);
    this.bullets = remainingBullets;
  }

  private checkBulletTankHit(
    bullet: Bullet,
    allTanks: Tank[],
    now: number
  ): boolean {
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
        if (tank.shieldUntil <= now) {
          tank.health -= bullet.damage;
          if (tank.health <= 0) {
            this.totalMatchKills += 1;
            const killer = allTanks.find((t) => t.id === bullet.ownerId);
            this.callbacks.onKill(
              bullet.ownerId,
              killer ? killer.name : 'Unknown',
              tank.id,
              tank.name
            );
          }
        }
        return true;
      }
    }

    return false;
  }

  private resolveWallHits(
    wallHitMap: Map<string, WallHitClaimant[]>,
    grid: number[][]
  ): void {
    for (const [key, claimants] of wallHitMap.entries()) {
      const [txStr, tyStr] = key.split(',');
      const tx = parseInt(txStr, 10);
      const ty = parseInt(tyStr, 10);

      const conflictResult = resolveWallHitConflict(tx, ty, claimants);
      if (conflictResult) {
        destroyWall(grid, tx, ty);
        this.destroyedWalls.push({ x: tx, y: ty });
        this.totalMatchWalls += 1;

        this.callbacks.onWallDestroyed(tx, ty, conflictResult.winnerBullet.ownerId);

        if (claimants.length > 1) {
          this.callbacks.onConflict(conflictResult.event);
        }
      }
    }
  }

  public filterBulletsByOwner(ownerId: string): void {
    this.bullets = this.bullets.filter((b) => b.ownerId === ownerId);
  }

  public getBullets(): Bullet[] {
    return this.bullets;
  }

  public getDestroyedWalls(): Position[] {
    return this.destroyedWalls;
  }

  public getTotalMatchKills(): number {
    return this.totalMatchKills;
  }

  public getTotalMatchWalls(): number {
    return this.totalMatchWalls;
  }

  public destroy(): void {
    this.bullets = [];
    this.destroyedWalls = [];
  }
}
