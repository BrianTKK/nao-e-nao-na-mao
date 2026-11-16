// Testa as regras de acesso do banco num Postgres de verdade (PGlite, o
// Postgres compilado para WebAssembly), com os papéis do Supabase imitados
// em supabase-shim.sql. Roda com: npm run test:db
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
const marta = users.find((u) => u.email.startsWith('marta')).id;
const OTHER = '00000000-0000-4000-8000-0000000000b1'; // equipe do bar B

let db;

async function as(role, sub, fn) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(sub ? { sub, role } : { role }),
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const anon = (fn) => as('anon', null, fn);
const staff = (id, fn) => as('authenticated', id, fn);

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(String(err.message), pattern);
    return true;
  });
}

before(async () => {
  db = new PGlite();
  await db.exec(read('supabase-shim.sql'));
  await db.exec(read('../migrations/20261116000000_init.sql'));
  for (const u of users) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [u.id, u.email]);
  }
  await db.exec(read('../seed.sql'));

  // Um segundo bar, com a própria equipe e um pedido, para testar o isolamento.
  await db.query('insert into auth.users (id, email) values ($1, $2)', [OTHER, 'outro@bar-b.test']);
  await db.exec(`
    insert into public.venues (id, name, help_phrase) values ('${VENUE_B}', 'Bar B', 'código B');
    insert into public.spots (venue_id, code, label) values ('${VENUE_B}', 'BARBX001', 'Banheiro B');
    insert into public.staff (id, venue_id, full_name, role) values ('${OTHER}', '${VENUE_B}', 'Outra Pessoa', 'staff');
  `);
});

test('o seed cria o bar, 6 locais, 4 pessoas e o histórico', async () => {
  const { rows } = await db.query(`
    select (select count(*) from public.spots where venue_id = $1)::int as spots,
           (select count(*) from public.staff where venue_id = $1)::int as staff,
           (select count(*) from public.alerts where venue_id = $1)::int as alerts`, [VENUE_A]);
  assert.equal(rows[0].spots, 6);
  assert.equal(rows[0].staff, 4);
  assert.ok(rows[0].alerts >= 35, `histórico com ${rows[0].alerts} pedidos`);
});

test('sem login não se lê nenhuma tabela', async () => {
  for (const table of ['alerts', 'venues', 'staff', 'spots']) {
    await anon(() => rejects(db.query(`select * from public.${table}`), /permission denied/));
  }
});

test('sem login não se cria pedido direto na tabela', async () => {
  await anon(() =>
    rejects(
      db.query(`insert into public.alerts (venue_id, spot_id, kind, short_code, token_hash)
                select venue_id, id, 'unsafe', 'XXXX', 'x' from public.spots limit 1`),
      /permission denied/,
    ),
  );
});

test('sem login: ver o local, criar o pedido e acompanhar só pelo token', async () => {
  const spot = await anon(() => db.query(`select * from public.get_spot_public('esqbf7k2')`));
  assert.equal(spot.rows[0].label, 'Banheiro feminino');
  assert.equal(spot.rows[0].venue_name, 'Bar Esquina da Vila');

  const unknown = await anon(() => db.query(`select * from public.get_spot_public('NAOEXISTE')`));
  assert.equal(unknown.rows.length, 0);

  const created = await anon(() => db.query(`select * from public.create_alert('ESQBF7K2', 'unsafe')`));
  const { token, short_code } = created.rows[0];
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.match(short_code, /^[ACDEFHJKMNPRTWXY34679]{4}$/);

  const mine = await anon(() => db.query(`select * from public.get_alert_by_token($1)`, [token]));
  assert.equal(mine.rows[0].status, 'open');
  assert.equal(mine.rows[0].spot_label, 'Banheiro feminino');

  const wrong = await anon(() =>
    db.query(`select * from public.get_alert_by_token($1)`, ['0'.repeat(64)]),
  );
  assert.equal(wrong.rows.length, 0);

  // O banco guarda só o hash do token.
  const stored = await db.query('select count(*)::int as n from public.alerts where token_hash = $1', [token]);
  assert.equal(stored.rows[0].n, 0);
});

