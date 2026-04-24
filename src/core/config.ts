import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  AiSecretsFile,
  AttachedTonWallet,
  ExecutionWebhookMap,
  LtaConfig,
  PolicyPack,
  StrategyId,
  TonSecretsFile,
} from './types.js';

function readNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }

  return value;
}

function readList(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string[],
): string[] {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  return raw === 'true';
}

function readStrategyList(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: StrategyId[],
): StrategyId[] {
  return readList(env, name, fallback) as StrategyId[];
}

function readOptionalSecretFile<T>(filePath?: string): T | undefined {
  if (!filePath) {
    return undefined;
  }

  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const raw = readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as T;
}

function normalizeAttachedWallets(
  secretFile?: TonSecretsFile,
): AttachedTonWallet[] {
  return (
    secretFile?.attachedWallets?.map((wallet) => ({
      address: wallet.address,
      operatorLabel: wallet.operatorLabel ?? wallet.label ?? 'lta-primary',
      network: wallet.network ?? 'mainnet',
    })) ?? []
  );
}

function defaultPolicy(env: NodeJS.ProcessEnv): PolicyPack {
  return {
    policyVersion: env.LTA_POLICY_VERSION ?? '2026-04-enterprise-alpha',
    maxSingleTradeUsd: readNumber(env, 'LTA_MAX_POSITION_USD', 250_000),
    maxPortfolioVaRUsd: readNumber(env, 'LTA_MAX_PORTFOLIO_VAR_USD', 400_000),
    maxNetExposureUsd: readNumber(env, 'LTA_MAX_NET_EXPOSURE_USD', 1_500_000),
    maxDrawdownPct: readNumber(env, 'LTA_MAX_DRAWDOWN_PCT', 12),
    manualApprovalThresholdUsd: readNumber(
      env,
      'LTA_MANUAL_APPROVAL_THRESHOLD_USD',
      75_000,
    ),
    allowedVenues: readList(env, 'LTA_ALLOWED_VENUES', [
      'ton-dex',
      'dex-stonfi',
      'cex-binance',
      'cex-bybit',
    ]),
    allowedStrategies: readStrategyList(env, 'LTA_ALLOWED_STRATEGIES', [
      'ton-agentic-basis',
      'cross-exchange-arbitrage',
      'funding-rate-carry',
      'trend-following-ml',
    ]),
    restrictedAssets: readList(env, 'LTA_RESTRICTED_ASSETS', []),
    allowShorting: (env.LTA_ALLOW_SHORTING ?? 'true') === 'true',
  };
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LtaConfig {
  const tonSecretFilePath =
    env.LTA_LOCAL_SECRET_FILE ?? '/home/ubuntu/.lta-secrets/ton-secrets.json';
  const aiSecretFilePath =
    env.LTA_AI_SECRET_FILE ?? '/home/ubuntu/.lta-secrets/ai-secrets.json';
  const tonSecretFile = readOptionalSecretFile<TonSecretsFile>(tonSecretFilePath);
  const aiSecretFile = readOptionalSecretFile<AiSecretsFile>(aiSecretFilePath);
  const attachedWallets = normalizeAttachedWallets(tonSecretFile);
  const tonConfig = {
    network: (env.LTA_TON_NETWORK as 'mainnet' | 'testnet') ?? 'testnet',
    mcpCommand: env.LTA_TON_MCP_COMMAND ?? 'npx',
    mcpArgs: readList(env, 'LTA_TON_MCP_ARGS', ['-y', '@ton/mcp@alpha']),
    mcpMode: (env.LTA_TON_MCP_MODE as 'stdio' | 'http') ?? 'stdio',
    mcpEndpoint: env.LTA_TON_MCP_ENDPOINT ?? 'http://127.0.0.1:3000/mcp',
    localSecretFilePath: tonSecretFilePath,
    agentCollectionAddress:
      env.LTA_TON_AGENT_COLLECTION_ADDRESS ??
      'EQByQ19qvWxW7VibSbGEgZiYMqilHY5y1a_eeSL2VaXhfy07',
    attachedWallets,
  };

  const ton =
    tonSecretFile?.tonCenterApiKey != null
      ? {
          ...tonConfig,
          tonCenterApiKey: tonSecretFile.tonCenterApiKey,
        }
      : tonConfig;

  const venueWebhooks: ExecutionWebhookMap = {
    default:
      env.LTA_EXCHANGE_WEBHOOK_BASE_URL ?? 'http://127.0.0.1:8787/execution',
    ...(env.LTA_BINANCE_WEBHOOK_URL ? { binance: env.LTA_BINANCE_WEBHOOK_URL } : {}),
    ...(env.LTA_BYBIT_WEBHOOK_URL ? { bybit: env.LTA_BYBIT_WEBHOOK_URL } : {}),
    ...(env.LTA_HYPERLIQUID_WEBHOOK_URL
      ? { hyperliquid: env.LTA_HYPERLIQUID_WEBHOOK_URL }
      : {}),
    ...(env.LTA_TON_DEX_WEBHOOK_URL ? { tonDex: env.LTA_TON_DEX_WEBHOOK_URL } : {}),
    ...(env.LTA_STONFI_WEBHOOK_URL ? { stonfi: env.LTA_STONFI_WEBHOOK_URL } : {}),
  };

  return {
    environment: env.NODE_ENV ?? 'development',
    port: readNumber(env, 'PORT', 3000),
    host: env.HOST ?? '0.0.0.0',
    organizationName: env.LTA_ORG_NAME ?? 'Luminara Digital',
    deploymentStage: env.LTA_STAGE ?? 'local',
    policyVersion: env.LTA_POLICY_VERSION ?? '2026-04-enterprise-alpha',
    requestIdSeed: env.LTA_REQUEST_ID_SEED ?? 'lta-seed',
    policy: defaultPolicy(env),
    database: {
      connectionString:
        env.LTA_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/lta',
      maxConnections: readNumber(env, 'LTA_DB_MAX_CONNECTIONS', 10),
      ssl: readBoolean(env, 'LTA_DB_SSL', false),
    },
    ton,
    persistence: {
      dataDirectory: resolve(env.LTA_DATA_DIR ?? '/workspace/.lta-data'),
      autoCreate: readBoolean(env, 'LTA_AUTO_CREATE_DATA_DIR', true),
      databaseUrl:
        env.LTA_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/lta',
    },
    execution: {
      stateDirectory: resolve(env.LTA_DATA_DIR ?? '/workspace/.lta-data'),
      mode: readBoolean(env, 'LTA_EXECUTION_SIMULATION', true) ? 'dry-run' : 'live',
      tonExecutionTimeoutMs: readNumber(env, 'LTA_TON_EXECUTION_TIMEOUT_MS', 20_000),
      tonRetryLimit: readNumber(env, 'LTA_TON_RETRY_LIMIT', 3),
      tonMaxPollAttempts: readNumber(env, 'LTA_TON_MAX_POLL_ATTEMPTS', 8),
      tonPollIntervalMs: readNumber(env, 'LTA_TON_POLL_INTERVAL_MS', 4_000),
      defaultTonHumanAmount: env.LTA_DEFAULT_TON_HUMAN_AMOUNT ?? '0.01',
      exchangeWebhookBaseUrl:
        env.LTA_EXCHANGE_WEBHOOK_BASE_URL ?? 'http://127.0.0.1:8787/execution',
      simulationMode: readBoolean(env, 'LTA_EXECUTION_SIMULATION', true),
      venueWebhooks,
    },
    ai: {
      localSecretFilePath: aiSecretFilePath,
      ...(aiSecretFile?.openaiApiKey
        ? { openaiApiKey: aiSecretFile.openaiApiKey }
        : {}),
      ...(aiSecretFile?.kimiApiKey
        ? { kimiApiKey: aiSecretFile.kimiApiKey }
        : {}),
    },
  };
}

export function loadConfig(): LtaConfig {
  return loadConfigFromEnv(process.env);
}
