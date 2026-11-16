import { createServer } from 'node:http';
import { loadConfig } from './config';
import { createDb } from './db';
import { migrate, seedDemo } from './migrate';
import { createApp } from './app';

const config = loadConfig();
const db = createDb(config);

const applied = await migrate(db, config.repoRoot);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);
if (config.SEED_DEMO && (await seedDemo(db, config.repoRoot))) console.log('Bar fictício criado (dados de demonstração).');

const server = createServer(createApp({ config, db }));
server.listen(config.PORT, () => {
  console.log(`Não é Não na Mão: http://localhost:${config.PORT} (banco: ${db.engine})`);
});

const shutdown = () => {
  server.close(() => db.close().finally(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
