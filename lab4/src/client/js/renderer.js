export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.particles = [];
  }

  resize(width, height) {
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  addExplosion(x, y, color = '#f59e0b', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color,
        alpha: 1,
        decay: 1.8 + Math.random() * 1.5
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

    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, map.width * ts, map.height * ts);

    this.renderFloorGrid(ctx, map.width, map.height, ts);
    this.renderTiles(ctx, map.grid, ts);
    this.renderBonuses(ctx, snapshot.bonuses);
    this.renderTanks(ctx, snapshot.tanks, localPlayerId);
    this.renderBullets(ctx, snapshot.bullets);
    this.renderParticles(ctx);
  }

  renderFloorGrid(ctx, width, height, ts) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
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

  renderTiles(ctx, grid, ts) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        if (cell === 0) continue;

        const px = x * ts;
        const py = y * ts;

        if (cell === 1) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(px, py, ts, ts);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

          ctx.fillStyle = '#334155';
          ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
        } else if (cell === 2) {
          ctx.fillStyle = '#854d0e';
          ctx.fillRect(px, py, ts, ts);

          ctx.strokeStyle = '#ca8a04';
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

  renderTanks(ctx, tanks, localPlayerId) {
    const now = Date.now();

    for (const tank of tanks) {
      if (!tank.isAlive) continue;

      const size = 30;
      const half = size / 2;

      ctx.save();
      ctx.translate(tank.x, tank.y);

      if (tank.shieldUntil > now) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, half + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-half - 2, -half, 4, size);
      ctx.fillRect(half - 2, -half, 4, size);

      ctx.fillStyle = tank.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-half, -half, size, size, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      let barrelDx = 0;
      let barrelDy = 0;
      let bw = 4;
      let bh = 14;

      if (tank.direction === 'UP') {
        barrelDx = -bw / 2;
        barrelDy = -half - 5;
      } else if (tank.direction === 'DOWN') {
        barrelDx = -bw / 2;
        barrelDy = 0;
      } else if (tank.direction === 'LEFT') {
        barrelDx = -half - 5;
        barrelDy = -bw / 2;
        bw = 14;
        bh = 4;
      } else if (tank.direction === 'RIGHT') {
        barrelDx = 0;
        barrelDy = -bw / 2;
        bw = 14;
        bh = 4;
      }

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(barrelDx, barrelDy, bw, bh);

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

      ctx.fillStyle = hpPercent > 0.5 ? '#10b981' : hpPercent > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpPercent, barH);
    }
  }

  renderBullets(ctx, bullets) {
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 6;

    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  renderBonuses(ctx, bonuses) {
    const now = Date.now();

    for (const b of bonuses) {
      const pulse = Math.sin(now * 0.006) * 2;
      const size = 18 + pulse;
      const half = size / 2;

      let color = '#38bdf8';
      let symbol = 'S';
      if (b.type === 'RAPID_FIRE') { color = '#f59e0b'; symbol = 'R'; }
      else if (b.type === 'SPEED_BOOST') { color = '#10b981'; symbol = '>'; }
      else if (b.type === 'NUKE') { color = '#ef4444'; symbol = 'N'; }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.roundRect(b.x - half, b.y - half, size, size, 4);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = '700 11px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol, b.x, b.y);
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
