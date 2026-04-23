import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export interface DatabaseClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
  close(): Promise<void>;
}

export interface DatabaseClientOptions {
  connectionString: string;
  max?: number;
  poolFactory?: () => {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<T>>;
    end(): Promise<void>;
  };
}

export interface DatabaseClientFactory {
  create(options: DatabaseClientOptions): DatabaseClient;
}

export interface MigrationOptions {
  connectionString: string;
  max?: number;
  migrationsDirectory?: string;
  factory?: DatabaseClientFactory;
}

export function createDatabaseClient(
  options: DatabaseClientOptions,
): DatabaseClient {
  const pool =
    options.poolFactory?.() ??
    new Pool({
      connectionString: options.connectionString,
      max: options.max ?? 10,
    } satisfies PoolConfig);

  return {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ) {
      return pool.query<T>(text, values);
    },
    async close() {
      await pool.end();
    },
  };
}

export const defaultDatabaseClientFactory: DatabaseClientFactory = {
  create: createDatabaseClient,
};

let activeClient: DatabaseClient | null = null;

export function setActiveDatabaseClient(client: DatabaseClient): void {
  activeClient = client;
}

function requireActiveClient(): DatabaseClient {
  if (!activeClient) {
    throw new Error('No active database client configured.');
  }

  return activeClient;
}

export async function runQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return requireActiveClient().query<T>(text, values);
}

export async function withTransaction<T>(
  callback: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = requireActiveClient();
  await client.query('BEGIN');

  try {
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function runMigrations(options: MigrationOptions): Promise<void> {
  const client = (options.factory ?? defaultDatabaseClientFactory).create({
    connectionString: options.connectionString,
    ...(options.max != null ? { max: options.max } : {}),
  });
  const migrationsDirectory = resolve(
    options.migrationsDirectory ?? '/workspace/src/db/migrations',
  );

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationFiles = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const version = file.replace(/\.sql$/, '');
      const existing = await client.query<{ version: string }>(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const sql = readFileSync(join(migrationsDirectory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.close();
  }
}
