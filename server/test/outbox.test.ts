import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApiDataSource, createOutbox, DEMO_PASSWORD, noticesFor, pendingFor, type Alert } from '@nenm/shared';
import { startTestServer, type TestServer } from './helpers';

/**
 * Toques da equipe com id (migração 008): o servidor aplica cada um uma vez só,
 * e a fila sem sinal do app (shared/src/data/outbox.ts) funciona contra o
 * servidor de verdade, com a rede cortada no fetch.
 */
let t: TestServer;
let diego: string;
let ana: string;
let marta: string;

before(async () => {
  t = await startTestServer({ alertsPerMinutePerIp: 1000 });
  [diego, ana, marta] = await Promise.all(['diego', 'ana', 'marta'].map((n) => t.login(`${n}@bar-esquina.test`)));
});
after(() => t.stop());

/** Cada alerta num local diferente, por causa do limite de pedidos por local. */
let n = 0;
const SPOTS = ['ESQBF7K2', 'ESQM12T3'];
const newAlert = async (): Promise<string> => {
  await t.db.query('delete from alerts');
  const res = await t.api<{ token: string }>('/alerts', { body: { spotCode: SPOTS[n++ % SPOTS.length], kind: 'unsafe' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const list = await t.api<Alert[]>('/staff/alerts/active', { token: diego });
  return list.body[0].id;
};
const actions = async (alertId: string) =>
  (await t.db.query<{ id: string; kind: string; queued_ms: number }>('select id, kind, queued_ms from staff_actions where alert_id = $1 order by created_at', [alertId])).rows;
const row = async (alertId: string) =>
  (await t.db.query<{ status: string; on_the_way_at: string; resolved_at: string; outcome: string; note: string }>('select * from alerts where id = $1', [alertId])).rows[0];

test('o mesmo toque enviado duas vezes é aplicado uma vez: sem segunda transição e sem segundo aviso', async () => {
  const id = await newAlert();
  const board = await t.socket({ token: marta });
  const updates: Alert[] = [];
  board.on('alert:update', (a: Alert) => a.id === id && updates.push(a));

  const actionId = randomUUID();
  const first = await t.api<Alert>(`/staff/alerts/${id}/start`, { token: diego, body: { actionId, queuedMs: 0 } });
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'on_the_way');
  const stamped = (await row(id)).on_the_way_at;

  await new Promise((r) => setTimeout(r, 30));
  const again = await t.api<Alert>(`/staff/alerts/${id}/start`, { token: diego, body: { actionId, queuedMs: 4200 } });
  assert.equal(again.status, 200);
  assert.equal(again.body.status, 'on_the_way');
  assert.equal((await row(id)).on_the_way_at, stamped);
  assert.deepEqual(await actions(id), [{ id: actionId, kind: 'start', queued_ms: 0 }]);

  await new Promise((r) => setTimeout(r, 150));
  assert.equal(updates.length, 1, 'o reenvio não avisa de novo o painel');
  board.close();
});

test('reenvio do "Encerrar" depois de aplicado devolve o alerta, e não "já foi encerrado"', async () => {
  const id = await newAlert();
  const actionId = randomUUID();
  const body = { outcome: 'escorted', note: 'Levei até o carro', actionId, queuedMs: 90_000 };
  assert.equal((await t.api(`/staff/alerts/${id}/resolve`, { token: diego, body })).status, 200);
  const closedAt = (await row(id)).resolved_at;

  const again = await t.api<Alert>(`/staff/alerts/${id}/resolve`, { token: diego, body });
  assert.equal(again.status, 200);
  assert.equal(again.body.outcome, 'escorted');
  assert.equal((await row(id)).resolved_at, closedAt);
  assert.deepEqual(await actions(id), [{ id: actionId, kind: 'resolve', queued_ms: 90_000 }]);

  // Sem id, a regra antiga continua: encerrar de novo é conflito.
  const plain = await t.api(`/staff/alerts/${id}/resolve`, { token: diego, body: { outcome: 'false_alarm' } });
  assert.equal(plain.status, 409);
  assert.deepEqual(plain.body, { error: 'invalid_transition' });
  assert.equal((await row(id)).outcome, 'escorted');
});

test('toque recusado não fica gravado; o id não vale para outro alerta, outra pessoa ou outro tipo de toque', async () => {
  const id = await newAlert();
  const taken = randomUUID();
  assert.equal((await t.api(`/staff/alerts/${id}/start`, { token: diego, body: { actionId: taken } })).status, 200);

  // A Ana chega depois: recusado, e o id dela não fica gravado.
  const late = randomUUID();
  const refused = await t.api(`/staff/alerts/${id}/start`, { token: ana, body: { actionId: late } });
  assert.equal(refused.status, 409);
  assert.deepEqual(refused.body, { error: 'already_taken' });
  assert.equal((await actions(id)).length, 1);

  // O id do Diego usado pela Ana, ou para outro tipo de toque: recusado sem mudar nada.
  for (const [who, path, body] of [
    [ana, 'start', { actionId: taken }],
    [diego, 'ack', { actionId: taken }],
    [diego, 'resolve', { actionId: taken, outcome: 'escorted' }],
  ] as const) {
    const res = await t.api(`/staff/alerts/${id}/${path}`, { token: who, body });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: 'action_id_reused' });
  }
  assert.equal((await row(id)).status, 'on_the_way');
});

