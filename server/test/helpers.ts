import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import bcrypt from 'bcryptjs';
import { DEMO_PASSWORD } from '@nenm/shared';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db';
import { migrate, seedDemo } from '../src/migrate';
import { buildServer, type StartOptions } from '../src/app';

export const VENUE_B = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e02';
export const OTHER_EMAIL = 'outro@bar-b.test';
export const OTHER_PASSWORD = 'senha-do-bar-b';

export interface TestServer {
  base: string;
  db: Db;
  api: <T = unknown>(path: string, init?: { method?: string; body?: unknown; token?: string; alertToken?: string }) => Promise<{ status: number; body: T }>;
  login: (email: string, password?: string) => Promise<string>;
  socket: (auth: Record<string, string>) => Promise<Socket>;
  /** Derruba, pelo servidor, os WebSockets das páginas das mulheres. Devolve quantos caíram. */
  dropAlertSockets: () => Promise<number>;
  stop: () => Promise<void>;
}

/** Servidor de verdade numa porta livre, com o Postgres embutido em memória, o bar de demonstração e um segundo bar. */
export async function startTestServer(limits?: StartOptions['limits'], push: StartOptions['push'] = { sender: null }): Promise<TestServer> {
  const config = loadConfig({ NODE_ENV: 'test', PGLITE_DIR: 'memory', WEB_DIST: '/nao-existe', JWT_SECRET: 'x'.repeat(40) });
  const db = createDb(config);
  await migrate(db, config.repoRoot);
  await seedDemo(db, config.repoRoot);

  const { rows } = await db.query<{ id: string }>('insert into users (email, password_hash) values ($1, $2) returning id', [
    OTHER_EMAIL,
    await bcrypt.hash(OTHER_PASSWORD, 4),
  ]);
  await db.exec(`
    insert into venues (id, name, help_phrase) values ('${VENUE_B}', 'Bar B', 'código B');
    insert into spots (venue_id, code, label) values ('${VENUE_B}', 'BARBX00001', 'Banheiro B');
    insert into staff (id, venue_id, full_name, role) values ('${rows[0].id}', '${VENUE_B}', 'Outra Pessoa', 'manager');
  `);

  const server = buildServer({ config, db, limits, push });
  await new Promise<void>((r) => server.httpServer.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];

  const api: TestServer['api'] = async (path, init = {}) => {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    if (init.alertToken) headers['x-alert-token'] = init.alertToken;
    const res = await fetch(`${base}/api${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as never };
  };

  return {
    base,
    db,
    api,
    async login(email, password = DEMO_PASSWORD) {
      const res = await api<{ token: string }>('/auth/login', { body: { email, password } });
      if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`);
      return res.body.token;
    },
    socket(auth) {
      return new Promise((resolve, reject) => {
        const s = connect(base, { auth, transports: ['websocket'], reconnection: false });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    },
    async dropAlertSockets() {
      const all = await server.io.fetchSockets();
      const pages = all.filter((s) => [...s.rooms].some((r) => r.startsWith('alert:')));
      pages.forEach((s) => s.disconnect(true));
      return pages.length;
    },
    async stop() {
      sockets.forEach((s) => s.close());
      server.httpServer.closeAllConnections();
      await server.close();
      await new Promise((r) => server.httpServer.close(r));
      await db.close();
    },
  };
}

/** Espera um evento do socket (ou falha depois de `ms`). */
export function nextEvent<T>(socket: Socket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sem ${event} em ${ms} ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
