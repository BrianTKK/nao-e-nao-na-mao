import { loadConfig } from './config';
import { createDb } from './db';
import { migrate, seedDemo } from './migrate';

/** npm run migrate | npm run seed */
const command = process.argv[2];
const config = loadConfig();
const db = createDb(config);
try {
  const applied = await migrate(db, config.repoRoot);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco já atualizado.');
  if (command === 'seed') {
    console.log((await seedDemo(db, config.repoRoot)) ? 'Bar fictício criado.' : 'O banco já tem dados; seed ignorado.');
  }
} finally {
  await db.close();
}
