import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importSPKI, jwtVerify } from 'jose';
import { ALARM_CHANNEL, type Alert } from '@nenm/shared';
import { createFcmSender, senderFromConfig, type PushMessage, type PushSender, type SendResult } from '../src/push';
import { startTestServer, OTHER_EMAIL, OTHER_PASSWORD, type TestServer } from './helpers';

// ------------------------------------------------------------------ FCM simulado

const sent: PushMessage[] = [];
/** Resposta do FCM simulado por token (o padrão é 'ok'). */
const answers = new Map<string, SendResult>();
const fake: PushSender = {
  async send(message) {
    sent.push(message);
    return answers.get(message.token) ?? 'ok';
  },
};

const REPEAT_MS = [150, 300, 450];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let t: TestServer;
let diego: string;
let ana: string;
let marta: string;
let other: string;

const TOKEN = { diego: 'tok-diego-aaaaaaaaaaaaaaaa:APA91b', ana: 'tok-ana-bbbbbbbbbbbbbbbbbbbb', marta: 'tok-marta-cccccccccccccccccc', other: 'tok-other-dddddddddddddddddd' };

before(async () => {
  t = await startTestServer({ alertsPerMinutePerIp: 1000 }, { sender: fake, repeatAtMs: REPEAT_MS });
  [diego, ana, marta] = await Promise.all(['diego', 'ana', 'marta'].map((n) => t.login(`${n}@bar-esquina.test`)));
  other = await t.login(OTHER_EMAIL, OTHER_PASSWORD);
  for (const [who, login] of [['diego', diego], ['ana', ana], ['marta', marta], ['other', other]] as const) {
    const res = await t.api('/me/push-token', { method: 'PUT', token: login, body: { token: TOKEN[who], platform: 'android' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { pushEnabled: true }, 'o app só deixa as repetições ao servidor se ele manda push');
  }
});
after(() => t.stop());
beforeEach(() => {
  sent.length = 0;
  answers.clear();
});

const createAlert = async (spotCode = 'ESQBF7K2') => {
  const res = await t.api<{ token: string; shortCode: string }>('/alerts', { body: { spotCode, kind: 'unsafe' } });
  assert.equal(res.status, 201);
  const active = (await t.api<Alert[]>('/staff/alerts/active', { token: marta })).body;
  return { ...res.body, alert: active[active.length - 1] };
};
const to = (token: string) => sent.filter((m) => m.token === token);

// ------------------------------------------------------------------ registro do token

test('registrar o token: precisa de login, formato válido e só Android', async () => {
  assert.equal((await t.api('/me/push-token', { method: 'PUT', body: { token: TOKEN.diego, platform: 'android' } })).status, 401);
  assert.equal((await t.api('/me/push-token', { method: 'PUT', token: diego, body: { token: 'curto', platform: 'android' } })).status, 400);
  assert.equal((await t.api('/me/push-token', { method: 'PUT', token: diego, body: { token: 'tem espaço no meio do token', platform: 'android' } })).status, 400);
  assert.equal((await t.api('/me/push-token', { method: 'PUT', token: diego, body: { token: TOKEN.diego, platform: 'ios' } })).status, 400);
  const { rows } = await t.db.query<{ n: number }>('select count(*)::int as n from push_tokens');
  assert.equal(rows[0].n, 4);
});

test('o token é do aparelho: se outra pessoa entra nele, passa para ela; sair remove só o seu', async () => {
  const shared = 'tok-celular-do-bar-eeeeeeeeeeeee';
  await t.api('/me/push-token', { method: 'PUT', token: diego, body: { token: shared, platform: 'android' } });
  await t.api('/me/push-token', { method: 'PUT', token: ana, body: { token: shared, platform: 'android' } });
  const owner = await t.db.query<{ full_name: string }>('select s.full_name from push_tokens p join staff s on s.id = p.user_id where p.token = $1', [shared]);
  assert.equal(owner.rows[0].full_name, 'Ana Lima');
  // Diego não apaga o token que agora é da Ana.
  assert.equal((await t.api('/me/push-token', { method: 'DELETE', token: diego, body: { token: shared } })).status, 204);
  assert.equal((await t.db.query('select 1 from push_tokens where token = $1', [shared])).rows.length, 1);
  assert.equal((await t.api('/me/push-token', { method: 'DELETE', token: ana, body: { token: shared } })).status, 204);
  assert.equal((await t.db.query('select 1 from push_tokens where token = $1', [shared])).rows.length, 0);
});

// ------------------------------------------------------------------ quem recebe

test('alerta novo: toda a equipe do bar recebe na hora, com o canal de alarme e sem a palavra-código', async () => {
  const { alert, shortCode } = await createAlert();
  await wait(50);
  assert.deepEqual(new Set(sent.map((m) => m.token)), new Set([TOKEN.diego, TOKEN.ana, TOKEN.marta]));
  assert.equal(to(TOKEN.other).length, 0, 'o outro bar não recebe');
  const m = to(TOKEN.diego)[0].data;
  assert.equal(m.channelId, ALARM_CHANNEL);
  assert.equal(m.tag, alert.id, 'a repetição substitui a notificação');
  assert.equal(JSON.parse(m.body).alertId, alert.id);
  assert.match(m.title, /Alerta · /);
  for (const msg of sent) assert.ok(!JSON.stringify(msg).toLowerCase().includes(shortCode.toLowerCase()), 'a palavra-código não vai na notificação');
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: diego, body: {} });
});

