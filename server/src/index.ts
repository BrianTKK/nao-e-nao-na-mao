import { loadConfig } from './config';
import { createDb } from './db';
import { migrate, seedDemo } from './migrate';
import { buildServer } from './app';

const config = loadConfig();
const db = createDb(config);

const applied = await migrate(db, config.repoRoot);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);
if (config.SEED_DEMO && (await seedDemo(db, config.repoRoot))) console.log('Bar de demonstração criado.');

const { httpServer, close } = buildServer({ config, db });
httpServer.listen(config.PORT, () => {
  console.log(`Mariana: http://localhost:${config.PORT} (banco: ${db.engine})`);
});

const shutdown = () => {
  close().finally(() => db.close().finally(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
