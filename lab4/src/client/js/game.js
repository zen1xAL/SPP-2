import { CanvasRenderer } from './renderer.js';
import { InputController } from './input.js';
import { NetworkClient } from './network.js';
import { UIManager } from './ui.js';

export class GameApp {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new CanvasRenderer(this.canvas);
    this.input = new InputController();
    this.network = new NetworkClient();
    this.ui = new UIManager();

    this.map = null;
    this.currentSnapshot = null;
    this.localPlayerId = null;
    this.lastFrameTime = performance.now();
    this.isRunning = false;
    this.renderTanks = new Map();

    this.init();
  }

  init() {
    this.input.setCallbacks({
      onMove: (direction, isMoving, sequence) => {
        this.network.send({
          type: 'INPUT',
          direction,
          isMoving,
          sequence
        });
      },
      onFire: () => {
        this.network.send({
          type: 'FIRE',
          sequence: 0,
          timestamp: Date.now()
        });
      }
    });

    this.network.setCallbacks({
      onInit: (msg) => {
        this.localPlayerId = msg.playerId;
        this.map = msg.map;
        this.setupCanvasDimensions();
        this.ui.hideJoinModal();
        if (!this.isRunning) {
          this.startLoop();
        }
      },
      onReconnected: (msg) => {
        this.localPlayerId = msg.playerId;
        this.map = msg.map;
        this.currentSnapshot = msg.snapshot;
        this.setupCanvasDimensions();
        this.ui.hideJoinModal();
        if (!this.isRunning) {
          this.startLoop();
        }
      },
      onSessionExpired: () => {
        this.ui.showJoinModal();
      },
      onState: (snapshot) => {
        this.handleNewSnapshot(snapshot);
      },
      onConflict: (event) => {
        this.ui.showConflictNotification(event, this.localPlayerId);
      },
      onKill: (msg) => {
        if (msg.victimId === this.localPlayerId) {
          if (navigator.vibrate) {
            try { navigator.vibrate([100, 50, 100]); } catch {}
          }
        }
      },
      onPing: (pingMs) => {
        this.ui.updatePing(pingMs);
      },
      onNetworkChange: (status) => {
        this.ui.updateNetworkStatus(status);
      }
    });

    const joinForm = document.getElementById('joinForm');
    if (joinForm) {
      joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('playerName');
        const colorInput = document.querySelector('input[name="tankColor"]:checked');
        const name = nameInput ? nameInput.value.trim() : 'Pilot';
        const color = colorInput ? colorInput.value : '#3b82f6';
        this.network.join(name, color);
      });
    }

    if (this.network.hasSavedSession()) {
      this.network.reconnect();
    } else {
      this.ui.showJoinModal();
    }

    window.addEventListener('resize', () => {
      if (this.map) {
        this.setupCanvasDimensions();
      }
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (this.map) {
          this.setupCanvasDimensions();
        }
      }, 100);
    });
  }

  getDirectionVec(dir) {
    switch (dir) {
      case 'UP': return { x: 0, y: -1 };
      case 'DOWN': return { x: 0, y: 1 };
      case 'LEFT': return { x: -1, y: 0 };
      case 'RIGHT': return { x: 1, y: 0 };
      default: return { x: 0, y: 0 };
    }
  }

  setupCanvasDimensions() {
    if (!this.map) return;
    const arenaW = this.map.width * this.map.tileSize;
    const arenaH = this.map.height * this.map.tileSize;
    this.renderer.resize(arenaW, arenaH);

    const viewport = document.querySelector('.arena-viewport');
    if (viewport) {
      const isPortrait = window.innerHeight > window.innerWidth;
      const isMobile = window.innerWidth <= 768;

      const reservedH = isMobile && isPortrait ? 150 : 20;
      const availableW = Math.max(260, viewport.clientWidth - 16);
      const availableH = Math.max(180, viewport.clientHeight - reservedH);

      const scale = Math.min(availableW / arenaW, availableH / arenaH);
      const displayW = Math.floor(arenaW * scale);
      const displayH = Math.floor(arenaH * scale);

      this.canvas.style.width = `${displayW}px`;
      this.canvas.style.height = `${displayH}px`;
    }
  }

  handleNewSnapshot(snapshot) {
    if (this.currentSnapshot && this.map && this.map.grid) {
      if (snapshot.destroyedWalls.length > this.currentSnapshot.destroyedWalls.length) {
        const newWalls = snapshot.destroyedWalls.slice(this.currentSnapshot.destroyedWalls.length);
        for (const w of newWalls) {
          if (this.map.grid[w.y] && this.map.grid[w.y][w.x] !== undefined) {
            this.map.grid[w.y][w.x] = 0;
            const cx = w.x * this.map.tileSize + this.map.tileSize / 2;
            const cy = w.y * this.map.tileSize + this.map.tileSize / 2;
            this.renderer.addExplosion(cx, cy, '#ca8a04', 12);
          }
        }
      }
    }

    const currentIds = new Set();
    for (const tank of snapshot.tanks) {
      currentIds.add(tank.id);
      let rt = this.renderTanks.get(tank.id);
      if (!rt) {
        rt = {
          ...tank,
          renderX: tank.x,
          renderY: tank.y,
          targetX: tank.x,
          targetY: tank.y
        };
        this.renderTanks.set(tank.id, rt);
      } else {
        rt.targetX = tank.x;
        rt.targetY = tank.y;
        rt.direction = tank.direction;
        rt.health = tank.health;
        rt.maxHealth = tank.maxHealth;
        rt.shieldUntil = tank.shieldUntil;
        rt.speedUntil = tank.speedUntil;
        rt.rapidUntil = tank.rapidUntil;
        rt.stats = tank.stats;
        rt.isAlive = tank.isAlive;
        rt.color = tank.color;
        rt.name = tank.name;
      }
    }

    for (const id of this.renderTanks.keys()) {
      if (!currentIds.has(id)) {
        this.renderTanks.delete(id);
      }
    }

    this.currentSnapshot = snapshot;

    if (this.localPlayerId) {
      const myTank = snapshot.tanks.find((t) => t.id === this.localPlayerId);
      if (myTank) {
        this.ui.updatePlayerHUD(myTank);
      }
    }
  }

  canMoveClient(curX, curY, dirVec, step) {
    if (!this.map || !this.map.grid) return true;
    const nextX = curX + dirVec.x * step;
    const nextY = curY + dirVec.y * step;
    const half = 15;
    const ts = this.map.tileSize;

    const minTx = Math.floor((nextX - half) / ts);
    const maxTx = Math.floor((nextX + half) / ts);
    const minTy = Math.floor((nextY - half) / ts);
    const maxTy = Math.floor((nextY + half) / ts);

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (ty < 0 || ty >= this.map.height || tx < 0 || tx >= this.map.width) {
          return false;
        }
        if (this.map.grid[ty][tx] !== 0) {
          return false;
        }
      }
    }
    return true;
  }

  startLoop() {
    this.isRunning = true;
    this.lastFrameTime = performance.now();

    const loop = (time) => {
      const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1);
      this.lastFrameTime = time;

      const tanksToRender = [];
      const now = Date.now();
      const lerpSpeed = Math.min(1.0, 24 * dt);

      for (const [id, rt] of this.renderTanks.entries()) {
        if (!rt.isAlive) continue;

        if (id === this.localPlayerId && this.input.isMoving) {
          const dirVec = this.getDirectionVec(this.input.currentDirection);
          const speed = rt.speedUntil > now ? 130 * 1.45 : 130;
          const step = speed * dt;

          if (this.canMoveClient(rt.renderX, rt.renderY, dirVec, step)) {
            rt.renderX += dirVec.x * step;
            rt.renderY += dirVec.y * step;
          }

          const distToServer = Math.hypot(rt.targetX - rt.renderX, rt.targetY - rt.renderY);
          if (distToServer > 30) {
            rt.renderX = rt.targetX;
            rt.renderY = rt.targetY;
          } else if (distToServer > 1) {
            rt.renderX += (rt.targetX - rt.renderX) * Math.min(1.0, 12 * dt);
            rt.renderY += (rt.targetY - rt.renderY) * Math.min(1.0, 12 * dt);
          }
        } else {
          rt.renderX += (rt.targetX - rt.renderX) * lerpSpeed;
          rt.renderY += (rt.targetY - rt.renderY) * lerpSpeed;
        }

        tanksToRender.push({
          ...rt,
          x: rt.renderX,
          y: rt.renderY
        });
      }

      if (this.currentSnapshot && this.currentSnapshot.bullets) {
        for (const b of this.currentSnapshot.bullets) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
      }

      if (this.map && this.currentSnapshot) {
        const renderSnapshot = {
          ...this.currentSnapshot,
          tanks: tanksToRender
        };
        this.renderer.render(this.map, renderSnapshot, this.localPlayerId, dt);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}
