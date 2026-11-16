import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import type { Config } from './config';
import type { Db } from './db';
import { createAuth } from './auth';
import { createRoutes, type RouteDeps } from './routes';
import { createRealtime } from './realtime';
import { errorHandler } from './errors';

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** ws(s)://<host> da própria requisição, só se o Host for um nome válido. */
function sameOriginSocket(req: express.Request): string {
  const host = req.headers.host ?? '';
  if (!HOST.test(host)) return "'self'";
  return `${req.protocol === 'https' ? 'wss' : 'ws'}://${host}`;
}

export interface StartOptions {
  config: Config;
  db: Db;
  limits?: Partial<RouteDeps['limits']>;
}

/**
 * Monta o servidor HTTP: API em /api, tempo real em /socket.io e a web
 * compilada no resto, na mesma origem (a página do QR em /q/<código> e o
 * painel em /painel).
 */
export function buildServer({ config, db, limits }: StartOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // WebSocket só para o próprio servidor. O 'self' já cobre wss:// no Chrome e no
          // Firefox; o endereço explícito garante os navegadores que não o tratam assim.
          connectSrc: ["'self'", (req) => sameOriginSocket(req as express.Request)],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // A página do QR não deve vazar a URL (com o código do local) para outros sites.
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Só o app no Expo web, em desenvolvimento, chama de outra origem. O app no
  // celular não envia Origin, e a web está na mesma origem.
  app.use('/api', cors({ origin: config.corsOrigins, credentials: false, allowedHeaders: ['content-type', 'authorization', 'x-alert-token'] }));
  app.use('/api', express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

  const httpServer = createServer(app);
  const auth = createAuth(config, db);
  const realtime = createRealtime(httpServer, config, db, auth);

  app.get('/api/health', async (_req, res) => {
    await db.query('select 1');
    res.json({ ok: true, db: db.engine });
  });

  app.use(
    '/api',
    createRoutes({
      db,
      auth,
      alertChanged: (id) => {
        realtime.alertChanged(id).catch((err) => console.error('tempo real:', err));
      },
      disconnectUser: realtime.disconnectUser,
      limits: { alertsPerMinutePerIp: 6, loginsPer5MinPerIp: 10, ...limits },
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Web compilada (web/dist), com as rotas do React caindo no index.html.
  if (existsSync(join(config.WEB_DIST, 'index.html'))) {
    app.use(express.static(config.WEB_DIST, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(config.WEB_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);

  return {
    httpServer,
    io: realtime.io,
    close: () => new Promise<void>((resolve) => realtime.io.close(() => resolve())),
  };
}
