import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db';
import { migrate, seedDemo } from '../src/migrate';
import { createApp } from '../src/app';

let server: Server;
let db: Db;
let base: string;

before(async () => {
  const config = loadConfig({ NODE_ENV: 'test', PGLITE_DIR: 'memory', WEB_DIST: '/nao-existe' });
  db = createDb(config);
  await migrate(db, config.repoRoot);
  await seedDemo(db, config.repoRoot);
  server = createServer(createApp({ config, db }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

test('saúde: a API responde e o banco está de pé', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, db: 'pglite' });
});

test('migração e seed: o bar fictício com as contas em hash', async () => {
  const { rows } = await db.query<{ email: string; password_hash: string }>('select email, password_hash from users order by email');
  assert.equal(rows.length, 4);
  for (const r of rows) assert.match(r.password_hash, /^\$2[aby]\$10\$/);
  const again = await migrate(db, loadConfig({ NODE_ENV: 'test' }).repoRoot);
  assert.deepEqual(again, []); // não reaplica
  assert.equal(await seedDemo(db, loadConfig({ NODE_ENV: 'test' }).repoRoot), false); // não duplica
});

test('cabeçalhos de segurança e corpo grande recusado', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-powered-by'), null);

  const big = await fetch(`${base}/api/qualquer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x: 'a'.repeat(20_000) }),
  });
  assert.equal(big.status, 413);
});

test('rota inexistente da API devolve 404 em JSON', async () => {
  const res = await fetch(`${base}/api/nada`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('produção exige o segredo do token e o Postgres', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }), /DATABASE_URL/);
});
