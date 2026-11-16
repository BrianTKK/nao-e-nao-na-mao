import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert, PublicAlert, Spot, StaffMember } from '@nenm/shared';
import { loadConfig } from '../src/config';
import { resetDemo } from '../src/migrate';
import { nextEvent, startTestServer, OTHER_EMAIL, OTHER_PASSWORD, type TestServer } from './helpers';

/** F2: o que a gerência faz pelo painel, sempre só no próprio bar. */
let t: TestServer;
let marta: string;
let diego: string;
let other: string; // gerente do bar B
let staffA: StaffMember[];
let staffB: StaffMember[];

before(async () => {
  t = await startTestServer({ alertsPerMinutePerIp: 1000 });
  [marta, diego] = await Promise.all([t.login('marta@bar-esquina.test'), t.login('diego@bar-esquina.test')]);
  other = await t.login(OTHER_EMAIL, OTHER_PASSWORD);
  staffA = (await t.api<StaffMember[]>('/manager/staff', { token: marta })).body;
  staffB = (await t.api<StaffMember[]>('/manager/staff', { token: other })).body;
});
after(() => t.stop());

const byName = (name: string) => staffA.find((s) => s.fullName.startsWith(name))!;
const newAlert = async (spotCode = 'ESQBF7K2') => {
  await t.api('/alerts', { body: { spotCode, kind: 'unsafe' } });
  const active = (await t.api<Alert[]>('/staff/alerts/active', { token: marta })).body;
  return active[active.length - 1];
};

// ------------------------------------------------------------------ direcionar e assumir

test('direcionar: a pessoa escolhida recebe em tempo real; a página da mulher ainda não diz "a caminho"', async () => {
  const appSocket = await t.socket({ token: diego });
  const alert = await newAlert();
  const assigned = new Promise<Alert>((resolve) =>
    appSocket.on('alert:update', (a: Alert) => {
      if (a.id === alert.id && a.assignedToId) resolve(a);
    }),
  );
  const res = await t.api<Alert>(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: byName('Diego').id } });
  assert.equal(res.status, 200);
  assert.equal(res.body.assignedToName, 'Diego Santos');
  assert.equal(res.body.status, 'seen');
  assert.equal(res.body.responderId, null);
  assert.equal((await assigned).assignedToId, byName('Diego').id);

  // Diego aceita pelo app; aí sim vira "a caminho".
  const go = await t.api<Alert>(`/staff/alerts/${alert.id}/start`, { token: diego, body: {} });
  assert.equal(go.body.status, 'on_the_way');
  assert.equal(go.body.responderName, 'Diego Santos');
  // Depois de alguém a caminho, não se direciona mais.
  assert.equal((await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: byName('Ana').id } })).status, 409);
});

test('pelo painel: "Vi o pedido" e "Mandar Diego" chegam na hora à página dela e ao app dele', async () => {
  const res = await t.api<{ token: string }>('/alerts', { body: { spotCode: 'ESQM07H6', kind: 'leave' } });
  const token = res.body.token;
  const page = await t.socket({ alertToken: token });
  const app = await t.socket({ token: diego });
  const alert = (await t.api<Alert[]>('/staff/alerts/active', { token: marta })).body.find((a) => a.spotLabel === 'Mesa 7' && a.status === 'open')!;

  const seen = nextEvent<PublicAlert>(page, 'public:update');
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: marta, body: {} });
  const v1 = await seen;
  assert.equal(v1.status, 'seen');
  assert.equal(v1.assignedFirstName, null);

  const called = nextEvent<PublicAlert>(page, 'public:update');
  const appGot = new Promise<Alert>((resolve) => app.on('alert:update', (a: Alert) => a.id === alert.id && a.assignedToId && resolve(a)));
  await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: byName('Diego').id } });
  const v2 = await called;
  assert.equal(v2.assignedFirstName, 'Diego');
  assert.equal(v2.assignedAppearance, 'camisa preta');
  assert.equal(v2.responderFirstName, null); // ainda não diz "está indo"
  assert.equal((await appGot).assignedByName, 'Marta Ribeiro');

  const going = nextEvent<PublicAlert>(page, 'public:update');
  await t.api(`/staff/alerts/${alert.id}/start`, { token: diego, body: {} });
  const v3 = await going;
  assert.equal(v3.status, 'on_the_way');
  assert.equal(v3.responderFirstName, 'Diego');
  assert.equal(v3.assignedFirstName, null);

  // Pela rota sem login, a mesma visão.
  const mine = await t.api<PublicAlert>('/alerts/mine', { alertToken: token });
  assert.equal(mine.body.responderFirstName, 'Diego');
});

