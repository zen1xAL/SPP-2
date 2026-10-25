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
      },
      onState: (snapshot) => {
        this.handleNewSnapshot(snapshot);
      },
      onConflict: (event) => {
        this.ui.showConflictNotification(event, this.localPlayerId);
      },
      onKill: (msg) => {
        if (msg.victimId === this.localPlayerId) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
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
        this.network.connect(name, color);
      });
    }

    window.addEventListener('resize', () => {
      if (this.map) {
        this.setupCanvasDimensions();
      }
    });
  }

  setupCanvasDimensions() {
    if (!this.map) return;
    const arenaW = this.map.width * this.map.tileSize;
    const arenaH = this.map.height * this.map.tileSize;
    this.renderer.resize(arenaW, arenaH);
  }

  handleNewSnapshot(snapshot) {
    if (this.currentSnapshot && this.map) {
      if (snapshot.destroyedWalls.length > this.currentSnapshot.destroyedWalls.length) {
        const newWalls = snapshot.destroyedWalls.slice(this.currentSnapshot.destroyedWalls.length);
        for (const w of newWalls) {
          this.map.grid[w.y][w.x] = 0;
          const cx = w.x * this.map.tileSize + this.map.tileSize / 2;
          const cy = w.y * this.map.tileSize + this.map.tileSize / 2;
          this.renderer.addExplosion(cx, cy, '#ca8a04', 16);
        }
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

  startLoop() {
    this.isRunning = true;
    this.lastFrameTime = performance.now();

    const loop = (time) => {
      const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1);
      this.lastFrameTime = time;

      if (this.map && this.currentSnapshot) {
        this.renderer.render(this.map, this.currentSnapshot, this.localPlayerId, dt);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}
