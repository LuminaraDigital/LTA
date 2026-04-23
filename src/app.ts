import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildDecisionEngine } from './core/decision-engine.js';
import { buildAgentOrchestrator } from './core/agent-orchestrator.js';
import { buildAnalyticsService } from './core/analytics-service.js';
import { loadConfig } from './core/config.js';
import { buildDelegationEngine } from './core/delegation-engine.js';
import { buildExecutionService } from './core/execution-service.js';
import { buildRiskEngine } from './core/risk-engine.js';
import { defaultStrategies } from './core/strategy-catalog.js';
import type { StateStore } from './core/state-store.js';
import { buildTonAgenticWalletAdapter } from './core/ton-adapter.js';
import { buildTonWorker } from './core/ton-worker.js';
import { renderApprovalConsole } from './ui/approval-console.js';
import type {
  DecisionContext,
  ExecutionDirective,
  Opportunity,
  TradeIntent,
} from './core/types.js';

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

const approvalDecisionSchema = {
  type: 'string',
  enum: ['approve', 'reject', 'override'],
} as const;

const caseApprovalBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewId', 'approver', 'decision'],
  properties: {
    reviewId: { type: 'string', minLength: 1 },
    approver: { type: 'string', minLength: 1 },
    decision: approvalDecisionSchema,
    rationale: { type: 'string' },
  },
} as const;

const outcomeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalId', 'outcome', 'pnlUsd'],
  properties: {
    proposalId: { type: 'string', minLength: 1 },
    outcome: {
      type: 'string',
      enum: ['profit', 'loss', 'scratch', 'cancelled'],
    },
    pnlUsd: { type: 'number' },
    notes: { type: 'string' },
  },
} as const;

const executionJobBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['caseId', 'proposalId', 'directive'],
  properties: {
    caseId: { type: 'string', minLength: 1 },
    proposalId: { type: 'string', minLength: 1 },
    directive: {
      type: 'string',
      enum: ['ton-mcp-transfer', 'ton-mcp-swap', 'exchange-webhook'],
    },
  },
} as const;

