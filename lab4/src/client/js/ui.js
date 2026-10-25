export class UIManager {
  constructor() {
    this.joinModal = document.getElementById('joinModal');
    this.joinForm = document.getElementById('joinForm');
    this.hudPlayerColor = document.getElementById('hudPlayerColor');
    this.hudPlayerName = document.getElementById('hudPlayerName');
    this.hudHealthBar = document.getElementById('hudHealthBar');
    this.hudHealthText = document.getElementById('hudHealthText');
    this.hudBuffBadge = document.getElementById('hudBuffBadge');
    this.hudBuffIcon = document.getElementById('hudBuffIcon');
    this.hudBuffTimer = document.getElementById('hudBuffTimer');
    this.hudScore = document.getElementById('hudScore');
    this.hudKills = document.getElementById('hudKills');
    this.hudWalls = document.getElementById('hudWalls');
    this.netStatusPill = document.getElementById('netStatusPill');
    this.netStatusText = document.getElementById('netStatusText');
    this.hudPing = document.getElementById('hudPing');
    this.conflictToast = document.getElementById('conflictToast');
    this.conflictDesc = document.getElementById('conflictDesc');
    this.reconnectBanner = document.getElementById('reconnectBanner');
    this.leaderboardModal = document.getElementById('leaderboardModal');
    this.leaderboardBody = document.getElementById('leaderboardBody');
    this.btnOpenLeaderboard = document.getElementById('btnOpenLeaderboard');
    this.btnCloseLeaderboard = document.getElementById('btnCloseLeaderboard');
    this.btnToggleFullscreen = document.getElementById('btnToggleFullscreen');

    this.toastTimer = null;
    this.initEventListeners();
  }

  initEventListeners() {
    if (this.btnOpenLeaderboard) {
      this.btnOpenLeaderboard.addEventListener('click', () => this.openLeaderboard());
    }
    if (this.btnCloseLeaderboard) {
      this.btnCloseLeaderboard.addEventListener('click', () => this.closeLeaderboard());
    }
    if (this.btnToggleFullscreen) {
      this.btnToggleFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }
  }

  hideJoinModal() {
    if (this.joinModal) {
      this.joinModal.classList.add('hidden');
    }
  }

  showJoinModal() {
    if (this.joinModal) {
      this.joinModal.classList.remove('hidden');
    }
  }

  updatePlayerHUD(tank) {
    if (!tank) return;

    if (this.hudPlayerColor) {
      this.hudPlayerColor.style.backgroundColor = tank.color;
      this.hudPlayerColor.style.boxShadow = `0 0 8px ${tank.color}`;
    }
    if (this.hudPlayerName) {
      this.hudPlayerName.textContent = tank.name;
    }

    const hpPercent = Math.max(0, Math.min(100, (tank.health / tank.maxHealth) * 100));
    if (this.hudHealthBar) {
      this.hudHealthBar.style.width = `${hpPercent}%`;
      if (hpPercent > 50) {
        this.hudHealthBar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
      } else if (hpPercent > 25) {
        this.hudHealthBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
      } else {
        this.hudHealthBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      }
    }
    if (this.hudHealthText) {
      this.hudHealthText.textContent = `${Math.max(0, tank.health)} / ${tank.maxHealth} HP`;
    }

    if (this.hudScore) this.hudScore.textContent = tank.stats.score;
    if (this.hudKills) this.hudKills.textContent = tank.stats.kills;
    if (this.hudWalls) this.hudWalls.textContent = tank.stats.wallsDestroyed;

    const now = Date.now();
    let activeBuff = null;
    let buffExpires = 0;

    if (tank.shieldUntil > now) {
      activeBuff = 'ЩИТ';
      buffExpires = tank.shieldUntil;
    } else if (tank.speedUntil > now) {
      activeBuff = 'УСКОРЕНИЕ';
      buffExpires = tank.speedUntil;
    } else if (tank.rapidUntil > now) {
      activeBuff = 'СКОРОСТРЕЛЬНОСТЬ';
      buffExpires = tank.rapidUntil;
    }

    if (activeBuff && this.hudBuffBadge) {
      const remainingSec = Math.ceil((buffExpires - now) / 1000);
      this.hudBuffBadge.classList.remove('hidden');
      if (this.hudBuffIcon) this.hudBuffIcon.textContent = activeBuff;
      if (this.hudBuffTimer) this.hudBuffTimer.textContent = `${remainingSec}с`;
    } else if (this.hudBuffBadge) {
      this.hudBuffBadge.classList.add('hidden');
    }
  }

  updateNetworkStatus(status) {
    if (!this.netStatusPill) return;

    this.netStatusPill.className = 'net-status-pill';

    if (status === 'online') {
      this.netStatusPill.classList.add('net-online');
      if (this.netStatusText) this.netStatusText.textContent = 'В сети';
      if (this.reconnectBanner) this.reconnectBanner.classList.add('hidden');
    } else if (status === 'reconnecting' || status === 'connecting') {
      this.netStatusPill.classList.add('net-reconnecting');
      if (this.netStatusText) this.netStatusText.textContent = 'Реконнект...';
      if (this.reconnectBanner) this.reconnectBanner.classList.remove('hidden');
    } else {
      this.netStatusPill.classList.add('net-offline');
      if (this.netStatusText) this.netStatusText.textContent = 'Оффлайн';
      if (this.reconnectBanner) this.reconnectBanner.classList.remove('hidden');
    }
  }

  updatePing(pingMs) {
    if (this.hudPing) {
      this.hudPing.textContent = `${pingMs} ms`;
    }
  }

  showConflictNotification(event, localPlayerId) {
    if (!this.conflictToast || !this.conflictDesc) return;

    let text = 'Конкурентное действие разрешено сервером';
    if (event.type === 'BONUS_PICKUP') {
      if (event.winnerPlayerId === localPlayerId) {
        text = 'Вы подобрали бонус раньше соперника (LWW Resolution)!';
      } else {
        text = 'Соперник успел подобрать бонус на миллисекунду раньше!';
      }
    } else if (event.type === 'WALL_HIT') {
      if (event.winnerPlayerId === localPlayerId) {
        text = 'Ваш снаряд первым пробил стену!';
      } else {
        text = 'Стена разрушена снарядом соперника!';
      }
    }

    this.conflictDesc.textContent = text;
    this.conflictToast.classList.remove('hidden');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.conflictToast.classList.add('hidden');
    }, 3500);
  }

  async openLeaderboard() {
    if (this.leaderboardModal) {
      this.leaderboardModal.classList.remove('hidden');
    }

    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (!this.leaderboardBody) return;

      if (!data.leaderboard || data.leaderboard.length === 0) {
        this.leaderboardBody.innerHTML = '<tr><td colspan="6" class="text-center">Пока нет завершенных матчей</td></tr>';
        return;
      }

      this.leaderboardBody.innerHTML = data.leaderboard
        .map(
          (p, idx) => `
          <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td>${p.name}</td>
            <td><strong>${p.highScore}</strong></td>
            <td>${p.totalWins}</td>
            <td>${p.totalKills}</td>
            <td>${p.totalWallsDestroyed}</td>
          </tr>
        `
        )
        .join('');
    } catch {
      if (this.leaderboardBody) {
        this.leaderboardBody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Ошибка загрузки</td></tr>';
      }
    }
  }

  closeLeaderboard() {
    if (this.leaderboardModal) {
      this.leaderboardModal.classList.add('hidden');
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
}