test('sem login não se usam as funções da equipe', async () => {
  const { rows } = await db.query('select id from public.alerts limit 1');
  await anon(() => rejects(db.query('select public.ack_alert($1)', [rows[0].id]), /permission denied/));
  await anon(() => rejects(db.query('select public.start_response($1)', [rows[0].id]), /permission denied/));
});

test('tipo de pedido inválido é recusado', async () => {
  await anon(() => rejects(db.query(`select * from public.create_alert('ESQBM4P9', 'qualquer')`), /invalid_kind/));
});

test('limite: o 4º pedido do mesmo local no mesmo minuto é recusado', async () => {
  for (let i = 0; i < 3; i++) {
    await anon(() => db.query(`select * from public.create_alert('ESQM07H6', 'talk')`));
  }
  await anon(() => rejects(db.query(`select * from public.create_alert('ESQM07H6', 'talk')`), /rate_limited/));
  // Outro local do mesmo bar ainda funciona.
  await anon(() => db.query(`select * from public.create_alert('ESQEXT9R', 'talk')`));
});

test('a equipe só vê os pedidos, os locais e a equipe do próprio bar', async () => {
  await anon(() => db.query(`select * from public.create_alert('BARBX001', 'leave')`));

  const a = await staff(diego, () => db.query('select distinct venue_id from public.alerts'));
  assert.deepEqual(a.rows.map((r) => r.venue_id), [VENUE_A]);

  const b = await staff(OTHER, () => db.query('select venue_id, count(*)::int as n from public.alerts group by 1'));
  assert.equal(b.rows.length, 1);
  assert.equal(b.rows[0].venue_id, VENUE_B);
  assert.equal(b.rows[0].n, 1);

  const crew = await staff(OTHER, () => db.query('select full_name from public.staff'));
  assert.deepEqual(crew.rows.map((r) => r.full_name), ['Outra Pessoa']);

  const spots = await staff(OTHER, () => db.query('select code from public.spots'));
  assert.deepEqual(spots.rows.map((r) => r.code), ['BARBX001']);
});

test('a equipe não altera pedido de outro bar nem direto na tabela', async () => {
  const { rows } = await db.query(`select id from public.alerts where venue_id = $1 and status = 'open' limit 1`, [VENUE_B]);
  const otherAlert = rows[0].id;
  await staff(diego, () => rejects(db.query('select public.ack_alert($1)', [otherAlert]), /alert_not_found/));
  await staff(diego, () => rejects(db.query('select public.start_response($1)', [otherAlert]), /alert_not_found/));

  const own = await db.query(`select id from public.alerts where venue_id = $1 and status = 'open' limit 1`, [VENUE_A]);
  const updated = await staff(diego, () =>
    db.query(`update public.alerts set status = 'resolved', outcome = 'escorted' where id = $1`, [own.rows[0].id]),
  );
  assert.equal(updated.affectedRows ?? 0, 0);
  const check = await db.query('select status from public.alerts where id = $1', [own.rows[0].id]);
  assert.equal(check.rows[0].status, 'open');

  await staff(diego, () => rejects(db.query('delete from public.alerts where id = $1', [own.rows[0].id]), /permission denied/));
});

test('pessoa sem cadastro na equipe não vê nada', async () => {
  const stranger = '00000000-0000-4000-8000-0000000000ff';
  const r = await staff(stranger, () => db.query('select count(*)::int as n from public.alerts'));
  assert.equal(r.rows[0].n, 0);
  const { rows } = await db.query('select id from public.alerts limit 1');
  await staff(stranger, () => rejects(db.query('select public.ack_alert($1)', [rows[0].id]), /not_staff/));
});

