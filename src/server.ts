import { createDatabaseClient, defaultDatabaseClientFactory, runMigrations } from './db/client.js';
import { buildApp } from './app.js';
import { loadConfig } from './core/config.js';
import { buildStateStore } from './core/state-store.js';
import { buildTonMcpClient } from './core/ton-mcp-client.js';

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
  const tonMcp = buildTonMcpClient(config.ton);
  const app = buildApp({
    config,
    stateStore,
    tonMcp,
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
