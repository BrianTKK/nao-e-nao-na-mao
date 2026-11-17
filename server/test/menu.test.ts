import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicSpot, VenueMenu } from '@nenm/shared';
import { startTestServer, OTHER_EMAIL, OTHER_PASSWORD, type TestServer } from './helpers';

/** Cardápio do próprio local: só a gerência do bar cadastra; a página de ajuda mostra. */
let t: TestServer;
let marta: string; // gerente do bar de demonstração
let diego: string; // equipe (não gerente)
let other: string; // gerente do bar B

// PNG de 1x1 de verdade.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const png = { contentType: 'image/png', base64: PNG.toString('base64') };

before(async () => {
  t = await startTestServer();
  [marta, diego] = await Promise.all([t.login('marta@bar-esquina.test'), t.login('diego@bar-esquina.test')]);
  other = await t.login(OTHER_EMAIL, OTHER_PASSWORD);
});
after(() => t.stop());

test('sem cardápio cadastrado, a página do QR recebe o cardápio vazio', async () => {
  const spot = await t.api<PublicSpot>('/spots/ESQBF7K2');
  assert.deepEqual(spot.body.menu, { url: null, files: [] });
});

test('a gerência envia uma foto; a página do QR mostra e o arquivo sai com o tipo certo', async () => {
  const added = await t.api<VenueMenu>('/manager/menu/files', { token: marta, body: png });
  assert.equal(added.status, 201);
  assert.equal(added.body.files.length, 1);
  const file = added.body.files[0];
  assert.match(file.url, /^\/api\/menu-files\/[0-9a-f-]{36}$/);

  const spot = await t.api<PublicSpot>('/spots/ESQBF7K2');
  assert.equal(spot.body.menu.files[0].id, file.id);

  const res = await fetch(`${t.base}${file.url}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);

  const removed = await t.api<VenueMenu>(`/manager/menu/files/${file.id}`, { method: 'DELETE', token: marta });
  assert.equal(removed.body.files.length, 0);
  assert.equal((await fetch(`${t.base}${file.url}`)).status, 404);
});

test('arquivo que não é a imagem que diz ser é recusado (tipo vem de quem envia)', async () => {
  const fakePng = { contentType: 'image/png', base64: Buffer.from('<svg onload=alert(1)>').toString('base64') };
  assert.equal((await t.api('/manager/menu/files', { token: marta, body: fakePng })).status, 400);
  const jpegAsPng = { contentType: 'image/jpeg', base64: png.base64 };
  assert.equal((await t.api('/manager/menu/files', { token: marta, body: jpegAsPng })).status, 400);
  const pdf = { contentType: 'application/pdf', base64: Buffer.from('%PDF-1.7').toString('base64') };
  assert.equal((await t.api('/manager/menu/files', { token: marta, body: pdf })).status, 400);
});

test('no máximo 10 fotos por bar', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await t.api('/manager/menu/files', { token: marta, body: png })).status, 201);
  const full = await t.api<{ error: string }>('/manager/menu/files', { token: marta, body: png });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, 'menu_full');
  const menu = (await t.api<VenueMenu>('/manager/menu', { token: marta })).body;
  for (const f of menu.files) await t.api(`/manager/menu/files/${f.id}`, { method: 'DELETE', token: marta });
});

test('o link do cardápio digital: só https, e vazio apaga', async () => {
  const ok = await t.api<VenueMenu>('/manager/menu/url', { method: 'PUT', token: marta, body: { url: 'https://cardapio.exemplo.com/bar' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.url, 'https://cardapio.exemplo.com/bar');
  assert.equal((await t.api<PublicSpot>('/spots/ESQBF7K2')).body.menu.url, 'https://cardapio.exemplo.com/bar');
  for (const url of ['http://cardapio.exemplo.com', 'javascript:alert(1)', 'https://a b.com', 'cardapio']) {
    assert.equal((await t.api('/manager/menu/url', { method: 'PUT', token: marta, body: { url } })).status, 400, url);
  }
  const cleared = await t.api<VenueMenu>('/manager/menu/url', { method: 'PUT', token: marta, body: { url: '' } });
  assert.equal(cleared.body.url, null);
});

test('a equipe sem gerência, quem não entrou e o outro bar não mexem no cardápio', async () => {
  assert.equal((await t.api('/manager/menu/files', { token: diego, body: png })).status, 403);
  assert.equal((await t.api('/manager/menu/files', { body: png })).status, 401);
  const mine = await t.api<VenueMenu>('/manager/menu/files', { token: marta, body: png });
  const id = mine.body.files[0].id;
  // O gerente do bar B não apaga a foto do bar A e não a vê no próprio cardápio.
  assert.equal((await t.api(`/manager/menu/files/${id}`, { method: 'DELETE', token: other })).status, 404);
  assert.equal((await t.api<VenueMenu>('/manager/menu', { token: other })).body.files.length, 0);
  assert.equal((await t.api<PublicSpot>('/spots/BARBX00001')).body.menu.files.length, 0);
  await t.api(`/manager/menu/files/${id}`, { method: 'DELETE', token: marta });
});

test('a foto pode ter até 3 MB; acima disso, a API recusa', async () => {
  const big = Buffer.alloc(3 * 1024 * 1024 + 10, 0);
  PNG.copy(big);
  const res = await t.api('/manager/menu/files', { token: marta, body: { contentType: 'image/png', base64: big.toString('base64') } });
  assert.ok(res.status === 400 || res.status === 413, `status ${res.status}`);
});
