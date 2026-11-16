import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import type { Db } from './db';

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

/**
 * Cria o bar fictício: as contas de teste (senha em hash) e depois
 * db/seed.sql (bar, locais, equipe e histórico). Só roda com o banco vazio.
 */
export async function seedDemo(db: Db, repoRoot: string): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from venues');
  if (rows[0].n > 0) return false;
  const data = JSON.parse(await readFile(join(repoRoot, 'db', 'test-users.json'), 'utf8')) as TestUsers;
  const hash = await bcrypt.hash(data.password, 10);
  const seed = await readFile(join(repoRoot, 'db', 'seed.sql'), 'utf8');
  await db.tx(async (q) => {
    for (const u of data.users) {
      await q.query('insert into users (email, password_hash) values ($1, $2) on conflict (email) do nothing', [u.email, hash]);
    }
    await q.exec(seed);
  });
  return true;
}
