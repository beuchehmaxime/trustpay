import type { Server as HttpServer } from 'http';

import { Server, type Socket } from 'socket.io';

import { config } from '../config/env';
import { verifyAccessToken } from './jwt';

/**
 * Realtime gateway (Socket.io). Clients authenticate with their access token in
 * the connection handshake and are joined to a per-user room, so the app can
 * push live notifications / status changes instead of relying on polling
 * (SRS COMM-002 / FR-NOT-001).
 *
 * Served under `/api/socket.io` so it flows through the existing nginx `/api/`
 * location (which already sets the WebSocket upgrade headers) - no extra proxy
 * config needed.
 */
let io: Server | null = null;

export function initRealtime(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: { origin: config.corsOrigins, credentials: true },
    // Mobile clients use the websocket transport directly; browsers may poll first.
    transports: ['websocket', 'polling'],
  });

  io.use((socket: Socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined;
      if (!token) return next(new Error('unauthorized'));
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
  });

  console.log('[realtime] socket.io ready on /api/socket.io');
}

/** Emit an event to every live connection for one user (no-op if realtime is off). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}
