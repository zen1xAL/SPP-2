import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import WebSocket from 'ws';
import { createApp } from '../src/server/app.js';
import { WebSocketHandler } from '../src/server/ws/handler.js';
import { initDatabase, closeDatabase } from '../src/server/db.js';
import type { ServerMessage } from '../src/server/ws/protocol.js';

describe('Multiplayer Concurrency & Independent Sessions', () => {
  let server: http.Server;
  let wsHandler: WebSocketHandler;
  let port: number;

  beforeAll(async () => {
    await initDatabase();
    server = http.createServer();
    const app = createApp(() => wsHandler.getRoom());
    server.on('request', app);
    wsHandler = new WebSocketHandler(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve();
      });
    });
  });

  afterAll(async () => {
    wsHandler.close();
    await closeDatabase();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('allows two distinct players to join simultaneously and receive snapshots with both tanks', async () => {
    const ws1 = new WebSocket(`ws://localhost:${port}/ws`);
    const ws2 = new WebSocket(`ws://localhost:${port}/ws`);

    await Promise.all([
      new Promise<void>((res) => ws1.on('open', () => res())),
      new Promise<void>((res) => ws2.on('open', () => res()))
    ]);

    let init1: ServerMessage | null = null;
    let init2: ServerMessage | null = null;

    const p1Init = new Promise<void>((res) => {
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'INIT') {
          init1 = msg;
          res();
        }
      });
    });

    const p2Init = new Promise<void>((res) => {
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'INIT') {
          init2 = msg;
          res();
        }
      });
    });

    ws1.send(JSON.stringify({ type: 'JOIN', name: 'Alpha', color: '#3b82f6' }));
    ws2.send(JSON.stringify({ type: 'JOIN', name: 'Beta', color: '#ef4444' }));

    await Promise.all([p1Init, p2Init]);

    expect(init1).toBeDefined();
    expect(init2).toBeDefined();
    if (init1 && init1.type === 'INIT' && init2 && init2.type === 'INIT') {
      expect(init1.playerId).not.toBe(init2.playerId);
      expect(init1.sessionId).not.toBe(init2.sessionId);
    }

    const stateReceived = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'STATE' && msg.snapshot.tanks.length >= 2) {
          clearTimeout(timeout);
          resolve(true);
        }
      });
    });

    expect(stateReceived).toBe(true);

    ws1.close();
    ws2.close();
  });

  it('handles independent movement inputs from multiple players simultaneously', async () => {
    const ws1 = new WebSocket(`ws://localhost:${port}/ws`);
    const ws2 = new WebSocket(`ws://localhost:${port}/ws`);

    await Promise.all([
      new Promise<void>((res) => ws1.on('open', () => res())),
      new Promise<void>((res) => ws2.on('open', () => res()))
    ]);

    const waitInit = (ws: WebSocket, name: string, color: string) =>
      new Promise<string>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString()) as ServerMessage;
          if (msg.type === 'INIT') {
            resolve(msg.playerId);
          }
        });
        ws.send(JSON.stringify({ type: 'JOIN', name, color }));
      });

    const [id1, id2] = await Promise.all([
      waitInit(ws1, 'Speedy1', '#10b981'),
      waitInit(ws2, 'Speedy2', '#f59e0b')
    ]);

    expect(id1).not.toBe(id2);

    ws1.send(JSON.stringify({ type: 'INPUT', direction: 'RIGHT', isMoving: true, sequence: 1 }));
    ws2.send(JSON.stringify({ type: 'INPUT', direction: 'DOWN', isMoving: true, sequence: 1 }));

    const movementConfirmed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'STATE') {
          const t1 = msg.snapshot.tanks.find((t) => t.id === id1);
          const t2 = msg.snapshot.tanks.find((t) => t.id === id2);
          if (t1 && t2 && t1.direction === 'RIGHT' && t2.direction === 'DOWN') {
            clearTimeout(timeout);
            resolve(true);
          }
        }
      });
    });

    expect(movementConfirmed).toBe(true);

    ws1.close();
    ws2.close();
  });

  it('preserves player 2 session when player 1 disconnects and reconnects', async () => {
    const ws1 = new WebSocket(`ws://localhost:${port}/ws`);
    const ws2 = new WebSocket(`ws://localhost:${port}/ws`);

    await Promise.all([
      new Promise<void>((res) => ws1.on('open', () => res())),
      new Promise<void>((res) => ws2.on('open', () => res()))
    ]);

    let session1 = '';
    let player1Id = '';

    const p1Ready = new Promise<void>((resolve) => {
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'INIT') {
          session1 = msg.sessionId;
          player1Id = msg.playerId;
          resolve();
        }
      });
      ws1.send(JSON.stringify({ type: 'JOIN', name: 'Persistent1', color: '#8b5cf6' }));
    });

    let player2Id = '';
    const p2Ready = new Promise<void>((resolve) => {
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'INIT') {
          player2Id = msg.playerId;
          resolve();
        }
      });
      ws2.send(JSON.stringify({ type: 'JOIN', name: 'Steady2', color: '#06b6d4' }));
    });

    await Promise.all([p1Ready, p2Ready]);
    expect(session1).toBeTruthy();

    ws1.close();
    await new Promise((r) => setTimeout(r, 100));

    const ws1Reconnected = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((res) => ws1Reconnected.on('open', () => res()));

    const reconnectSuccess = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2500);
      ws1Reconnected.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'RECONNECTED') {
          clearTimeout(timeout);
          resolve(msg.playerId === player1Id);
        }
      });
      ws1Reconnected.send(JSON.stringify({ type: 'RECONNECT', sessionId: session1, lastTick: 0 }));
    });

    expect(reconnectSuccess).toBe(true);

    const p2StillActive = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'STATE') {
          const t2 = msg.snapshot.tanks.find((t) => t.id === player2Id);
          if (t2 && t2.isAlive) {
            clearTimeout(timeout);
            resolve(true);
          }
        }
      });
    });

    expect(p2StillActive).toBe(true);

    ws1Reconnected.close();
    ws2.close();
  });
});
