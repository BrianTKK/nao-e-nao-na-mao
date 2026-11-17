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
import { createPush, senderFromConfig, type PushSender } from './push';

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
  /** Push remoto: sem isto, liga pela conta de serviço do FCM_SERVICE_ACCOUNT_FILE (ou fica desligado). */
  push?: { sender: PushSender | null; repeatAtMs?: number[] };
}

/**
 * Monta o servidor HTTP: API em /api, tempo real em /socket.io e a web
 * compilada no resto, na mesma origem (a página do QR em /q/<código> e o
 * painel em /painel).
 */
export function buildServer({ config, db, limits, push: pushOptions }: StartOptions) {
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
          // As fontes vêm do próprio site (@fontsource, em web/dist/assets). Sem isto, o helmet
          // deixa o padrão dele, "'self' https: data:", que aceitaria fonte de qualquer site.
          fontSrc: ["'self'"],
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
  // A foto do cardápio chega em base64 (até 3 MB, cerca de 4 MB em base64); o resto da API fica em 10 kB.
  app.use('/api/manager/menu/files', express.json({ limit: '4500kb' }));
  app.use('/api', express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

  const httpServer = createServer(app);
  const auth = createAuth(config, db);
  const realtime = createRealtime(httpServer, config, db, auth);
  const push = createPush({ db, sender: pushOptions ? pushOptions.sender : senderFromConfig(config.FCM_SERVICE_ACCOUNT_FILE), repeatAtMs: pushOptions?.repeatAtMs });

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
        push.alertChanged(id).catch((err) => console.error('push:', (err as Error).message));
      },
      disconnectUser: realtime.disconnectUser,
      limits: { alertsPerMinutePerIp: 6, loginsPer5MinPerIp: 10, ...limits },
      pushEnabled: push.enabled,
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
    push,
    close: () =>
      new Promise<void>((resolve) => {
        push.close();
        realtime.io.close(() => resolve());
      }),
  };
}