test('entrada inválida: id que não é UUID, tempo de espera negativo ou grande demais e campo a mais', async () => {
  const id = await newAlert();
  for (const body of [{ actionId: 'abc' }, { actionId: randomUUID(), queuedMs: -1 }, { actionId: randomUUID(), queuedMs: 25 * 3600 * 1000 }, { outro: 1 }]) {
    assert.equal((await t.api(`/staff/alerts/${id}/ack`, { token: diego, body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await row(id)).status, 'open');
  // O app antigo (sem id) continua funcionando.
  assert.equal((await t.api(`/staff/alerts/${id}/ack`, { token: diego, body: {} })).status, 200);
  assert.equal((await row(id)).status, 'seen');
  assert.equal((await actions(id)).length, 0);
});

test('a equipe comum não encerra o alerta que outra pessoa assumiu; a gerência encerra', async () => {
  const id = await newAlert();
  assert.equal((await t.api(`/staff/alerts/${id}/start`, { token: diego, body: {} })).status, 200);
  const res = await t.api(`/staff/alerts/${id}/resolve`, { token: ana, body: { outcome: 'false_alarm' } });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'already_taken' });
  assert.equal((await row(id)).status, 'on_the_way');
  assert.equal((await t.api(`/staff/alerts/${id}/resolve`, { token: marta, body: { outcome: 'escorted' } })).status, 200);
  assert.equal((await row(id)).outcome, 'escorted');
});

// ------------------------------------------------------------------ a fila do app contra o servidor

/** O app do Diego, com a rede que o teste liga e desliga. */
async function diegoApp() {
  const net = { mode: 'up' as 'up' | 'down' | 'lost', sent: 0 };
  const memory: { v: string | null } = { v: null };
  const ds = createApiDataSource({
    baseUrl: t.base,
    tokenStore: { get: () => memory.v, set: (v) => void (memory.v = v) },
    actionTimeoutMs: 2000,
    fetch: async (input, init) => {
      if (net.mode === 'down') throw new TypeError('Network request failed');
      net.sent++;
      const res = await fetch(input, init);
      // O pedido chegou ao servidor, mas a resposta se perdeu no caminho.
      if (net.mode === 'lost') throw new TypeError('Network request failed');
      return res;
    },
  });
  const me = await ds.staff.signIn('diego@bar-esquina.test', DEMO_PASSWORD);
  const disk: { v: string | null } = { v: null };
  const outbox = createOutbox({ staff: ds.staff, storage: { get: () => disk.v, set: (v) => void (disk.v = v) } });
  return { ds, me, net, outbox };
}

test('fila do app: "Estou indo" tocado sem sinal chega quando a conexão volta, com o tempo de espera registrado', async () => {
  const id = await newAlert();
  const app = await diegoApp();
  app.net.mode = 'down';
  assert.equal(await app.outbox.perform({ kind: 'start', alertId: id, userId: app.me.id }), 'queued');
  assert.equal((await row(id)).status, 'open');

  await new Promise((r) => setTimeout(r, 60));
  app.net.mode = 'up';
  await app.outbox.flush(app.me.id);
  assert.equal(pendingFor(app.outbox.snapshot(), app.me.id).length, 0);
  assert.equal((await row(id)).status, 'on_the_way');
  const [action] = await actions(id);
  assert.equal(action.kind, 'start');
  assert.ok(action.queued_ms >= 50, `esperou ${action.queued_ms} ms`);
  await app.ds.staff.signOut();
});

test('fila do app: a resposta se perdeu, o app reenvia e o servidor não repete (um aviso só no painel)', async () => {
  const id = await newAlert();
  const app = await diegoApp();
  const board = await t.socket({ token: marta });
  const updates: string[] = [];
  board.on('alert:update', (a: Alert) => a.id === id && updates.push(a.status));

  app.net.mode = 'lost';
  assert.equal(await app.outbox.perform({ kind: 'resolve', alertId: id, userId: app.me.id, outcome: 'ride_called' }), 'queued');
  assert.equal((await row(id)).status, 'resolved');

  app.net.mode = 'up';
  await app.outbox.flush(app.me.id);
  assert.equal(app.outbox.snapshot().actions.length, 0);
  assert.equal(app.outbox.snapshot().notices.length, 0, 'não é conflito: foi o próprio toque');
  assert.equal((await actions(id)).length, 1);
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(updates, ['resolved']);
  board.close();
  await app.ds.staff.signOut();
});

test('fila do app: a Ana encerrou enquanto o Diego estava sem sinal; o toque dele não sobrescreve e vira aviso', async () => {
  const id = await newAlert();
  const app = await diegoApp();
  app.net.mode = 'down';
  await app.outbox.perform({ kind: 'ack', alertId: id, userId: app.me.id });
  await app.outbox.perform({ kind: 'start', alertId: id, userId: app.me.id, spotLabel: 'Banheiro feminino' });
  await app.outbox.perform({ kind: 'resolve', alertId: id, userId: app.me.id, outcome: 'false_alarm' });

  assert.equal((await t.api(`/staff/alerts/${id}/start`, { token: ana, body: {} })).status, 200);
  assert.equal((await t.api(`/staff/alerts/${id}/resolve`, { token: ana, body: { outcome: 'escorted', note: 'Ana levou até o táxi' } })).status, 200);

  app.net.mode = 'up';
  await app.outbox.flush(app.me.id);
  const after = await row(id);
  assert.equal(after.outcome, 'escorted');
  assert.equal(after.note, 'Ana levou até o táxi');
  assert.equal(app.outbox.snapshot().actions.length, 0);
  assert.deepEqual(
    noticesFor(app.outbox.snapshot(), app.me.id, id).map((x) => `${x.kind}:${x.reason}:${x.spotLabel}`),
    ['start:closed:Banheiro feminino'],
  );
  // O "Vi" do Diego chegou (não faz mal a ninguém); o "Estou indo" e o "Encerrar" não foram gravados.
  assert.deepEqual((await actions(id)).map((a) => a.kind), ['ack']);
  await app.ds.staff.signOut();
});

test('servidor que não responde no tempo vira "sem conexão": o toque fica guardado', async () => {
  const id = await newAlert();
  const memory: { v: string | null } = { v: null };
  let hang = false;
  const ds = createApiDataSource({
    baseUrl: t.base,
    tokenStore: { get: () => memory.v, set: (v) => void (memory.v = v) },
    actionTimeoutMs: 150,
    // Uma conexão que aceita o pedido e nunca responde, até o app desistir.
    fetch: (input, init) =>
      hang
        ? new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
        : fetch(input, init),
  });
  const me = await ds.staff.signIn('diego@bar-esquina.test', DEMO_PASSWORD);
  const outbox = createOutbox({ staff: ds.staff, storage: { get: () => null, set: () => {} } });
  hang = true;
  const t0 = Date.now();
  assert.equal(await outbox.perform({ kind: 'start', alertId: id, userId: me.id }), 'queued');
  assert.ok(Date.now() - t0 < 1500);
  hang = false;
  await outbox.flush(me.id);
  assert.equal((await row(id)).status, 'on_the_way');
  await ds.staff.signOut();
});

test('resposta 502, 503 ou 504 (servidor reiniciando atrás do proxy) também conta como sem conexão', async () => {
  for (const status of [502, 503, 504]) {
    const ds = createApiDataSource({ baseUrl: t.base, fetch: async () => new Response('<html>Bad Gateway</html>', { status }) });
    await assert.rejects(ds.public.createAlert('ESQBF7K2', 'unsafe'), (err: { code?: string }) => err.code === 'network');
  }
});
