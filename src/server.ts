import { createDatabaseClient, defaultDatabaseClientFactory, runMigrations } from './db/client.js';
import { buildApp } from './app.js';
import { loadConfig } from './core/config.js';
import { buildStateStore } from './core/state-store.js';

async function main(): Promise<void> {
  const config = loadConfig();
  await runMigrations(config.database);
  const db = defaultDatabaseClientFactory.create({
    connectionString: config.database.connectionString,
    max: config.database.maxConnections,
  });
  const stateStore = await buildStateStore({
    db,
  });
  const app = buildApp({
    config,
    stateStore,
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
