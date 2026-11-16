import { loadConfig } from './config';
import { createDb } from './db';
import { migrate, resetDemo, seedDemo } from './migrate';

/**
 * npm run migrate      aplica as migrações
 * npm run seed         cria o bar de demonstração, se não existir
 * npm run demo:reset   volta o bar de demonstração ao seed (cron diário na VPS)
 */
const command = process.argv[2];
const config = loadConfig();
const db = createDb(config);
try {
  const applied = await migrate(db, config.repoRoot);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco já atualizado.');
  if (command === 'seed') {
    console.log((await seedDemo(db, config.repoRoot)) ? 'Bar de demonstração criado.' : 'O bar de demonstração já existe.');
  } else if (command === 'demo:reset') {
    await resetDemo(db, config.repoRoot);
    console.log(`Bar de demonstração restaurado em ${new Date().toISOString()}.`);
  }
} finally {
  await db.close();
}
