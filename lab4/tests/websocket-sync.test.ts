import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import WebSocket from 'ws';
import { createApp } from '../src/server/app.js';
import { WebSocketHandler } from '../src/server/ws/handler.js';
import { initDatabase, closeDatabase } from '../src/server/db.js';

describe('CyberTanks WebSocket Synchronization and Reconnection', () => {
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

  it('connects, joins arena and receives authoritative INIT message', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const initPromise = new Promise<{ type: string; playerId: string; sessionId: string }>((resolve, reject) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'INIT') {
          resolve(msg);
        }
      });
      ws.on('error', reject);
    });

    await new Promise((resolve) => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'JOIN', name: 'Commander', color: '#3b82f6' }));

    const initMsg = await initPromise;
    expect(initMsg.type).toBe('INIT');
    expect(initMsg.playerId).toBeDefined();
    expect(initMsg.sessionId).toBeDefined();

    ws.close();
  });

  it('receives state snapshots and handles ping-pong', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await new Promise((resolve) => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'JOIN', name: 'Gunner', color: '#ef4444' }));

    const pongPromise = new Promise<{ type: string; clientTime: number }>((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'PONG') {
          resolve(msg);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'PING', clientTime: 12345 }));
    const pong = await pongPromise;
    expect(pong.type).toBe('PONG');
    expect(pong.clientTime).toBe(12345);

    ws.close();
  });

  it('supports reconnection and state restoration using sessionId', async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let sessionId = '';

    await new Promise((resolve) => ws1.on('open', resolve));
    ws1.send(JSON.stringify({ type: 'JOIN', name: 'GhostPilot', color: '#10b981' }));

    await new Promise<void>((resolve) => {
      ws1.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'INIT') {
          sessionId = msg.sessionId;
          resolve();
        }
      });
    });

    expect(sessionId).toBeTruthy();
    ws1.close();

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => ws2.on('open', resolve));

    const reconnectedPromise = new Promise<{ type: string; playerId: string }>((resolve) => {
      ws2.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'RECONNECTED') {
          resolve(msg);
        }
      });
    });

    ws2.send(JSON.stringify({ type: 'RECONNECT', sessionId, lastTick: 0 }));
    const reconnectedMsg = await reconnectedPromise;

    expect(reconnectedMsg.type).toBe('RECONNECTED');
    expect(reconnectedMsg.playerId).toBeDefined();

    ws2.close();
  });
});
