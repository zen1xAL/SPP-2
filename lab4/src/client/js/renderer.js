import { THEME } from './constants.js';

const BARREL_OFFSETS = {
  UP: { x: -2, y: -20, w: 4, h: 14 },
  DOWN: { x: -2, y: 0, w: 4, h: 14 },
  LEFT: { x: -20, y: -2, w: 14, h: 4 },
  RIGHT: { x: 0, y: -2, w: 14, h: 4 }
};

const BONUS_VISUALS = {
  SHIELD: { color: THEME.BONUS_SHIELD, halo: 'rgba(56, 189, 248, 0.35)', symbol: 'S' },
  RAPID_FIRE: { color: THEME.BONUS_RAPID, halo: 'rgba(245, 158, 11, 0.35)', symbol: 'R' },
  SPEED_BOOST: { color: THEME.BONUS_SPEED, halo: 'rgba(16, 185, 129, 0.35)', symbol: '>' },
  NUKE: { color: THEME.BONUS_NUKE, halo: 'rgba(239, 68, 68, 0.35)', symbol: 'N' }
};

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.particles = [];
    this.bgCanvas = null;
    this.bgDirty = true;
  }

  resize(width, height) {
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.bgDirty = true;
  }

  drawRoundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  setupBackground(map) {
    if (!map) return;
    const w = map.width * map.tileSize;
    const h = map.height * map.tileSize;

    if (!this.bgCanvas) {
      this.bgCanvas = document.createElement('canvas');
    }
    this.bgCanvas.width = w * this.dpr;
    this.bgCanvas.height = h * this.dpr;

    const bgCtx = this.bgCanvas.getContext('2d');
    bgCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    bgCtx.fillStyle = THEME.BG_SOLID;
    bgCtx.fillRect(0, 0, w, h);

    this.renderFloorGrid(bgCtx, map.width, map.height, map.tileSize);
    this.renderSolidWalls(bgCtx, map.grid, map.tileSize);
    this.bgDirty = false;
  }

  renderFloorGrid(ctx, width, height, ts) {
    ctx.strokeStyle = THEME.GRID_LINE;
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * ts, 0);
      ctx.lineTo(x * ts, height * ts);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * ts);
      ctx.lineTo(width * ts, y * ts);
      ctx.stroke();
    }
  }

  renderSolidWalls(ctx, grid, ts) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 1) {
          const px = x * ts;
          const py = y * ts;

          ctx.fillStyle = THEME.WALL_STEEL_FILL;
          ctx.fillRect(px, py, ts, ts);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

          ctx.fillStyle = THEME.WALL_STEEL_CORE;
          ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
        }
      }
    }
  }

  renderBrickWalls(ctx, grid, ts) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 2) {
          const px = x * ts;
          const py = y * ts;

          ctx.fillStyle = THEME.WALL_BRICK_FILL;
          ctx.fillRect(px, py, ts, ts);

          ctx.strokeStyle = THEME.WALL_BRICK_STROKE;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

          ctx.beginPath();
          ctx.moveTo(px, py + ts / 2);
          ctx.lineTo(px + ts, py + ts / 2);
          ctx.moveTo(px + ts / 2, py);
          ctx.lineTo(px + ts / 2, py + ts);
          ctx.stroke();
        }
      }
    }
  }

  addExplosion(x, y, color = THEME.EXPLOSION_DEFAULT, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 2.5,
        color,
        alpha: 1,
        decay: 2.2 + Math.random() * 1.5
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= p.decay * dt;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(map, snapshot, localPlayerId, dt = 0.016) {
    this.updateParticles(dt);
    const ctx = this.ctx;
    const ts = map.tileSize;
    const w = map.width * ts;
    const h = map.height * ts;

    if (this.bgDirty || !this.bgCanvas) {
      this.setupBackground(map);
    }

    ctx.drawImage(this.bgCanvas, 0, 0, w, h);
    this.renderBrickWalls(ctx, map.grid, ts);
    this.renderBonuses(ctx, snapshot.bonuses);
    this.renderTanks(ctx, snapshot.tanks, localPlayerId);
    this.renderBullets(ctx, snapshot.bullets);
    this.renderParticles(ctx);
  }

  renderTanks(ctx, tanks, localPlayerId) {
    const now = Date.now();

    for (const tank of tanks) {
      if (!tank.isAlive) continue;

      const size = 30;
      const half = size / 2;

      ctx.save();
      ctx.translate(tank.x, tank.y);

      if (tank.shieldUntil > now) {
        ctx.strokeStyle = THEME.SHIELD_HALO;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, half + 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = THEME.SHIELD_RING;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, half + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = THEME.TREADS;
      ctx.fillRect(-half - 2, -half, 4, size);
      ctx.fillRect(half - 2, -half, 4, size);

      ctx.fillStyle = tank.color;
      ctx.strokeStyle = THEME.BODY_STROKE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.drawRoundRect(ctx, -half, -half, size, size, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = THEME.TREADS;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      const barrel = BARREL_OFFSETS[tank.direction] || BARREL_OFFSETS.UP;
      ctx.fillStyle = THEME.BARREL;
      ctx.fillRect(barrel.x, barrel.y, barrel.w, barrel.h);

      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      const isMe = tank.id === localPlayerId;
      const displayName = isMe ? `${tank.name} (Вы)` : tank.name;
      ctx.fillText(displayName, tank.x, tank.y - half - 10);

      const barW = 28;
      const barH = 4;
      const barX = tank.x - barW / 2;
      const barY = tank.y - half - 7;
      const hpPercent = Math.max(0, tank.health / tank.maxHealth);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(barX, barY, barW, barH);

      ctx.fillStyle = hpPercent > 0.5 ? THEME.HEALTH_HIGH : hpPercent > 0.25 ? THEME.HEALTH_MID : THEME.HEALTH_LOW;
      ctx.fillRect(barX, barY, barW * hpPercent, barH);
    }
  }

  renderBullets(ctx, bullets) {
    for (const b of bullets) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderBonuses(ctx, bonuses) {
    const now = Date.now();

    for (const b of bonuses) {
      const pulse = Math.sin(now * 0.006) * 1.5;
      const size = 18 + pulse;
      const half = size / 2;

      const visual = BONUS_VISUALS[b.type] || BONUS_VISUALS.SHIELD;

      ctx.strokeStyle = visual.halo;
      ctx.lineWidth = 4;
      ctx.beginPath();
      this.drawRoundRect(ctx, b.x - half - 1, b.y - half - 1, size + 2, size + 2, 5);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = visual.color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      this.drawRoundRect(ctx, b.x - half, b.y - half, size, size, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = visual.color;
      ctx.font = '700 11px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(visual.symbol, b.x, b.y);
    }
  }

  renderParticles(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
