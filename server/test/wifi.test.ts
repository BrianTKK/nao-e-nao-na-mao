import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicSpot, VenueWifi } from '@nenm/shared';
import { startTestServer, OTHER_EMAIL, OTHER_PASSWORD, type TestServer } from './helpers';

/** Wi-Fi do local: só a gerência do bar cadastra; a página do QR daquele bar mostra. */
let t: TestServer;
let marta: string;
let diego: string;
let other: string;

before(async () => {
  t = await startTestServer();
  [marta, diego] = await Promise.all([t.login('marta@bar-esquina.test'), t.login('diego@bar-esquina.test')]);
  other = await t.login(OTHER_EMAIL, OTHER_PASSWORD);
});
after(() => t.stop());

const put = (token: string | undefined, wifi: unknown) => t.api<VenueWifi | null>('/manager/wifi', { method: 'PUT', token, body: { wifi } });

test('sem Wi-Fi cadastrado, a página do QR recebe null', async () => {
  assert.equal((await t.api<PublicSpot>('/spots/ESQBF7K2')).body.wifi, null);
});

test('a gerência cadastra rede e senha; só a página do QR daquele bar mostra', async () => {
  const saved = await put(marta, { ssid: '  Esquina Clientes ', password: 'chope2026' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { ssid: 'Esquina Clientes', password: 'chope2026' });
  assert.deepEqual((await t.api<PublicSpot>('/spots/ESQBF7K2')).body.wifi, { ssid: 'Esquina Clientes', password: 'chope2026' });
  // O outro bar não vê nem recebe o Wi-Fi deste.
  assert.equal((await t.api<VenueWifi | null>('/manager/wifi', { token: other })).body, null);
  assert.equal((await t.api<PublicSpot>('/spots/BARBX00001')).body.wifi, null);
});

test('rede aberta: senha vazia vira null', async () => {
  const saved = await put(marta, { ssid: 'Esquina Aberta', password: '' });
  assert.deepEqual(saved.body, { ssid: 'Esquina Aberta', password: null });
});

test('limites: nome até 32, senha até 63, sem caractere de controle', async () => {
  assert.equal((await put(marta, { ssid: 'x'.repeat(33), password: null })).status, 400);
  assert.equal((await put(marta, { ssid: 'ok', password: 'x'.repeat(64) })).status, 400);
  assert.equal((await put(marta, { ssid: 'rede\nfalsa', password: null })).status, 400);
  assert.equal((await put(marta, { ssid: '', password: 'senha123' })).status, 400);
  assert.equal((await put(marta, { ssid: 'x'.repeat(32), password: 'y'.repeat(63) })).status, 200);
});

test('o banco também barra o que passar da API', async () => {
  await assert.rejects(t.db.query(`update venues set wifi_ssid = $1 where name = 'Bar Esquina da Vila'`, ['x'.repeat(33)]), /check constraint/);
  await assert.rejects(t.db.query(`update venues set wifi_ssid = null, wifi_password = 'abc' where name = 'Bar Esquina da Vila'`), /wifi_password_needs_ssid/);
});

test('null apaga; equipe sem gerência e quem não entrou não mexem', async () => {
  assert.equal((await put(diego, { ssid: 'invasor', password: null })).status, 403);
  assert.equal((await put(undefined, { ssid: 'invasor', password: null })).status, 401);
  const cleared = await put(marta, null);
  assert.equal(cleared.body, null);
  assert.equal((await t.api<PublicSpot>('/spots/ESQBF7K2')).body.wifi, null);
});