test('repete até alguém ver; o "vi" cancela as repetições', async () => {
  const { alert } = await createAlert('ESQBM4P9');
  await wait(REPEAT_MS[0] + 80);
  assert.equal(to(TOKEN.ana).length, 2, 'o toque e a primeira repetição');
  assert.match(to(TOKEN.ana)[1].data.title, /^Ninguém viu ainda/);
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: diego, body: {} });
  const before = sent.length;
  await wait(REPEAT_MS[2]);
  assert.equal(sent.length, before, 'depois do "vi", nada mais');
});

test('sem ninguém ver, toca as repetições todas e para', async () => {
  const { alert } = await createAlert('ESQM07H6');
  await wait(REPEAT_MS[REPEAT_MS.length - 1] + 200);
  assert.equal(to(TOKEN.marta).length, 1 + REPEAT_MS.length);
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: marta, body: {} });
});

test('designado: só a pessoa escolhida recebe, até tocar em "Estou indo"', async () => {
  const { alert } = await createAlert('ESQM12T3');
  const staff = (await t.api<{ id: string; fullName: string }[]>('/manager/staff', { token: marta })).body;
  const anaId = staff.find((s) => s.fullName.startsWith('Ana'))!.id;
  await wait(30);
  sent.length = 0;
  await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: anaId } });
  await wait(50);
  assert.deepEqual(sent.map((m) => m.token), [TOKEN.ana]);
  assert.match(sent[0].data.title, /^Marta pediu que você vá/);
  await wait(REPEAT_MS[0] + 30);
  assert.equal(to(TOKEN.ana).length, 2, 'repete para ela');
  await t.api(`/staff/alerts/${alert.id}/start`, { token: ana, body: {} });
  const before = sent.length;
  await wait(REPEAT_MS[2]);
  assert.equal(sent.length, before, '"Estou indo" para o alarme dela');
  assert.equal(to(TOKEN.diego).length, 0, 'o alerta novo parou quando a gerência designou');
});

test('token inválido (UNREGISTERED) é apagado; erro passageiro, não', async () => {
  answers.set(TOKEN.diego, 'invalid_token');
  answers.set(TOKEN.ana, 'error');
  const { alert } = await createAlert('ESQBAL3W');
  await wait(50);
  const left = (await t.db.query<{ token: string }>('select token from push_tokens')).rows.map((r) => r.token);
  assert.ok(!left.includes(TOKEN.diego));
  assert.ok(left.includes(TOKEN.ana));
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: ana, body: {} });
  await t.api('/me/push-token', { method: 'PUT', token: diego, body: { token: TOKEN.diego, platform: 'android' } });
});

