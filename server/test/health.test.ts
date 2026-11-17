import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config';
import { migrate, resetDemo, seedDemo } from '../src/migrate';
import { startTestServer, VENUE_B, type TestServer } from './helpers';

let t: TestServer;
const repoRoot = loadConfig({ NODE_ENV: 'test' }).repoRoot;

before(async () => {
  t = await startTestServer();
});
after(() => t.stop());

test('saúde: a API responde e o banco está de pé', async () => {
  const res = await t.api('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, db: 'pglite' });
});

test('migração e seed: contas em hash, sem reaplicar nem duplicar', async () => {
  const { rows } = await t.db.query<{ password_hash: string }>("select password_hash from users where email like '%@bar-esquina.test'");
  assert.equal(rows.length, 4);
  for (const r of rows) assert.match(r.password_hash, /^\$2[aby]\$10\$/);
  assert.deepEqual(await migrate(t.db, repoRoot), []);
  assert.equal(await seedDemo(t.db, repoRoot), false);
});

test('cabeçalhos de segurança e corpo grande recusado', async () => {
  const res = await fetch(`${t.base}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.match(csp, /frame-ancestors 'none'/);
  // Fontes só do próprio site: nada de https: nem data: (as da web são @fontsource, servidas daqui).
  assert.match(csp, /(^|;)font-src 'self'(;|$)/);
  assert.match(csp, /(^|;)connect-src 'self' ws:\/\/127\.0\.0\.1:\d+(;|$)/);
  assert.equal(res.headers.get('x-powered-by'), null);
  const big = await t.api('/alerts', { body: { x: 'a'.repeat(20_000) } });
  assert.equal(big.status, 413);
});

test('rota inexistente da API devolve 404 em JSON', async () => {
  const res = await t.api('/nada');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'not_found' });
});

test('produção exige o segredo do token e o Postgres', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }), /DATABASE_URL/);
});

test('reinício diário: o bar de demonstração volta ao seed e o outro bar fica intacto', async () => {
  const token = await t.login('marta@bar-esquina.test');
  await t.api('/manager/spots', { token, body: { label: 'Mesa criada no teste', kind: 'table' } });
  await t.db.query("update staff set appearance = 'fantasia' where full_name = 'Diego Santos'");
  const otherBefore = await t.db.query('select count(*)::int as n from spots where venue_id = $1', [VENUE_B]);

  await resetDemo(t.db, repoRoot);

  const spots = await t.db.query<{ label: string }>("select label from spots where label = 'Mesa criada no teste'");
  assert.equal(spots.rows.length, 0);
  const diego = await t.db.query<{ appearance: string }>("select appearance from staff where full_name = 'Diego Santos'");
  assert.equal(diego.rows[0].appearance, 'camisa preta');
  const otherAfter = await t.db.query('select count(*)::int as n from spots where venue_id = $1', [VENUE_B]);
  assert.deepEqual(otherAfter.rows, otherBefore.rows);
  // As contas continuam entrando depois do reinício.
  assert.ok(await t.login('diego@bar-esquina.test'));
});
