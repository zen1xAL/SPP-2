import type { Direction, GameMap, GameSnapshot, ConflictEvent, Tank } from '../game/types.js';

export type ClientMessageType =
  | 'JOIN'
  | 'INPUT'
  | 'FIRE'
  | 'RECONNECT'
  | 'PING'
  | 'RESET';

export interface ClientJoinMessage {
  type: 'JOIN';
  name: string;
  color: string;
}

export interface ClientInputMessage {
  type: 'INPUT';
  direction: Direction;
  isMoving: boolean;
  sequence: number;
}

export interface ClientFireMessage {
  type: 'FIRE';
  sequence: number;
  timestamp: number;
}

export interface ClientReconnectMessage {
  type: 'RECONNECT';
  sessionId: string;
  lastTick: number;
}

export interface ClientPingMessage {
  type: 'PING';
  clientTime: number;
}

export interface ClientResetMessage {
  type: 'RESET';
}

export type ClientMessage =
  | ClientJoinMessage
  | ClientInputMessage
  | ClientFireMessage
  | ClientReconnectMessage
  | ClientPingMessage
  | ClientResetMessage;

export type ServerMessageType =
  | 'INIT'
  | 'STATE'
  | 'CONFLICT'
  | 'KILL'
  | 'PONG'
  | 'ERROR'
  | 'RECONNECTED';

export interface ServerInitMessage {
  type: 'INIT';
  playerId: string;
  sessionId: string;
  map: GameMap;
  tanks: Tank[];
}

export interface ServerStateMessage {
  type: 'STATE';
  snapshot: GameSnapshot;
}

export interface ServerConflictMessage {
  type: 'CONFLICT';
  event: ConflictEvent;
}

export interface ServerKillMessage {
  type: 'KILL';
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
}

export interface ServerPongMessage {
  type: 'PONG';
  clientTime: number;
  serverTime: number;
}

export interface ServerErrorMessage {
  type: 'ERROR';
  message: string;
  code: string;
}

export interface ServerReconnectedMessage {
  type: 'RECONNECTED';
  playerId: string;
  map: GameMap;
  snapshot: GameSnapshot;
}

export type ServerMessage =
  | ServerInitMessage
  | ServerStateMessage
  | ServerConflictMessage
  | ServerKillMessage
  | ServerPongMessage
  | ServerErrorMessage
  | ServerReconnectedMessage;
