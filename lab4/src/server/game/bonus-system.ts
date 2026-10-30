import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import type { BonusCrate, BonusType, ConflictEvent, Position, Tank } from './types.js';
import { checkAABB, getTankBox } from './physics.js';
import { type BonusClaimant, resolveBonusPickupConflict } from './conflicts.js';
import { BONUS_TYPES, COMBAT_CONFIG } from './constants.js';

export interface BonusCallbacks {
  onConflict: (event: ConflictEvent) => void;
  onBonusCollected: (tankId: string, type: BonusType) => void;
  onNukeActivated: (tankId: string) => void;
}

export class BonusSystem {
  private bonuses: BonusCrate[] = [];
  private lastBonusSpawnAt = Date.now();
  private callbacks: BonusCallbacks;

  constructor(callbacks: BonusCallbacks) {
    this.callbacks = callbacks;
  }

  public update(
    now: number,
    grid: number[][],
    width: number,
    height: number,
    allTanks: Tank[]
  ): void {
    if (
      now - this.lastBonusSpawnAt > CONFIG.BONUS_SPAWN_INTERVAL_MS &&
      this.bonuses.length < CONFIG.MAX_ACTIVE_BONUSES
    ) {
      this.lastBonusSpawnAt = now;
      this.spawnRandomBonus(grid, width, height);
    }

    const remainingBonuses: BonusCrate[] = [];
    const bonusClaimMap = new Map<string, BonusClaimant[]>();

    for (const crate of this.bonuses) {
      if (crate.expiresAt <= now) continue;

      const crateBox = {
        left: crate.x - COMBAT_CONFIG.CRATE_HALF_SIZE,
        right: crate.x + COMBAT_CONFIG.CRATE_HALF_SIZE,
        top: crate.y - COMBAT_CONFIG.CRATE_HALF_SIZE,
        bottom: crate.y + COMBAT_CONFIG.CRATE_HALF_SIZE
      };

      for (const tank of allTanks) {
        if (!tank.isAlive) continue;
        const tankBox = getTankBox(tank.x, tank.y);

        if (checkAABB(crateBox, tankBox)) {
          const dist = Math.hypot(tank.x - crate.x, tank.y - crate.y);
          const claimant: BonusClaimant = {
            tank,
            crate,
            distance: dist,
            timestamp: now
          };
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
        this.callbacks.onBonusCollected(res.winner.id, crate.type);

        if (claimants.length > 1) {
          this.callbacks.onConflict(res.event);
        }
      }
    }

    this.bonuses = remainingBonuses;
  }

  public applyBonusToTank(tank: Tank, type: BonusType): void {
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
        this.callbacks.onNukeActivated(tank.id);
        break;
    }
  }

  public spawnRandomBonus(grid: number[][], width: number, height: number): void {
    const emptyCells: Position[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[y][x] === 0) {
          emptyCells.push({ x, y });
        }
      }
    }

    if (emptyCells.length === 0) return;
    const chosen = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const ts = CONFIG.TILE_SIZE;
    this.spawnBonusAt(chosen.x * ts + ts / 2, chosen.y * ts + ts / 2);
  }

  public spawnBonusAt(x: number, y: number): void {
    const type = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
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

  public getBonuses(): BonusCrate[] {
    return this.bonuses;
  }

  public getCount(): number {
    return this.bonuses.length;
  }

  public destroy(): void {
    this.bonuses = [];
  }
}
