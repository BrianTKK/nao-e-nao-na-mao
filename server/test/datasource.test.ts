import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApiDataSource, DEMO_PASSWORD, type Alert, type DataSource, type PublicAlert } from '@nenm/shared';
import { startTestServer, type TestServer } from './helpers';

/**
 * A camada de dados que o app e a web usam (shared/src/data/api.ts), contra o
 * servidor de verdade: três "telas" ao mesmo tempo, como no bar.
 */
let t: TestServer;
const sources: DataSource[] = [];
const source = (pollMs?: number) => {
  const memory: { v: string | null } = { v: null };
  const ds = createApiDataSource({ baseUrl: t.base, pollMs, tokenStore: { get: () => memory.v, set: (v) => void (memory.v = v) } });
  sources.push(ds);
  return ds;
};

const until = async <T>(get: () => T | undefined, ms = 4000): Promise<T> => {
  const start = Date.now();
  for (;;) {
    const v = get();
    if (v !== undefined) return v;
    if (Date.now() - start > ms) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 25));
  }
};

before(async () => {
  t = await startTestServer({ alertsPerMinutePerIp: 1000 });
});
after(async () => {
  await Promise.all(sources.map((s) => s.staff.signOut()));
  await t.stop();
});

test('o laço pelas três telas: página da mulher, app da equipe e quadro da gerência', async () => {
  const woman = source();
  const app = source();
  const board = source();
  await app.staff.signIn('diego@bar-esquina.test', DEMO_PASSWORD);
  await board.staff.signIn('marta@bar-esquina.test', DEMO_PASSWORD);

  let appList: Alert[] = [];
  const stopApp = app.staff.watchActiveAlerts((l) => (appList = l));
  let boardChanges = 0;
  const stopBoard = board.manager.watchAlerts(() => boardChanges++);
  let appConnection = '';
  app.watchConnection((s) => (appConnection = s));
  await until(() => (appConnection === 'online' ? true : undefined));

  // 1. A mulher lê o QR e pede ajuda.
  const spot = await woman.public.getSpot('esqbf7k2');
  assert.equal(spot?.label, 'Banheiro feminino');
  const { token } = await woman.public.createAlert('ESQBF7K2', 'unsafe');
  const views: PublicAlert[] = [];
  const stopWoman = woman.public.watchAlert(token, (a) => a && views.push(a));

  // 2. O app recebe em segundos.
  const t0 = Date.now();
  const incoming = await until(() => appList.find((a) => a.spotLabel === 'Banheiro feminino' && a.status === 'open'));
  assert.ok(Date.now() - t0 < 2000, `chegou em ${Date.now() - t0} ms`);

  // 3. "Estou indo" volta para a página dela e para o quadro.
  const boardBefore = boardChanges;
  await app.staff.startResponse(incoming.id);
  const onTheWay = await until(() => views.find((v) => v.status === 'on_the_way'));
  assert.equal(onTheWay.responderFirstName, 'Diego');
  assert.equal(onTheWay.responderAppearance, 'camisa preta');
  await until(() => (boardChanges > boardBefore ? true : undefined));
  const history = await board.manager.listAlerts({ from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(history.find((a) => a.id === incoming.id)?.status, 'on_the_way');

  // 4. Resolvido.
  await app.staff.resolveAlert(incoming.id, 'escorted');
  await until(() => views.find((v) => v.status === 'resolved'));
  await until(() => (appList.every((a) => a.id !== incoming.id) ? true : undefined));

  stopApp();
  stopBoard();
  stopWoman();
});

test('se o WebSocket da página cair, ela consulta a cada 3 s e acompanha mesmo assim', async () => {
  const woman = source(300); // consulta rápida só para o teste
  const app = source();
  await app.staff.signIn('ana@bar-esquina.test', DEMO_PASSWORD);
  const { token } = await woman.public.createAlert('ESQM07H6', 'leave');
  const views: PublicAlert[] = [];
  const stop = woman.public.watchAlert(token, (a) => a && views.push(a));
  await until(() => views.find((v) => v.status === 'open'));

  // Derruba todos os WebSockets das páginas (como uma queda de sinal) e impede a volta.
  const dropped = await t.dropAlertSockets();
  assert.ok(dropped > 0);

  const active = await app.staff.listActiveAlerts();
  const target = active.find((a) => a.spotLabel === 'Mesa 7' && a.status === 'open')!;
  await app.staff.startResponse(target.id);
  const seen = await until(() => views.find((v) => v.status === 'on_the_way'));
  assert.equal(seen.responderFirstName, 'Ana');
  stop();
});

test('login errado e sessão perdida', async () => {
  const app = source();
  await assert.rejects(app.staff.signIn('diego@bar-esquina.test', 'errada'), { code: 'invalid_credentials' });
  await assert.rejects(app.staff.signIn('nao-e-email', 'x'), { code: 'invalid_credentials' });
  assert.equal(await app.staff.currentStaff(), null);
  await assert.rejects(app.staff.listActiveAlerts(), { code: 'not_staff' });
});
