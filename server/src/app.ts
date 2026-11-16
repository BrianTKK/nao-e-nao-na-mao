import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { Config } from './config';
import type { Db } from './db';

export interface AppDeps {
  config: Config;
  db: Db;
}

/**
 * A aplicação HTTP: API em /api e a web compilada no resto, na mesma origem
 * (a página do QR em /q/<código> e o painel em /painel).
 */
export function createApp({ config, db }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // WebSocket na mesma origem.
          connectSrc: ["'self'", 'ws:', 'wss:'],
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
  app.use('/api', cors({ origin: config.corsOrigins, credentials: false }));
  app.use('/api', express.json({ limit: '10kb' }));

  app.get('/api/health', async (_req, res) => {
    await db.query('select 1');
    res.json({ ok: true, db: db.engine });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Web compilada (web/dist), com as rotas do React caindo no index.html.
  if (existsSync(join(config.WEB_DIST, 'index.html'))) {
    app.use(express.static(config.WEB_DIST, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(config.WEB_DIST, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status === 413 ? 'payload_too_large' : status === 400 ? 'bad_request' : 'internal_error' });
  };
  app.use(onError);

  return app;
}