test('token de login vencido: o aparelho deixa de receber, mesmo sem ter tocado em "Sair"', async () => {
  const exp = await t.db.query<{ expired: boolean }>("select expires_at > now() + interval '15 hours' as expired from push_tokens where token = $1", [TOKEN.ana]);
  assert.equal(exp.rows[0].expired, true, 'vale até o fim do login (16 h)');
  await t.db.query("update push_tokens set expires_at = now() - interval '1 minute' where token = $1", [TOKEN.ana]);
  const { alert } = await createAlert('ESQBF7K2');
  await wait(50);
  assert.equal(to(TOKEN.ana).length, 0);
  assert.equal(to(TOKEN.diego).length, 1);
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: marta, body: {} });
  await t.api('/me/push-token', { method: 'PUT', token: ana, body: { token: TOKEN.ana, platform: 'android' } });
});

test('designado: depois das repetições, um "vi" de outra pessoa não recomeça o alarme; designar de novo, sim', async () => {
  const { alert } = await createAlert('ESQBM4P9');
  const staff = (await t.api<{ id: string; fullName: string }[]>('/manager/staff', { token: marta })).body;
  const anaId = staff.find((s) => s.fullName.startsWith('Ana'))!.id;
  await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: anaId } });
  await wait(REPEAT_MS[REPEAT_MS.length - 1] + 150);
  const afterCycle = to(TOKEN.ana).length;
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: diego, body: {} });
  await wait(100);
  assert.equal(to(TOKEN.ana).length, afterCycle, 'o ciclo terminado não volta a tocar');
  await wait(20);
  await t.api(`/manager/alerts/${alert.id}/assign`, { token: marta, body: { staffId: anaId } });
  await wait(80);
  assert.equal(to(TOKEN.ana).length, afterCycle + 1, 'nova designação toca de novo');
  await t.api(`/staff/alerts/${alert.id}/start`, { token: ana, body: {} });
});

test('desativada pela gerência, a pessoa deixa de receber', async () => {
  const staff = (await t.api<{ id: string; fullName: string }[]>('/manager/staff', { token: marta })).body;
  const diegoId = staff.find((s) => s.fullName.startsWith('Diego'))!.id;
  await t.db.query('update staff set active = false where id = $1', [diegoId]);
  const { alert } = await createAlert('ESQEXT9R');
  await wait(50);
  assert.equal(to(TOKEN.diego).length, 0);
  await t.db.query('update staff set active = true where id = $1', [diegoId]);
  await t.api(`/staff/alerts/${alert.id}/ack`, { token: marta, body: {} });
});

// ------------------------------------------------------------------ o envio pelo FCM v1

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = { type: 'service_account' as const, project_id: 'mariana-teste', client_email: 'push@mariana-teste.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth.test/token' };

