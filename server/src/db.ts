import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import type { Config } from './config';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Vários comandos de uma vez, sem parâmetros (migrações e seed). */
  exec(sql: string): Promise<void>;
}

/**
 * Acesso ao banco, igual para os dois motores:
 * - Postgres 17 (pg), na VPS;
 * - Postgres embutido (PGlite, o mesmo Postgres compilado para WebAssembly),
 *   no PC de desenvolvimento e nos testes, sem Docker.
 * Sempre com consultas parametrizadas ($1, $2...).
 */
export interface Db extends Queryable {
  readonly engine: 'postgres' | 'pglite';
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Datas como texto ISO e números grandes como número, iguais nos dois motores.
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(20, (v) => Number(v)); // int8 (count)

function fromPg(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    engine: 'postgres',
    query: async <T>(sql: string, params?: unknown[]) => (await pool.query(sql, params)) as unknown as { rows: T[] },
    exec: async (sql) => {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({
          query: async <T>(sql: string, params?: unknown[]) => (await client.query(sql, params)) as unknown as { rows: T[] },
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

const isoDates = { [1184]: (v: string) => new Date(v).toISOString(), [1082]: (v: string) => v, [20]: (v: string) => Number(v) };

function fromPglite(dir: string): Db {
  if (dir !== 'memory') mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir === 'memory' ? undefined : dir, { parsers: isoDates });
  // O PGlite atende uma consulta por vez; a fila deixa as transações em ordem.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  return {
    engine: 'pglite',
    query: (sql, params) => serial(() => lite.query(sql, params)) as never,
    exec: async (sql) => {
      await serial(() => lite.exec(sql));
    },
    tx: (fn) =>
      serial(() =>
        lite.transaction((t) =>
          fn({
            query: (sql, params) => t.query(sql, params) as never,
            exec: async (sql) => {
              await t.exec(sql);
            },
          }),
        ),
      ),
    close: () => lite.close(),
  };
}

export function createDb(config: Pick<Config, 'DATABASE_URL' | 'PGLITE_DIR'>): Db {
  return config.DATABASE_URL ? fromPg(config.DATABASE_URL) : fromPglite(config.PGLITE_DIR);
}
