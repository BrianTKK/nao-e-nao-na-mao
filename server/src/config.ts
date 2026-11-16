import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
/** Raiz do repositório (server/src/../..), ou /app no contêiner. */
const repoRoot = resolve(here, '..', '..');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  /** Postgres da VPS. Sem ela, o servidor usa o Postgres embutido (PGlite), só para desenvolvimento. */
  DATABASE_URL: z.string().url().optional(),
  /** Pasta do Postgres embutido; "memory" para não gravar nada (testes). */
  PGLITE_DIR: z.string().default(resolve(repoRoot, 'server', '.data', 'pglite')),
  /** Segredo que assina os tokens de login. Só no .env do servidor, nunca no repositório. */
  JWT_SECRET: z.string().min(32).optional(),
  /** Validade do login da equipe. */
  SESSION_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(16),
  /** Origens que podem chamar a API de outro domínio (o app no Expo web, em desenvolvimento). */
  CORS_ORIGINS: z.string().default(''),
  /** Pasta da web compilada (web/dist), servida na mesma origem. */
  WEB_DIST: z.string().default(resolve(repoRoot, 'web', 'dist')),
  /** Cria o bar fictício e as contas de teste se o banco estiver vazio. */
  SEED_DEMO: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
  /** Atrás do Nginx: confia no primeiro proxy para ler o IP real (limite por IP). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

export type Config = z.infer<typeof schema> & { jwtSecret: string; corsOrigins: string[]; repoRoot: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production') {
    if (!c.JWT_SECRET) throw new Error('JWT_SECRET é obrigatório em produção (32+ caracteres).');
    if (!c.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório em produção.');
  }
  // Em desenvolvimento, um segredo aleatório por execução (os logins caem ao reiniciar).
  const jwtSecret = c.JWT_SECRET ?? randomBytes(32).toString('hex');
  const corsOrigins = c.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...c, jwtSecret, corsOrigins, repoRoot };
}