function fakeGoogle(fcm: (body: unknown) => { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === account.token_uri) return Response.json({ access_token: 'acesso-1', expires_in: 3600 });
    const r = fcm(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { calls, doFetch };
}

test('FCM v1: OAuth com a conta de serviço, token de acesso reaproveitado e mensagem só de dados com prioridade alta', async () => {
  const g = fakeGoogle(() => ({ status: 200, body: { name: 'projects/mariana-teste/messages/1' } }));
  const sender = createFcmSender({ account, fetch: g.doFetch, fcmBase: 'https://fcm.test', log: () => {} });
  assert.equal(await sender.send({ token: 'abc', data: { title: 'x' } }), 'ok');
  assert.equal(await sender.send({ token: 'def', data: { title: 'y' } }), 'ok');

  const oauth = g.calls.filter((c) => c.url === account.token_uri);
  assert.equal(oauth.length, 1, 'o token de acesso vale 1 h e é reaproveitado');
  const form = new URLSearchParams(String(oauth[0].init.body));
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const { payload } = await jwtVerify(form.get('assertion')!, await importSPKI(publicKey, 'RS256'), { audience: account.token_uri, issuer: account.client_email });
  assert.equal(payload.scope, 'https://www.googleapis.com/auth/firebase.messaging');

  const send = g.calls.find((c) => c.url.startsWith('https://fcm.test'))!;
  assert.equal(send.url, 'https://fcm.test/v1/projects/mariana-teste/messages:send');
  assert.equal((send.init.headers as Record<string, string>).authorization, 'Bearer acesso-1');
  const body = JSON.parse(String(send.init.body));
  assert.deepEqual(body.message.android, { priority: 'high', ttl: '120s' });
  assert.equal(body.message.notification, undefined, 'só dados: o app monta a notificação com o canal de alarme');
  assert.deepEqual(body.message.data, { title: 'x' });
});

test('FCM v1: modo de validação (push:test --validar) manda validate_only a um tópico, sem token', async () => {
  const g = fakeGoogle(() => ({ status: 200, body: { name: 'projects/mariana-teste/messages/fake_message_id' } }));
  const sender = createFcmSender({ account, fetch: g.doFetch, fcmBase: 'https://fcm.test', log: () => {}, validateOnly: { topic: 'mariana-validacao' } });
  assert.equal(await sender.send({ token: 'qualquer', data: { title: 'x' } }), 'ok');
  const body = JSON.parse(String(g.calls.find((c) => c.url.startsWith('https://fcm.test'))!.init.body));
  assert.equal(body.validate_only, true);
  assert.equal(body.message.topic, 'mariana-validacao');
  assert.equal(body.message.token, undefined);
});

test('FCM v1: 404, UNREGISTERED, SENDER_ID_MISMATCH e token malformado dizem token inválido; o resto é erro', async () => {
  const replies = [
    { status: 404, body: { error: { status: 'NOT_FOUND' } } },
    { status: 400, body: { error: { details: [{ errorCode: 'UNREGISTERED' }] } } },
    { status: 403, body: { error: { status: 'PERMISSION_DENIED', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } } },
    { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } } },
    { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at message.android.ttl' } } },
    { status: 500, body: { error: { status: 'INTERNAL' } } },
  ];
  const g = fakeGoogle(() => replies.shift()!);
  const sender = createFcmSender({ account, fetch: g.doFetch, fcmBase: 'https://fcm.test', log: () => {} });
  assert.equal(await sender.send({ token: 'a', data: {} }), 'invalid_token');
  assert.equal(await sender.send({ token: 'b', data: {} }), 'invalid_token');
  assert.equal(await sender.send({ token: 'c', data: {} }), 'invalid_token', 'token de outro projeto');
  assert.equal(await sender.send({ token: 'd', data: {} }), 'invalid_token', 'não é um token do FCM');
  assert.equal(await sender.send({ token: 'e', data: {} }), 'error', 'mensagem malformada não apaga o token');
  assert.equal(await sender.send({ token: 'f', data: {} }), 'error');
});

test('sem a conta de serviço, o push fica desligado com um aviso; arquivo ruim não vaza o conteúdo no log', () => {
  const logs: string[] = [];
  assert.equal(senderFromConfig(undefined, (m) => logs.push(m)), null);
  assert.match(logs[0], /desligado: FCM_SERVICE_ACCOUNT_FILE não definido/);

  const dir = mkdtempSync(join(tmpdir(), 'fcm-'));
  const bad = join(dir, 'conta.json');
  writeFileSync(bad, '{"private_key": "-----BEGIN PRIVATE KEY-----SEGREDO' );
  assert.equal(senderFromConfig(bad, (m) => logs.push(m)), null);
  assert.ok(!logs[1].includes('SEGREDO'), logs[1]);
  assert.match(logs[1], /não é um JSON válido/);

  const good = join(dir, 'boa.json');
  writeFileSync(good, JSON.stringify(account));
  assert.notEqual(senderFromConfig(good, (m) => logs.push(m)), null);
  assert.match(logs[2], /ligado \(FCM, projeto mariana-teste\)/);
});

test('servidor sem a conta de serviço: aceita o token e avisa que o push está desligado', async () => {
  const off = await startTestServer({ alertsPerMinutePerIp: 1000 });
  try {
    const login = await off.login('diego@bar-esquina.test');
    const res = await off.api('/me/push-token', { method: 'PUT', token: login, body: { token: TOKEN.diego, platform: 'android' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { pushEnabled: false });
  } finally {
    await off.stop();
  }
});
