import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert, PublicAlert } from '@nenm/shared';
import { nextEvent, startTestServer, OTHER_EMAIL, OTHER_PASSWORD, type TestServer } from './helpers';

let t: TestServer;
let diego: string;
let ana: string;
let marta: string;
let other: string;

before(async () => {
  t = await startTestServer({ alertsPerMinutePerIp: 1000 });
  [diego, ana, marta] = await Promise.all(['diego', 'ana', 'marta'].map((n) => t.login(`${n}@bar-esquina.test`)));
  other = await t.login(OTHER_EMAIL, OTHER_PASSWORD);
});
after(() => t.stop());

const createAlert = async (spotCode = 'ESQBF7K2', kind = 'unsafe') => {
  const res = await t.api<{ token: string; shortCode: string }>('/alerts', { body: { spotCode, kind } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};

// ------------------------------------------------------------------ login

test('login errado: senha errada e e-mail que não existe dão a mesma resposta', async () => {
  const wrong = await t.api('/auth/login', { body: { email: 'diego@bar-esquina.test', password: 'errada' } });
  const nobody = await t.api('/auth/login', { body: { email: 'ninguem@bar-esquina.test', password: 'errada' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, { error: 'invalid_credentials' });
  assert.deepEqual(nobody, wrong);
});

test('e-mail malformado é recusado pela validação; o token abre /me', async () => {
  const res = await t.api<{ token: string; staff: { fullName: string; role: string } }>('/auth/login', {
    body: { email: 'DIEGO@bar-esquina.test ', password: 'demo-nenm-2026' },
  });
  assert.equal(res.status, 400); // e-mail com espaço é recusado pela validação
  const ok = await t.api<{ fullName: string }>('/me', { token: diego });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.fullName, 'Diego Santos');
});

test('sem token, com token falso ou de quem foi desativado: 401', async () => {
  assert.equal((await t.api('/me')).status, 401);
  assert.equal((await t.api('/me', { token: 'abc.def.ghi' })).status, 401);
  const forged = diego.slice(0, -4) + (diego.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal((await t.api('/staff/alerts/active', { token: forged })).status, 401);

  await t.db.query("update staff set active = false where full_name = 'Ana Lima'");
  assert.equal((await t.api('/me', { token: ana })).status, 401);
  await t.db.query("update staff set active = true where full_name = 'Ana Lima'");
});

test('a equipe comum não abre as rotas da gerência', async () => {
  assert.equal((await t.api('/manager/staff', { token: diego })).status, 403);
  assert.equal((await t.api('/manager/staff', { token: marta })).status, 200);
});

// ------------------------------------------------------------------ página da mulher

test('página do QR: local público, pedido criado, acompanhado só pelo token', async () => {
  const spot = await t.api<{ label: string; venueName: string }>('/spots/ESQBF7K2');
  assert.equal(spot.status, 200);
  assert.equal(spot.body.label, 'Banheiro feminino');
  assert.equal((await t.api('/spots/NAOEXISTE1')).status, 404);

  const { token, shortCode } = await createAlert();
  assert.match(token, /^[0-9a-f]{64}$/);
  const mine = await t.api<PublicAlert>('/alerts/mine', { alertToken: token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.shortCode, shortCode);
  assert.equal(mine.body.status, 'open');
});

test('leitura indevida: token errado, malformado ou ausente não lê pedido nenhum', async () => {
  await createAlert();
  assert.equal((await t.api('/alerts/mine', { alertToken: 'f'.repeat(64) })).status, 404);
  assert.equal((await t.api('/alerts/mine', { alertToken: "' or 1=1 --" })).status, 400);
  assert.equal((await t.api('/alerts/mine')).status, 400);
  assert.equal((await t.api('/alerts/mine/cancel', { method: 'POST', alertToken: 'f'.repeat(64) })).status, 404);
});

test('entrada inválida é recusada antes do banco', async () => {
  assert.equal((await t.api('/alerts', { body: { spotCode: 'ESQBF7K2', kind: 'outro' } })).status, 400);
  assert.equal((await t.api('/alerts', { body: { spotCode: 'x', kind: 'unsafe' } })).status, 400);
  assert.equal((await t.api('/alerts', { body: { spotCode: 'ESQBF7K2', kind: 'unsafe', extra: 1 } })).status, 400);
});

// ------------------------------------------------------------------ isolamento entre bares

test('leitura indevida pela equipe: outro bar não vê nem age sobre o pedido', async () => {
  await createAlert('ESQM12T3', 'leave');
  const mine = await t.api<Alert[]>('/staff/alerts/active', { token: diego });
  const target = mine.body.find((a) => a.spotLabel === 'Mesa 12')!;
  assert.ok(target);

  const list = await t.api<Alert[]>('/staff/alerts/active', { token: other });
  assert.ok(list.body.every((a) => a.venueId !== target.venueId));
  assert.equal((await t.api(`/staff/alerts/${target.id}`, { token: other })).status, 404);
  assert.equal((await t.api(`/staff/alerts/${target.id}/start`, { token: other, body: {} })).status, 404);
  const history = await t.api<Alert[]>(`/manager/alerts?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z`, { token: other });
  assert.ok(history.body.every((a) => a.venueId !== target.venueId));
  assert.equal((await t.api(`/staff/alerts/nao-e-uuid`, { token: diego })).status, 400);
});

// ------------------------------------------------------------------ o laço, com tempo real

test('o laço: página cria, app recebe em tempo real, "Estou indo" volta à página e ao quadro', async () => {
  const staffSocket = await t.socket({ token: diego });
  const boardSocket = await t.socket({ token: marta });
  const otherSocket = await t.socket({ token: other });
  let otherGotIt = false;
  otherSocket.on('alert:update', () => {
    otherGotIt = true;
  });

  const arrived = nextEvent<Alert>(staffSocket, 'alert:update');
  const { token } = await createAlert('ESQBF7K2', 'unsafe');
  const incoming = await arrived;
  assert.equal(incoming.status, 'open');
  assert.equal(incoming.spotLabel, 'Banheiro feminino');

  const womanSocket = await t.socket({ alertToken: token });
  const womanUpdate = nextEvent<PublicAlert>(womanSocket, 'public:update');
  const boardUpdate = nextEvent<Alert>(boardSocket, 'alert:update');
  const started = await t.api<Alert>(`/staff/alerts/${incoming.id}/start`, { token: diego, body: {} });
  assert.equal(started.status, 200);

  const seenByWoman = await womanUpdate;
  assert.equal(seenByWoman.status, 'on_the_way');
  assert.equal(seenByWoman.responderFirstName, 'Diego');
  assert.equal(seenByWoman.responderAppearance, 'camisa preta');
  const seenByBoard = await boardUpdate;
  assert.equal(seenByBoard.responderName, 'Diego Santos');
  assert.ok(seenByBoard.onTheWayAt);

  assert.equal((await t.api(`/staff/alerts/${incoming.id}/start`, { token: ana, body: {} })).status, 409);
  assert.equal((await t.api(`/staff/alerts/${incoming.id}/resolve`, { token: diego, body: { outcome: 'inventado' } })).status, 400);

  const resolvedForWoman = nextEvent<PublicAlert>(womanSocket, 'public:update');
  const done = await t.api<Alert>(`/staff/alerts/${incoming.id}/resolve`, { token: diego, body: { outcome: 'escorted', note: 'Até o carro' } });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'resolved');
  assert.equal((await resolvedForWoman).status, 'resolved');

  await new Promise((r) => setTimeout(r, 200));
  assert.equal(otherGotIt, false, 'o outro bar não pode receber o pedido');
});

test('a mulher cancela; a equipe recebe o cancelamento', async () => {
  const staffSocket = await t.socket({ token: diego });
  const { token } = await createAlert('ESQBAL3W', 'talk');
  const cancelled = new Promise<Alert>((resolve) => {
    staffSocket.on('alert:update', (a: Alert) => {
      if (a.status === 'cancelled') resolve(a);
    });
  });
  assert.equal((await t.api('/alerts/mine/cancel', { method: 'POST', alertToken: token })).status, 204);
  assert.equal((await cancelled).spotLabel, 'Balcão');
});

test('socket sem credencial ou com token falso é recusado', async () => {
  await assert.rejects(t.socket({}), /unauthorized/);
  await assert.rejects(t.socket({ token: 'falso' }), /unauthorized/);
  await assert.rejects(t.socket({ alertToken: 'curto' }), /unauthorized/);
});

test('gerência cria local com código aleatório de 10 caracteres', async () => {
  const res = await t.api<{ code: string; label: string }>('/manager/spots', { token: marta, body: { label: 'Mesa 30', kind: 'table' } });
  assert.equal(res.status, 201);
  assert.match(res.body.code, /^[ACDEFHJKMNPRTWXY34679]{10}$/);
  assert.equal((await t.api(`/spots/${res.body.code}`)).status, 200);
});

test('limite por IP nos pedidos e no login', async () => {
  const limited = await startTestServer({ alertsPerMinutePerIp: 2, loginsPer5MinPerIp: 2 });
  try {
    const codes = ['ESQBF7K2', 'ESQBM4P9', 'ESQM12T3'];
    const statuses = [];
    for (const spotCode of codes) statuses.push((await limited.api('/alerts', { body: { spotCode, kind: 'unsafe' } })).status);
    assert.deepEqual(statuses, [201, 201, 429]);

    const logins = [];
    for (let i = 0; i < 3; i++) logins.push((await limited.api('/auth/login', { body: { email: 'diego@bar-esquina.test', password: 'x' } })).status);
    assert.deepEqual(logins, [401, 401, 429]);
  } finally {
    await limited.stop();
  }
});
