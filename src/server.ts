import { buildApp } from './app.js';
import { loadConfig } from './core/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp();

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
