import type { WebSocket } from 'ws';
import { CONFIG } from '../config.js';
import { recordMatch } from '../db.js';
import type {
  BonusType,
  ConflictEvent,
  Direction,
  GameMap,
  GameSnapshot,
  Tank
} from './types.js';
import { createStandardMap } from './map.js';
import { PlayerManager } from './player-manager.js';
import { CombatSystem } from './combat-system.js';
import { BonusSystem } from './bonus-system.js';
import { COMBAT_CONFIG } from './constants.js';
import type { ServerMessage } from '../ws/protocol.js';

export class GameRoom {
  public readonly id: string;
  public readonly map: GameMap;
  private readonly playerManager: PlayerManager;
  private readonly combatSystem: CombatSystem;
  private readonly bonusSystem: BonusSystem;
  private recentConflicts: ConflictEvent[] = [];
  private tickInterval: NodeJS.Timeout | null = null;
  private tick = 0;
  private matchStartedAt = Date.now();

  constructor(id: string) {
    this.id = id;
    this.map = createStandardMap();
    this.playerManager = new PlayerManager();

    this.combatSystem = new CombatSystem({
      onKill: (killerId, killerName, victimId, victimName) => {
        this.playerManager.recordDeath(victimId);
        this.playerManager.awardKill(killerId);
        this.broadcastKill(killerId, killerName, victimId, victimName);
      },
      onWallDestroyed: (tx, ty, killerTankId) => {
        if (killerTankId) {
          this.playerManager.awardWallDestroy(killerTankId);
        }
        if (
          Math.random() < COMBAT_CONFIG.WALL_BONUS_DROP_CHANCE &&
          this.bonusSystem.getCount() < CONFIG.MAX_PLAYERS_PER_ROOM
        ) {
          const ts = CONFIG.TILE_SIZE;
          this.bonusSystem.spawnBonusAt(tx * ts + ts / 2, ty * ts + ts / 2);
        }
      },
      onConflict: (event) => {
        this.recordConflict(event);
        this.broadcastConflict(event);
      }
    });

    this.bonusSystem = new BonusSystem({
      onConflict: (event) => {
        this.recordConflict(event);
        this.broadcastConflict(event);
      },
      onBonusCollected: (tankId) => {
        this.playerManager.awardBonusCollected(tankId);
      },
      onNukeActivated: (tankId) => {
        this.combatSystem.filterBulletsByOwner(tankId);
      }
    });

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

  public addPlayer(
    id: string,
    name: string,
    color: string,
    sessionId: string,
    ws: WebSocket
  ): Tank {
    return this.playerManager.addPlayer(id, name, color, sessionId, ws);
  }

  public disconnectPlayer(id: string, socket?: WebSocket): void {
    this.playerManager.disconnectPlayer(id, socket);
  }

  public reconnectPlayer(sessionId: string, ws: WebSocket): Tank | null {
    return this.playerManager.reconnectPlayer(sessionId, ws);
  }

  public removePlayer(id: string): void {
    this.playerManager.removePlayer(id);
  }

  public async flushStats(): Promise<void> {
    await this.playerManager.flushStats();
  }

  public handleInput(
    id: string,
    direction: Direction,
    isMoving: boolean,
    sequence: number
  ): void {
    this.playerManager.handleInput(id, direction, isMoving, sequence);
  }

  public handleFire(id: string, timestamp: number): boolean {
    const tank = this.playerManager.getTank(id);
    if (!tank) return false;
    return this.combatSystem.handleFire(tank, timestamp);
  }

  private update(dt: number): void {
    this.tick += 1;
    const now = Date.now();

    this.playerManager.updatePositions(dt, this.map.grid);
    const allTanks = this.playerManager.getAllTanks();

    this.combatSystem.update(
      dt,
      this.map.grid,
      this.map.width,
      this.map.height,
      allTanks
    );

    this.bonusSystem.update(
      now,
      this.map.grid,
      this.map.width,
      this.map.height,
      allTanks
    );

    this.broadcastState();
  }

  private recordConflict(event: ConflictEvent): void {
    this.recentConflicts.push(event);
    if (this.recentConflicts.length > COMBAT_CONFIG.RECENT_CONFLICTS_LIMIT) {
      this.recentConflicts = this.recentConflicts.slice(
        -COMBAT_CONFIG.RECENT_CONFLICTS_LIMIT
      );
    }
  }

  public getSnapshot(): GameSnapshot {
    return {
      tick: this.tick,
      timestamp: Date.now(),
      tanks: this.playerManager.getAllTanks(),
      bullets: this.combatSystem.getBullets(),
      bonuses: this.bonusSystem.getBonuses(),
      destroyedWalls: this.combatSystem.getDestroyedWalls(),
      conflicts: this.recentConflicts.slice(
        -COMBAT_CONFIG.SNAPSHOT_CONFLICTS_LIMIT
      )
    };
  }

  private broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    const sockets = this.playerManager.getSockets();

    for (const [playerId, ws] of sockets.entries()) {
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

  private broadcastKill(
    killerId: string,
    killerName: string,
    victimId: string,
    victimName: string
  ): void {
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
    this.playerManager.destroy();
    this.combatSystem.destroy();
    this.bonusSystem.destroy();

    const duration = Math.floor((Date.now() - this.matchStartedAt) / 1000);
    const topTank = this.playerManager
      .getAllTanks()
      .sort((a, b) => b.stats.score - a.stats.score)[0];

    recordMatch(
      topTank ? topTank.name : 'Unknown',
      duration,
      this.combatSystem.getTotalMatchKills(),
      this.combatSystem.getTotalMatchWalls()
    ).catch(() => {});
  }
}
