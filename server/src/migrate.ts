import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { DEMO_VENUE_ID } from '@nenm/shared';
import type { Db, Queryable } from './db';

/** Aplica, em ordem, os arquivos de db/migrations que ainda não rodaram. */
export async function migrate(db: Db, repoRoot: string): Promise<string[]> {
  await db.query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const dir = join(repoRoot, 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

interface TestUsers {
  password: string;
  users: { email: string }[];
}

const readDemo = async (repoRoot: string) => ({
  data: JSON.parse(await readFile(join(repoRoot, 'db', 'test-users.json'), 'utf8')) as TestUsers,
  seed: await readFile(join(repoRoot, 'db', 'seed.sql'), 'utf8'),
});

async function insertDemo(q: Queryable, data: TestUsers, seed: string): Promise<void> {
  const hash = await bcrypt.hash(data.password, 10);
  for (const u of data.users) {
    await q.query('insert into users (email, password_hash) values ($1, $2) on conflict (email) do nothing', [u.email, hash]);
  }
  await q.exec(seed);
}

/**
 * Cria o bar de demonstração: as contas de teste (senha em hash) e depois
 * db/seed.sql (bar, locais, equipe e histórico). Só roda se ele não existir.
 */
export async function seedDemo(db: Db, repoRoot: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from venues where id = $1', [DEMO_VENUE_ID]);
  if (rows.length > 0) return false;
  const { data, seed } = await readDemo(repoRoot);
  await db.tx((q) => insertDemo(q, data, seed));
  return true;
}

/**
 * Volta o bar de demonstração ao seed (roda uma vez por dia, pelo cron da VPS).
 * Apaga só o bar de demonstração e as contas dele; nenhum outro bar é tocado.
 */
export async function resetDemo(db: Db, repoRoot: string): Promise<void> {
  const { data, seed } = await readDemo(repoRoot);
  await db.tx(async (q) => {
    // Contas criadas no painel durante a demonstração também saem.
    await q.query('delete from users where id in (select id from staff where venue_id = $1)', [DEMO_VENUE_ID]);
    await q.query('delete from venues where id = $1', [DEMO_VENUE_ID]);
    await q.query('delete from users where email = any($1::text[])', [data.users.map((u) => u.email)]);
    await insertDemo(q, data, seed);
  });
}