export function buildApp(options?: { config?: ReturnType<typeof loadConfig>; stateStore?: StateStore }) {
  const config = options?.config ?? loadConfig();
  const strategies = defaultStrategies();
  const riskEngine = buildRiskEngine(config.policy);
  const decisionEngine = buildDecisionEngine({ config, strategies, riskEngine });
  const stateStore = options?.stateStore;
  if (!stateStore) {
    throw new Error('buildApp requires a StateStore instance.');
  }
  const agentOrchestrator = buildAgentOrchestrator({
    config,
    decisionEngine,
  });
  const delegationEngine = buildDelegationEngine({
    topology: agentOrchestrator.listAgents(),
  });
  const tonAdapter = buildTonAgenticWalletAdapter(config.ton);
  const analyticsService = buildAnalyticsService(stateStore);
  const executionService = buildExecutionService({
    config,
    tonAdapter,
  });
  const tonWorker = buildTonWorker({
    stateStore,
    executionService,
  });

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
    attachedWallets: config.ton.attachedWallets.map((wallet) => ({
      address: wallet.address,
      operatorLabel: wallet.operatorLabel,
      network: wallet.network,
    })),
  }));

  app.get('/v1/strategies', async () => ({
    items: strategies,
  }));

  app.get('/v1/agents', async () => ({
    items: agentOrchestrator.listAgents(),
  }));

  app.get('/v1/console', async (_request, reply) => {
    reply.type('text/html');
    return renderApprovalConsole();
  });

  app.get('/v1/cases', async () => ({
    items: stateStore.listCases(),
  }));

  app.get<{ Params: { caseId: string } }>(
    '/v1/cases/:caseId',
    async (request, reply) => {
      const caseFile = stateStore.getCase(request.params.caseId);
      if (!caseFile) {
        reply.code(404);
        return {
          message: 'Case not found.',
        };
      }

      return caseFile;
    },
  );

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

  app.post<{ Body: DecisionContext }>(
    '/v1/agents/orchestrate',
    {
      schema: {
        body: decisionContextSchema,
      },
    },
    async (request) => {
      const orchestrationResponse = agentOrchestrator.orchestrate(request.body);
      const delegatedTasks = delegationEngine.buildTaskGraph(orchestrationResponse);
      const caseFile = stateStore.createCaseFromOrchestration({
        context: request.body,
        orchestrationResponse,
        delegatedTasks,
      });

      return {
        ...orchestrationResponse,
        caseFile,
      };
    },
  );

  app.post<{
    Params: { caseId: string };
    Body: {
      reviewId: string;
      approver: string;
      decision: 'approve' | 'reject' | 'override';
      rationale?: string;
    };
  }>(
    '/v1/cases/:caseId/approvals',
    {
      schema: {
        body: caseApprovalBodySchema,
      },
    },
    async (request, reply) => {
      const approvalEvent = stateStore.recordApproval(
        request.body.rationale
          ? {
              caseId: request.params.caseId,
              reviewId: request.body.reviewId,
              approver: request.body.approver,
              decision: request.body.decision,
              rationale: request.body.rationale,
            }
          : {
              caseId: request.params.caseId,
              reviewId: request.body.reviewId,
              approver: request.body.approver,
              decision: request.body.decision,
            },
      );

      if (!approvalEvent) {
        reply.code(404);
        return {
          message: 'Case or review not found.',
        };
      }

      return approvalEvent;
    },
  );

  app.post<{
    Params: { caseId: string };
    Body: {
      proposalId: string;
      outcome: 'profit' | 'loss' | 'scratch' | 'cancelled';
      pnlUsd: number;
      notes?: string;
    };
  }>(
    '/v1/cases/:caseId/outcomes',
    {
      schema: {
        body: outcomeBodySchema,
      },
    },
    async (request, reply) => {
      const outcome = stateStore.recordOutcome(
        request.body.notes
          ? {
              caseId: request.params.caseId,
              proposalId: request.body.proposalId,
              outcome: request.body.outcome,
              pnlUsd: request.body.pnlUsd,
              notes: request.body.notes,
            }
          : {
              caseId: request.params.caseId,
              proposalId: request.body.proposalId,
              outcome: request.body.outcome,
              pnlUsd: request.body.pnlUsd,
            },
      );

      if (!outcome) {
        reply.code(404);
        return {
          message: 'Case or proposal not found.',
        };
      }

      return {
        outcome,
        attribution: stateStore.listAgentAttribution(),
      };
    },
  );

  app.get('/v1/agents/attribution', async () => ({
    items: stateStore.listAgentAttribution(),
  }));

  app.get('/v1/agents/memory', async () => ({
    items: stateStore.listAgentMemories(),
  }));

  app.get('/v1/analytics/portfolio', async () => ({
    snapshot: await analyticsService.getPortfolioAnalytics(),
  }));

  app.get('/v1/analytics/dashboard', async () => ({
    dashboard: await analyticsService.getDashboardModel(),
  }));

  app.post<{
    Body: {
      caseId: string;
      proposalId: string;
      directive: ExecutionDirective;
    };
  }>(
    '/v1/execution/jobs',
    {
      schema: {
        body: executionJobBodySchema,
      },
    },
    async (request, reply) => {
      const caseFile = stateStore.getCase(request.body.caseId);
      const proposal = caseFile?.proposal.proposalId === request.body.proposalId
        ? caseFile.proposal
        : undefined;

      if (!caseFile || !proposal) {
        reply.code(404);
        return {
          message: 'Case or proposal not found.',
        };
      }

      const job = executionService.createJob({
        caseId: request.body.caseId,
        proposal,
        directive: request.body.directive,
      });
      stateStore.appendExecutionJob(job);

      const dispatchedJob = executionService.dispatch(job);
      stateStore.updateExecutionJob(dispatchedJob);

      return dispatchedJob;
    },
  );

  app.get('/v1/execution/jobs', async () => ({
    items: stateStore.listExecutionJobs(),
  }));

  app.post('/v1/workers/ton/run-once', async () => ({
    results: await tonWorker.runOnce(),
  }));

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