test('o laço completo: criado, visto, a caminho, resolvido, com os horários', async () => {
  const created = await anon(() => db.query(`select * from public.create_alert('ESQM12T3', 'leave')`));
  const { token } = created.rows[0];
  const id = (await db.query(`select id from public.alerts where token_hash = public.hash_token($1)`, [token])).rows[0].id;

  await staff(ana, () => db.query('select public.ack_alert($1)', [id]));
  let view = (await anon(() => db.query('select * from public.get_alert_by_token($1)', [token]))).rows[0];
  assert.equal(view.status, 'seen');
  assert.ok(view.seen_at);
  assert.equal(view.responder_first_name, null);

  await staff(diego, () => db.query('select public.start_response($1)', [id]));
  view = (await anon(() => db.query('select * from public.get_alert_by_token($1)', [token]))).rows[0];
  assert.equal(view.status, 'on_the_way');
  assert.equal(view.responder_first_name, 'Diego');
  assert.equal(view.responder_appearance, 'camisa preta');

  // Outra pessoa da equipe não "rouba" o pedido.
  await staff(ana, () => rejects(db.query('select public.start_response($1)', [id]), /already_taken/));

  await staff(diego, () => rejects(db.query('select public.resolve_alert($1, null)', [id]), /outcome_required/));
  await staff(diego, () => rejects(db.query(`select public.resolve_alert($1, 'inventado')`, [id]), /check constraint/));
  await staff(diego, () => db.query(`select public.resolve_alert($1, 'escorted', 'Acompanhei até o carro')`, [id]));

  const row = (await db.query('select * from public.alerts where id = $1', [id])).rows[0];
  assert.equal(row.status, 'resolved');
  assert.equal(row.outcome, 'escorted');
  assert.equal(row.responder_id, diego);
  assert.ok(row.created_at <= row.seen_at && row.seen_at <= row.on_the_way_at && row.on_the_way_at <= row.resolved_at);

  await staff(diego, () => rejects(db.query('select public.start_response($1)', [id]), /invalid_transition/));
});

test('a mulher cancela o próprio pedido, e a equipe não age mais sobre ele', async () => {
  const created = await anon(() => db.query(`select * from public.create_alert('ESQBAL3W', 'talk')`));
  const { token } = created.rows[0];
  await anon(() => db.query('select public.cancel_alert_by_token($1)', [token]));
  const view = (await anon(() => db.query('select * from public.get_alert_by_token($1)', [token]))).rows[0];
  assert.equal(view.status, 'cancelled');
  await anon(() => rejects(db.query('select public.cancel_alert_by_token($1)', [token]), /alert_not_found/));
  const id = (await db.query(`select id from public.alerts where token_hash = public.hash_token($1)`, [token])).rows[0].id;
  await staff(diego, () => rejects(db.query('select public.start_response($1)', [id]), /invalid_transition/));
});

test('o token deixa de valer depois de 12 horas', async () => {
  const created = await anon(() => db.query(`select * from public.create_alert('ESQBM4P9', 'unsafe')`));
  const { token } = created.rows[0];
  await db.query(`update public.alerts set created_at = now() - interval '13 hours' where token_hash = public.hash_token($1)`, [token]);
  const view = await anon(() => db.query('select * from public.get_alert_by_token($1)', [token]));
  assert.equal(view.rows.length, 0);
});

test('a gerência cria locais no próprio bar; a equipe comum não', async () => {
  await staff(marta, () =>
    db.query(`insert into public.spots (venue_id, code, label, kind) values ($1, 'ESQM20Q4', 'Mesa 20', 'table')`, [VENUE_A]),
  );
  await staff(marta, () =>
    rejects(
      db.query(`insert into public.spots (venue_id, code, label) values ($1, 'INVADE01', 'Invasão')`, [VENUE_B]),
      /row-level security/,
    ),
  );
  await staff(diego, () =>
    rejects(
      db.query(`insert into public.spots (venue_id, code, label) values ($1, 'ESQM21Q5', 'Mesa 21')`, [VENUE_A]),
      /row-level security/,
    ),
  );
});

test('cada um muda só a própria roupa do dia', async () => {
  await staff(ana, () => db.query(`select public.set_my_appearance('camiseta branca')`));
  const r = await db.query('select id, appearance from public.staff where id in ($1, $2)', [ana, diego]);
  const byId = Object.fromEntries(r.rows.map((x) => [x.id, x.appearance]));
  assert.equal(byId[ana], 'camiseta branca');
  assert.equal(byId[diego], 'camisa preta');
});
