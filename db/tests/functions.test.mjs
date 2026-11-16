// Testa o esquema e as funções do banco num Postgres de verdade (PGlite, o
// Postgres 17 compilado para WebAssembly), sem Docker. Roda com: npm run test:db
// As regras de quem pode ver o quê na API ficam nos testes do server/.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

const VENUE_A = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01';
const VENUE_B = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e02';
const users = JSON.parse(read('../test-users.json')).users.map((u, i) => ({
  ...u,
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
}));
const diego = users.find((u) => u.email.startsWith('diego')).id;
const ana = users.find((u) => u.email.startsWith('ana')).id;
const OTHER = '00000000-0000-4000-8000-0000000000b1'; // equipe do bar B
const STRANGER = '00000000-0000-4000-8000-0000000000ff'; // conta sem cadastro na equipe

let db;

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(String(err.message), pattern);
    return true;
  });
}

const newAlert = async (code, kind) => (await db.query('select * from create_alert($1, $2)', [code, kind])).rows[0];
const view = async (token) => (await db.query('select * from get_alert_by_token($1)', [token])).rows[0];

before(async () => {
  db = new PGlite();
  await db.exec(read('../migrations/001_init.sql'));
  for (const u of users) {
    await db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [u.id, u.email, 'x']);
  }
  await db.exec(read('../seed.sql'));

  // Um segundo bar, com a própria equipe, para testar o isolamento.
  await db.query('insert into users (id, email, password_hash) values ($1, $2, $3), ($4, $5, $3)', [
    OTHER,
    'outro@bar-b.test',
    'x',
    STRANGER,
    'sem-cadastro@bar-b.test',
  ]);
  await db.exec(`
    insert into venues (id, name, help_phrase) values ('${VENUE_B}', 'Bar B', 'código B');
    insert into spots (venue_id, code, label) values ('${VENUE_B}', 'BARBX001', 'Banheiro B');
    insert into staff (id, venue_id, full_name, role) values ('${OTHER}', '${VENUE_B}', 'Outra Pessoa', 'staff');
  `);
});

test('o seed cria o bar, 6 locais, 4 pessoas e o histórico com tempos', async () => {
  const { rows } = await db.query(
    `select (select count(*) from spots where venue_id = $1)::int as spots,
            (select count(*) from staff where venue_id = $1)::int as staff,
            (select count(*) from alerts where venue_id = $1)::int as alerts,
            (select count(*) from alerts where venue_id = $1 and status = 'resolved' and on_the_way_at is null)::int as sem_tempo`,
    [VENUE_A],
  );
  assert.equal(rows[0].spots, 6);
  assert.equal(rows[0].staff, 4);
  assert.ok(rows[0].alerts >= 35, `histórico com ${rows[0].alerts} pedidos`);
  assert.equal(rows[0].sem_tempo, 0);
});

test('criar o pedido devolve um token de 64 caracteres; o banco guarda só o hash', async () => {
  const { token, short_code, venue_id } = await newAlert('esqbf7k2', 'unsafe');
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.match(short_code, /^[ACDEFHJKMNPRTWXY34679]{4}$/);
  assert.equal(venue_id, VENUE_A);
  const stored = await db.query('select count(*)::int as n from alerts where token_hash = $1', [token]);
  assert.equal(stored.rows[0].n, 0);

  const mine = await view(token);
  assert.equal(mine.status, 'open');
  assert.equal(mine.spot_label, 'Banheiro feminino');
  assert.equal(mine.venue_name, 'Bar Esquina da Vila');
});

test('um token errado não acompanha o pedido de ninguém', async () => {
  assert.equal(await view('0'.repeat(64)), undefined);
  assert.equal(await view(''), undefined);
});

test('local inexistente e tipo inválido são recusados', async () => {
  await rejects(newAlert('NAOEXISTE', 'unsafe'), /spot_not_found/);
  await rejects(newAlert('ESQBM4P9', 'qualquer'), /invalid_kind/);
});

test('limite: o 4º pedido do mesmo local no mesmo minuto é recusado', async () => {
  for (let i = 0; i < 3; i++) await newAlert('ESQM07H6', 'talk');
  await rejects(newAlert('ESQM07H6', 'talk'), /rate_limited/);
  await newAlert('ESQEXT9R', 'talk'); // outro local do mesmo bar ainda funciona
});

