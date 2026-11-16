import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Config } from './config';
import type { Db } from './db';
import { hashToken, type Auth } from './auth';
import { getAlert, getPublicAlertByHash } from './queries';

/**
 * Tempo real por Socket.IO (WebSocket, com reconexão automática no cliente).
 * Duas salas:
 * - `venue:<id>`: a equipe e a gerência do bar, que entram com o token de login;
 * - `alert:<hash do token>`: a página da mulher, que entra com o token do próprio pedido.
 * O servidor só avisa; o conteúdo de cada sala é só o que aquela pessoa pode ver.
 */
export function createRealtime(httpServer: HttpServer, config: Config, db: Db, auth: Auth) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins },
    // A página da mulher pode estar com sinal ruim: avisa a queda em ~25 s.
    pingInterval: 10_000,
    pingTimeout: 15_000,
    maxHttpBufferSize: 10_000,
  });

  io.use(async (socket, next) => {
    try {
      const { token, alertToken } = (socket.handshake.auth ?? {}) as { token?: string; alertToken?: string };
      if (token) {
        const actor = await auth.verify(token);
        socket.data.actor = actor;
        // Sala da pessoa: quando ela é desativada, o servidor derruba os sockets dela na hora.
        await socket.join([`venue:${actor.venueId}`, `user:${actor.id}`]);
        return next();
      }
      if (typeof alertToken === 'string' && /^[0-9a-f]{64}$/.test(alertToken)) {
        await socket.join(`alert:${hashToken(alertToken)}`);
        return next();
      }
      next(new Error('unauthorized'));
    } catch {
      next(new Error('unauthorized'));
    }
  });

  /** Depois de cada mudança num pedido: a equipe do bar recebe o pedido; a mulher, a visão dela. */
  async function alertChanged(alertId: string): Promise<void> {
    const { rows } = await db.query<{ venue_id: string; token_hash: string }>('select venue_id, token_hash from alerts where id = $1', [alertId]);
    const row = rows[0];
    if (!row) return;
    const [staffView, publicView] = await Promise.all([getAlert(db, row.venue_id, alertId), getPublicAlertByHash(db, row.token_hash)]);
    io.to(`venue:${row.venue_id}`).emit('alert:update', staffView);
    io.to(`alert:${row.token_hash}`).emit('public:update', publicView);
  }

  /** Derruba as conexões em tempo real de uma pessoa (desativada ou com o papel trocado). */
  function disconnectUser(userId: string): void {
    io.in(`user:${userId}`).disconnectSockets(true);
  }

  return { io, alertChanged, disconnectUser };
}

export type Realtime = ReturnType<typeof createRealtime>;
