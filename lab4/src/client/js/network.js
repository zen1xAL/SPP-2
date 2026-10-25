export class NetworkClient {
  constructor() {
    this.ws = null;
    this.sessionId = localStorage.getItem('cybertanks_session_id') || null;
    this.playerId = null;
    this.lastTick = 0;
    this.isOnline = navigator.onLine;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.lastPingSent = 0;
    this.ping = 0;
    this.offlineActionQueue = [];
    this.callbacks = {};

    this.initOnlineListeners();
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  initOnlineListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      if (this.callbacks.onNetworkChange) {
        this.callbacks.onNetworkChange('online');
      }
      this.connect();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      if (this.callbacks.onNetworkChange) {
        this.callbacks.onNetworkChange('offline');
      }
      if (this.ws) {
        this.ws.close();
      }
    });
  }

  connect(playerName, playerColor) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (playerName) this.savedName = playerName;
    if (playerColor) this.savedColor = playerColor;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    if (this.callbacks.onNetworkChange) {
      this.callbacks.onNetworkChange('connecting');
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.callbacks.onNetworkChange) {
        this.callbacks.onNetworkChange('online');
      }

      if (this.sessionId) {
        this.send({
          type: 'RECONNECT',
          sessionId: this.sessionId,
          lastTick: this.lastTick
        });
      } else if (this.savedName && this.savedColor) {
        this.send({
          type: 'JOIN',
          name: this.savedName,
          color: this.savedColor
        });
      }

      this.flushOfflineQueue();
      this.startPingLoop();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this.stopPingLoop();
      if (this.callbacks.onNetworkChange) {
        this.callbacks.onNetworkChange('reconnecting');
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      if (this.ws) this.ws.close();
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 7000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isOnline) {
        this.connect();
      }
    }, delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      if (data.type === 'INPUT' || data.type === 'FIRE') {
        this.offlineActionQueue.push(data);
        if (this.offlineActionQueue.length > 30) {
          this.offlineActionQueue.shift();
        }
      }
    }
  }

  flushOfflineQueue() {
    while (this.offlineActionQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const action = this.offlineActionQueue.shift();
      this.ws.send(JSON.stringify(action));
    }
  }

  startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = performance.now();
        this.send({ type: 'PING', clientTime: this.lastPingSent });
      }
    }, 2500);
  }

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'INIT': {
        this.playerId = msg.playerId;
        this.sessionId = msg.sessionId;
        localStorage.setItem('cybertanks_session_id', msg.sessionId);
        if (this.callbacks.onInit) {
          this.callbacks.onInit(msg);
        }
        break;
      }

      case 'RECONNECTED': {
        this.playerId = msg.playerId;
        if (this.callbacks.onReconnected) {
          this.callbacks.onReconnected(msg);
        }
        break;
      }

      case 'STATE': {
        this.lastTick = msg.snapshot.tick;
        if (this.callbacks.onState) {
          this.callbacks.onState(msg.snapshot);
        }
        break;
      }

      case 'CONFLICT': {
        if (this.callbacks.onConflict) {
          this.callbacks.onConflict(msg.event);
        }
        break;
      }

      case 'KILL': {
        if (this.callbacks.onKill) {
          this.callbacks.onKill(msg);
        }
        break;
      }

      case 'PONG': {
        this.ping = Math.round(performance.now() - this.lastPingSent);
        if (this.callbacks.onPing) {
          this.callbacks.onPing(this.ping);
        }
        break;
      }

      case 'ERROR': {
        if (msg.code === 'SESSION_EXPIRED') {
          localStorage.removeItem('cybertanks_session_id');
          this.sessionId = null;
          if (this.savedName && this.savedColor) {
            this.send({
              type: 'JOIN',
              name: this.savedName,
              color: this.savedColor
            });
          }
        }
        break;
      }
    }
  }
}
