import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from '../game/room.js';
import type { ClientMessage } from './protocol.js';

export class WebSocketHandler {
  private wss: WebSocketServer;
  private defaultRoom: GameRoom;
  private socketToPlayerId = new Map<WebSocket, string>();
  private socketToSessionId = new Map<WebSocket, string>();

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.defaultRoom = new GameRoom('neon-arena-1');
    this.init();
  }

  public getRoom(): GameRoom {
    return this.defaultRoom;
  }

  private init(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;
          this.handleMessage(ws, message);
        } catch {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Невалидный JSON запрос', code: 'BAD_REQUEST' }));
        }
      });

      ws.on('close', () => {
        const playerId = this.socketToPlayerId.get(ws);
        if (playerId) {
          this.defaultRoom.disconnectPlayer(playerId, ws);
          this.socketToPlayerId.delete(ws);
        }
        this.socketToSessionId.delete(ws);
      });

      ws.on('error', () => {
        ws.close();
      });
    });
  }

  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'JOIN': {
        const playerId = uuidv4();
        const sessionId = uuidv4();
        const tank = this.defaultRoom.addPlayer(playerId, msg.name, msg.color, sessionId, ws);

        this.socketToPlayerId.set(ws, playerId);
        this.socketToSessionId.set(ws, sessionId);

        ws.send(
          JSON.stringify({
            type: 'INIT',
            playerId: tank.id,
            sessionId,
            map: this.defaultRoom.map,
            tanks: this.defaultRoom.getSnapshot().tanks
          })
        );
        break;
      }

      case 'INPUT': {
        const playerId = this.socketToPlayerId.get(ws);
        if (playerId) {
          this.defaultRoom.handleInput(playerId, msg.direction, msg.isMoving, msg.sequence);
        }
        break;
      }

      case 'FIRE': {
        const playerId = this.socketToPlayerId.get(ws);
        if (playerId) {
          this.defaultRoom.handleFire(playerId, msg.timestamp);
        }
        break;
      }

      case 'RECONNECT': {
        const tank = this.defaultRoom.reconnectPlayer(msg.sessionId, ws);
        if (tank) {
          this.socketToPlayerId.set(ws, tank.id);
          this.socketToSessionId.set(ws, msg.sessionId);

          ws.send(
            JSON.stringify({
              type: 'RECONNECTED',
              playerId: tank.id,
              map: this.defaultRoom.map,
              snapshot: this.defaultRoom.getSnapshot()
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              message: 'Сессия истекла или комната перезапущена',
              code: 'SESSION_EXPIRED'
            })
          );
        }
        break;
      }

      case 'PING': {
        ws.send(
          JSON.stringify({
            type: 'PONG',
            clientTime: msg.clientTime,
            serverTime: Date.now()
          })
        );
        break;
      }
    }
  }

  public close(): void {
    this.defaultRoom.destroy();
    for (const ws of this.wss.clients) {
      ws.terminate();
    }
    this.wss.close();
  }
}
