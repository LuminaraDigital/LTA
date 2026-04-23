import type { LtaConfig, PolicyPack, StrategyId } from './types.js';

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

function readStrategyList(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: StrategyId[],
): StrategyId[] {
  return readList(env, name, fallback) as StrategyId[];
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
  return {
    environment: env.NODE_ENV ?? 'development',
    port: readNumber(env, 'PORT', 3000),
    host: env.HOST ?? '0.0.0.0',
    organizationName: env.LTA_ORG_NAME ?? 'Luminara Digital',
    deploymentStage: env.LTA_STAGE ?? 'local',
    policyVersion: env.LTA_POLICY_VERSION ?? '2026-04-enterprise-alpha',
    requestIdSeed: env.LTA_REQUEST_ID_SEED ?? 'lta-seed',
    policy: defaultPolicy(env),
    ton: {
      network: (env.LTA_TON_NETWORK as 'mainnet' | 'testnet') ?? 'testnet',
      mcpCommand: env.LTA_TON_MCP_COMMAND ?? 'npx',
      mcpArgs: readList(env, 'LTA_TON_MCP_ARGS', ['-y', '@ton/mcp@alpha']),
      mcpMode: (env.LTA_TON_MCP_MODE as 'stdio' | 'http') ?? 'stdio',
      mcpEndpoint: env.LTA_TON_MCP_ENDPOINT ?? 'http://127.0.0.1:3000/mcp',
      agentCollectionAddress:
        env.LTA_TON_AGENT_COLLECTION_ADDRESS ??
        'EQByQ19qvWxW7VibSbGEgZiYMqilHY5y1a_eeSL2VaXhfy07',
    },
  };
}

export function loadConfig(): LtaConfig {
  return loadConfigFromEnv(process.env);
}