test('a equipe não age sobre pedido de outro bar', async () => {
  const b = await newAlert('BARBX001', 'leave');
  await rejects(db.query('select ack_alert($1, $2)', [diego, b.alert_id]), /alert_not_found/);
  await rejects(db.query('select start_response($1, $2)', [diego, b.alert_id]), /alert_not_found/);
  await rejects(db.query(`select resolve_alert($1, $2, 'escorted')`, [diego, b.alert_id]), /alert_not_found/);
  await db.query('select ack_alert($1, $2)', [OTHER, b.alert_id]); // a equipe do próprio bar pode
});

test('conta sem cadastro ativo na equipe não age sobre nada', async () => {
  const a = await newAlert('ESQBAL3W', 'unsafe');
  await rejects(db.query('select ack_alert($1, $2)', [STRANGER, a.alert_id]), /not_staff/);
  await db.query('update staff set active = false where id = $1', [ana]);
  await rejects(db.query('select start_response($1, $2)', [ana, a.alert_id]), /not_staff/);
  await db.query('update staff set active = true where id = $1', [ana]);
});

test('o laço completo: criado, visto, a caminho, resolvido, com os horários', async () => {
  const { alert_id: id, token } = await newAlert('ESQM12T3', 'leave');

  await db.query('select ack_alert($1, $2)', [ana, id]);
  let v = await view(token);
  assert.equal(v.status, 'seen');
  assert.ok(v.seen_at);
  assert.equal(v.responder_first_name, null);

  await db.query('select start_response($1, $2)', [diego, id]);
  v = await view(token);
  assert.equal(v.status, 'on_the_way');
  assert.equal(v.responder_first_name, 'Diego');
  assert.equal(v.responder_appearance, 'camisa preta');

  await rejects(db.query('select start_response($1, $2)', [ana, id]), /already_taken/);
  await db.query('select start_response($1, $2)', [diego, id]); // repetir o próprio toque não dá erro

  await rejects(db.query('select resolve_alert($1, $2, null)', [diego, id]), /outcome_required/);
  await rejects(db.query(`select resolve_alert($1, $2, 'inventado')`, [diego, id]), /check constraint/);
  await db.query(`select resolve_alert($1, $2, 'escorted', '  Acompanhei até o carro ')`, [diego, id]);

  const row = (await db.query('select * from alerts where id = $1', [id])).rows[0];
  assert.equal(row.status, 'resolved');
  assert.equal(row.outcome, 'escorted');
  assert.equal(row.note, 'Acompanhei até o carro');
  assert.equal(row.responder_id, diego);
  assert.ok(row.created_at <= row.seen_at && row.seen_at <= row.on_the_way_at && row.on_the_way_at <= row.resolved_at);

  await rejects(db.query('select start_response($1, $2)', [diego, id]), /invalid_transition/);
});

test('a mulher cancela o próprio pedido, e a equipe não age mais sobre ele', async () => {
  const { alert_id: id, token } = await newAlert('ESQBM4P9', 'talk');
  const cancelled = (await db.query('select * from cancel_alert_by_token($1)', [token])).rows[0];
  assert.equal(cancelled.alert_id, id);
  assert.equal(cancelled.venue_id, VENUE_A);
  assert.equal((await view(token)).status, 'cancelled');
  await rejects(db.query('select * from cancel_alert_by_token($1)', [token]), /alert_not_found/);
  await rejects(db.query('select start_response($1, $2)', [diego, id]), /invalid_transition/);
});

test('o token deixa de valer depois de 12 horas', async () => {
  const { token } = await newAlert('ESQBF7K2', 'unsafe');
  await db.query(`update alerts set created_at = now() - interval '13 hours' where token_hash = hash_token($1)`, [token]);
  assert.equal(await view(token), undefined);
  await rejects(db.query('select * from cancel_alert_by_token($1)', [token]), /alert_not_found/);
});

test('cada um muda só a própria roupa do dia', async () => {
  await db.query(`select set_appearance($1, 'camiseta branca')`, [ana]);
  const r = await db.query('select id, appearance from staff where id in ($1, $2)', [ana, diego]);
  const byId = Object.fromEntries(r.rows.map((x) => [x.id, x.appearance]));
  assert.equal(byId[ana], 'camiseta branca');
  assert.equal(byId[diego], 'camisa preta');
  await rejects(db.query(`select set_appearance($1, 'x')`, [STRANGER]), /not_staff/);
});

test('o estado não fica incoerente nem por um update direto (constraints)', async () => {
  const { alert_id: id } = await newAlert('ESQEXT9R', 'unsafe');
  await rejects(db.query(`update alerts set status = 'resolved' where id = $1`, [id]), /resolved_has_outcome/);
  await rejects(db.query(`update alerts set status = 'qualquer' where id = $1`, [id]), /check constraint/);
});
