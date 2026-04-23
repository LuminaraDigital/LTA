import Fastify from 'fastify';

import { buildDecisionEngine } from './core/decision-engine.js';
import { loadConfig } from './core/config.js';
import { buildRiskEngine } from './core/risk-engine.js';
import { defaultStrategies } from './core/strategy-catalog.js';
import { buildTonAgenticWalletAdapter } from './core/ton-adapter.js';
import type { DecisionContext, Opportunity, TradeIntent } from './core/types.js';

const portfolioSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['totalEquityUsd', 'liquidUsd', 'drawdownPct', 'positions'],
  properties: {
    totalEquityUsd: { type: 'number', minimum: 0 },
    liquidUsd: { type: 'number', minimum: 0 },
    drawdownPct: { type: 'number', minimum: 0 },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'venue', 'notionalUsd', 'side'],
        properties: {
          symbol: { type: 'string', minLength: 1 },
          venue: { type: 'string', minLength: 1 },
          notionalUsd: { type: 'number', minimum: 0 },
          side: { type: 'string', enum: ['long', 'short', 'flat'] },
        },
      },
    },
  },
} as const;

const opportunitySchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'strategyId',
      'symbol',
      'venue',
      'direction',
      'expectedEdgeBps',
      'confidence',
      'estimatedHoldingPeriodHours',
      'notionalUsd',
      'liquidityScore',
      'executionComplexity',
      'reasoning',
    ],
    properties: {
      id: { type: 'string', minLength: 1 },
      strategyId: { type: 'string', minLength: 1 },
      symbol: { type: 'string', minLength: 1 },
      venue: { type: 'string', minLength: 1 },
      direction: { type: 'string', enum: ['long', 'short', 'market-neutral'] },
      expectedEdgeBps: { type: 'number' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      estimatedHoldingPeriodHours: { type: 'number', minimum: 0 },
      notionalUsd: { type: 'number', minimum: 0 },
      liquidityScore: { type: 'number', minimum: 0, maximum: 1 },
      executionComplexity: { type: 'number', minimum: 0, maximum: 1 },
      catalyst: { type: 'string' },
      reasoning: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        minItems: 1,
      },
      venueMetadata: { type: 'object', additionalProperties: true },
    },
  },
} as const;

const marketStateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['regime', 'realizedVolatility30d', 'marketStressScore', 'fundingDispersionScore'],
  properties: {
    regime: { type: 'string', enum: ['risk-on', 'risk-off', 'mixed'] },
    realizedVolatility30d: { type: 'number', minimum: 0 },
    marketStressScore: { type: 'number', minimum: 0, maximum: 1 },
    fundingDispersionScore: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

const decisionContextSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['portfolio', 'opportunities', 'marketState', 'walletState'],
  properties: {
    portfolio: portfolioSchema,
    opportunities: opportunitySchema,
    marketState: marketStateSchema,
    walletState: {
      type: 'object',
      additionalProperties: false,
      required: ['network', 'walletType', 'availableCashUsd'],
      properties: {
        network: { type: 'string', minLength: 1 },
        walletType: { type: 'string', enum: ['ton-agentic', 'custodial', 'hybrid'] },
        availableCashUsd: { type: 'number', minimum: 0 },
        tonAgenticWalletAddress: { type: 'string' },
      },
    },
    governance: {
      type: 'object',
      additionalProperties: false,
      properties: {
        emergencyStop: { type: 'boolean' },
        approverPresent: { type: 'boolean' },
        approvedStrategies: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} as const;

const tradeIntentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['symbol', 'venue', 'direction', 'notionalUsd', 'strategyId'],
  properties: {
    symbol: { type: 'string', minLength: 1 },
    venue: { type: 'string', minLength: 1 },
    direction: { type: 'string', enum: ['buy', 'sell', 'hedge'] },
    notionalUsd: { type: 'number', minimum: 0 },
    strategyId: { type: 'string', minLength: 1 },
  },
} as const;

const approveTradeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['trade'],
  properties: {
    trade: tradeIntentSchema,
  },
} as const;

export function buildApp() {
  const config = loadConfig();
  const strategies = defaultStrategies();
  const riskEngine = buildRiskEngine(config.policy);
  const decisionEngine = buildDecisionEngine({ config, strategies, riskEngine });
  const tonAdapter = buildTonAgenticWalletAdapter(config.ton);

  const app = Fastify({
    logger: true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'lta-control-plane',
    environment: config.environment,
    timestamp: new Date().toISOString(),
  }));

  app.get('/v1/platform/profile', async () => ({
    name: 'LTA',
    legalEntity: 'Luminara Digital',
    environment: config.environment,
    strategyCount: strategies.length,
    ton: tonAdapter.capabilities(),
    policy: config.policy,
  }));

  app.get('/v1/strategies', async () => ({
    items: strategies,
  }));

  app.post<{ Body: DecisionContext }>(
    '/v1/decisions/evaluate',
    {
      schema: {
        body: decisionContextSchema,
      },
    },
    async (request) => {
      return decisionEngine.evaluate(request.body);
    },
  );

  app.post<{ Body: { trade: TradeIntent } }>(
    '/v1/trades/approve',
    {
      schema: {
        body: approveTradeBodySchema,
      },
    },
    async (request, reply) => {
      const approval = tonAdapter.prepareApproval(request.body.trade);
      reply.code(202);
      return approval;
    },
  );

  app.post<{ Body: { opportunities: Opportunity[] } }>(
    '/v1/opportunities/score',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['opportunities'],
          properties: {
            opportunities: opportunitySchema,
          },
        },
      },
    },
    async (request) => ({
      items: request.body.opportunities.map((opportunity) => ({
        id: opportunity.id,
        score: decisionEngine.scoreOpportunity(opportunity),
      })),
    }),
  );

  return app;
}