test('assumir: a própria gerente vai e encerra pelo painel', async () => {
  const alert = await newAlert('ESQM12T3');
  const go = await t.api<Alert>(`/staff/alerts/${alert.id}/start`, { token: marta, body: {} });
  assert.equal(go.body.responderName, 'Marta Ribeiro');
  const done = await t.api<Alert>(`/staff/alerts/${alert.id}/resolve`, { token: marta, body: { outcome: 'talk_resolved' } });
  assert.equal(done.body.status, 'resolved');
});

test('direcionar: só a gerência, só no próprio bar, só para quem é do bar e está ativo', async () => {
  const alert = await newAlert('ESQBAL3W');
  assert.equal((await t.api(`/manager/alerts/${alert.id}/assign`, { token: diego, body: { staffId: byName('Ana').id } })).status, 403);
  // Gerente do bar B não direciona pedido do bar A...
  assert.equal((await t.api(`/manager/alerts/${alert.id}/assign`, { token: other, body: { staffId: staffB[0].id } })).status, 404);
  // ...e a gerente do bar A não direciona para alguém do bar B.
  assert.equal((await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: staffB[0].id } })).status, 404);
  assert.equal((await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: 'x' } })).status, 400);
});

// ------------------------------------------------------------------ equipe

test('cadastrar alguém: entra com a senha provisória e só no bar de quem cadastrou', async () => {
  const res = await t.api<StaffMember>('/manager/staff', {
    token: marta,
    body: { email: 'Julia.Nova@Bar-Esquina.test', fullName: 'Júlia Nova', role: 'staff', jobTitle: 'Garçonete', trainedAt: '2026-11-01', password: 'provisoria-123' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.email, 'julia.nova@bar-esquina.test');
  const token = await t.login('julia.nova@bar-esquina.test', 'provisoria-123');
  const me = await t.api<StaffMember>('/me', { token });
  assert.equal(me.body.venueId, staffA[0].venueId);

  assert.equal((await t.api('/manager/staff', { token: marta, body: { email: 'julia.nova@bar-esquina.test', fullName: 'Outra', role: 'staff', password: 'provisoria-123' } })).status, 409);
  assert.equal((await t.api('/manager/staff', { token: marta, body: { email: 'curta@bar.test', fullName: 'Senha Curta', role: 'staff', password: '123' } })).status, 400);
  assert.equal((await t.api('/manager/staff', { token: diego, body: { email: 'x@bar.test', fullName: 'Pela Equipe', role: 'staff', password: 'provisoria-123' } })).status, 403);
});

test('desativar: perde o login, o token e o tempo real na hora', async () => {
  const created = await t.api<StaffMember>('/manager/staff', {
    token: marta,
    body: { email: 'temporario@bar-esquina.test', fullName: 'Temporário Silva', role: 'staff', password: 'provisoria-123' },
  });
  const token = await t.login('temporario@bar-esquina.test', 'provisoria-123');
  const socket = await t.socket({ token });
  const dropped = nextEvent<string>(socket, 'disconnect');

  const res = await t.api<StaffMember>(`/manager/staff/${created.body.id}`, { method: 'PATCH', token: marta, body: { active: false } });
  assert.equal(res.status, 200);
  assert.equal(res.body.active, false);
  assert.equal(await dropped, 'io server disconnect');
  assert.equal((await t.api('/me', { token })).status, 401);
  assert.equal((await t.api('/auth/login', { body: { email: 'temporario@bar-esquina.test', password: 'provisoria-123' } })).status, 401);
  await assert.rejects(t.socket({ token }), /unauthorized/);

  // Reativar devolve o acesso.
  await t.api(`/manager/staff/${created.body.id}`, { method: 'PATCH', token: marta, body: { active: true } });
  assert.ok(await t.login('temporario@bar-esquina.test', 'provisoria-123'));
});

test('equipe: um bar não mexe na equipe do outro, e ninguém tira o próprio acesso', async () => {
  const diegoId = byName('Diego').id;
  assert.equal((await t.api(`/manager/staff/${diegoId}`, { method: 'PATCH', token: other, body: { active: false } })).status, 404);
  assert.equal((await t.api<StaffMember[]>('/manager/staff', { token: other })).body.some((s) => s.id === diegoId), false);
  assert.equal((await t.api(`/manager/staff/${byName('Marta').id}`, { method: 'PATCH', token: marta, body: { active: false } })).status, 409);
  assert.equal((await t.api(`/manager/staff/${byName('Marta').id}`, { method: 'PATCH', token: marta, body: { role: 'staff' } })).status, 409);
  const trained = await t.api<StaffMember>(`/manager/staff/${diegoId}`, { method: 'PATCH', token: marta, body: { trainedAt: '2026-10-20' } });
  assert.equal(trained.body.trainedAt, '2026-10-20');
  assert.equal(trained.body.active, true);
});

// ------------------------------------------------------------------ locais e QR codes

test('locais: código aleatório, troca de código e desativar; o QR antigo para de funcionar', async () => {
  const created = await t.api<Spot>('/manager/spots', { token: marta, body: { label: 'Mesa 40', kind: 'table' } });
  const oldCode = created.body.code;
  assert.equal((await t.api(`/spots/${oldCode}`)).status, 200);

  const rotated = await t.api<Spot>(`/manager/spots/${created.body.id}/rotate-code`, { token: marta, body: {} });
  assert.match(rotated.body.code, /^[ACDEFHJKMNPRTWXY34679]{10}$/);
  assert.notEqual(rotated.body.code, oldCode);
  assert.equal((await t.api(`/spots/${oldCode}`)).status, 404);
  assert.equal((await t.api(`/spots/${rotated.body.code}`)).status, 200);

  assert.equal((await t.api(`/manager/spots/${created.body.id}`, { method: 'PATCH', token: marta, body: { active: false } })).status, 204);
  assert.equal((await t.api(`/spots/${rotated.body.code}`)).status, 404);
  assert.equal((await t.api('/alerts', { body: { spotCode: rotated.body.code, kind: 'unsafe' } })).status, 404);
});

test('locais: um bar não vê, não troca nem desativa os locais do outro', async () => {
  const spotsA = (await t.api<Spot[]>('/manager/spots', { token: marta })).body;
  const target = spotsA[0];
  assert.equal((await t.api<Spot[]>('/manager/spots', { token: other })).body.some((s) => s.id === target.id), false);
  assert.equal((await t.api(`/manager/spots/${target.id}/rotate-code`, { token: other, body: {} })).status, 404);
  assert.equal((await t.api(`/manager/spots/${target.id}`, { method: 'PATCH', token: other, body: { active: false } })).status, 404);
  assert.equal((await t.api(`/manager/spots/${target.id}/rotate-code`, { token: diego, body: {} })).status, 403);
});

// ------------------------------------------------------------------ segurança

test('CSP: o WebSocket só pode ir para a própria origem', async () => {
  const res = await fetch(`${t.base}/api/health`, { headers: { 'x-forwarded-proto': 'https' } });
  const csp = res.headers.get('content-security-policy') ?? '';
  const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!.trim();
  assert.match(connect, /^connect-src 'self' ws:\/\/127\.0\.0\.1:\d+$/);
  assert.doesNotMatch(csp, /(^|\s)wss?:(\s|;|$)/);
});

test('reinício da demonstração apaga também as contas criadas no painel', async () => {
  await t.api('/manager/staff', { token: marta, body: { email: 'efemera@bar-esquina.test', fullName: 'Conta Efêmera', role: 'staff', password: 'provisoria-123' } });
  await resetDemo(t.db, loadConfig({ NODE_ENV: 'test' }).repoRoot);
  const { rows } = await t.db.query("select 1 from users where email = 'efemera@bar-esquina.test'");
  assert.equal(rows.length, 0);
  const b = await t.db.query("select 1 from users where email = $1", [OTHER_EMAIL]);
  assert.equal(b.rows.length, 1);
});
