import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildAgentOrchestrator } from '../src/core/agent-orchestrator.js';
import { loadConfigFromEnv } from '../src/core/config.js';
import { buildDelegationEngine } from '../src/core/delegation-engine.js';
import { buildDecisionEngine } from '../src/core/decision-engine.js';
import { buildExecutionService } from '../src/core/execution-service.js';
import { buildRiskEngine } from '../src/core/risk-engine.js';
import { defaultStrategies } from '../src/core/strategy-catalog.js';
import { buildStateStore } from '../src/core/state-store.js';
import { buildTonAgenticWalletAdapter } from '../src/core/ton-adapter.js';
import type { DecisionContext, LtaConfig } from '../src/core/types.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function buildContext(overrides?: Partial<DecisionContext>): DecisionContext {
  return {
    portfolio: {
      totalEquityUsd: 2_500_000,
      liquidUsd: 1_100_000,
      drawdownPct: 3.2,
      positions: [
        {
          symbol: 'BTC',
          venue: 'cex-binance',
          notionalUsd: 240_000,
          side: 'long',
        },
      ],
    },
    opportunities: [
      {
        id: 'opp-workflow-1',
        strategyId: 'cross-exchange-arbitrage',
        symbol: 'TON',
        venue: 'cex-binance',
        direction: 'market-neutral',
        expectedEdgeBps: 36,
        confidence: 0.82,
        estimatedHoldingPeriodHours: 8,
        notionalUsd: 55_000,
        liquidityScore: 0.86,
        executionComplexity: 0.33,
        reasoning: ['Spread remains open across approved venues.'],
      },
    ],
    marketState: {
      regime: 'mixed',
      realizedVolatility30d: 0.44,
      marketStressScore: 0.27,
      fundingDispersionScore: 0.58,
    },
    walletState: {
      network: 'mainnet',
      walletType: 'ton-agentic',
      availableCashUsd: 950_000,
      tonAgenticWalletAddress: 'EQCworkflowwallet',
    },
    governance: {
      emergencyStop: false,
      approverPresent: true,
      approvedStrategies: ['cross-exchange-arbitrage', 'funding-rate-carry'],
    },
    ...overrides,
  };
}

function buildRuntime(): {
  config: LtaConfig;
  store: ReturnType<typeof buildStateStore>;
  orchestrator: ReturnType<typeof buildAgentOrchestrator>;
  delegationEngine: ReturnType<typeof buildDelegationEngine>;
  executionService: ReturnType<typeof buildExecutionService>;
} {
  const dir = mkdtempSync(join(tmpdir(), 'lta-workflow-'));
  tempDirs.push(dir);

  const config = loadConfigFromEnv({
    NODE_ENV: 'test',
    PORT: '3000',
    HOST: '127.0.0.1',
    LTA_DATA_DIR: dir,
    LTA_EXECUTION_SIMULATION: 'true',
    LTA_ENABLE_TON_WORKER: 'true',
    LTA_ENABLE_EXCHANGE_WORKER: 'true',
    LTA_EXCHANGE_WEBHOOK_BASE_URL: 'http://127.0.0.1:8787/execution',
  });

  const decisionEngine = buildDecisionEngine({
    config,
    strategies: defaultStrategies(),
    riskEngine: buildRiskEngine(config.policy),
  });

  const orchestrator = buildAgentOrchestrator({
    config,
    decisionEngine,
  });

  const store = buildStateStore(config);
  const delegationEngine = buildDelegationEngine({
    topology: orchestrator.listAgents(),
  });
  const executionService = buildExecutionService({
    config,
    tonAdapter: buildTonAgenticWalletAdapter(config.ton),
  });

  return {
    config,
    store,
    orchestrator,
    delegationEngine,
    executionService,
  };
}

describe('LTA workflow operating system', () => {
  it('persists case files, journal memories, and delegated tasks', () => {
    const { store, orchestrator, delegationEngine } = buildRuntime();
    const orchestrationResponse = orchestrator.orchestrate(buildContext());
    const delegatedTasks = delegationEngine.buildTaskGraph(orchestrationResponse);
    const caseFile = store.createCaseFromOrchestration({
      context: buildContext(),
      orchestrationResponse,
      delegatedTasks,
    });

    expect(caseFile.status).toBe('approved');
    expect(caseFile.delegation.tasks.length).toBeGreaterThan(0);
    expect(store.listCases()).toHaveLength(1);
    expect(store.listAgentMemories().length).toBeGreaterThan(0);
    expect(store.listCases()[0]?.delegation.tasks.length).toBe(caseFile.delegation.tasks.length);
  });

  it('records approvals, queues execution jobs, and stores dispatch results', () => {
    const { store, orchestrator, delegationEngine, executionService } = buildRuntime();
    const context = buildContext();
    const orchestrationResponse = orchestrator.orchestrate(context);
    const delegatedTasks = delegationEngine.buildTaskGraph(orchestrationResponse);
    const caseFile = store.createCaseFromOrchestration({
      context,
      orchestrationResponse,
      delegatedTasks,
    });

    const reviewId = orchestrationResponse.orchestration.proposalReviews[0]!.proposalId;
    const approval = store.recordApproval({
      caseId: caseFile.id,
      reviewId,
      approver: 'committee-chair',
      decision: 'approve',
      rationale: 'Approved for controlled execution.',
    });

    expect(approval?.decision).toBe('approve');

    const job = executionService.createJob({
      caseId: caseFile.id,
      proposal: orchestrationResponse.decisionBook.proposals[0]!,
      directive: 'ton-mcp-swap',
    });
    store.appendExecutionJob(job);

    const dispatched = executionService.dispatch(job);
    store.updateExecutionJob(dispatched);

    expect(dispatched.status).toBe('succeeded');
    expect(store.listExecutionJobs()).toHaveLength(1);
    expect(store.getCase(caseFile.id)?.executionJobIds).toHaveLength(1);
  });

  it('records outcomes and updates per-agent attribution scores', () => {
    const { store, orchestrator, delegationEngine } = buildRuntime();
    const context = buildContext();
    const orchestrationResponse = orchestrator.orchestrate(context);
    const delegatedTasks = delegationEngine.buildTaskGraph(orchestrationResponse);
    const caseFile = store.createCaseFromOrchestration({
      context,
      orchestrationResponse,
      delegatedTasks,
    });

    const proposalId = orchestrationResponse.decisionBook.proposals[0]!.proposalId;
    const outcome = store.recordOutcome({
      caseId: caseFile.id,
      proposalId,
      outcome: 'profit',
      pnlUsd: 4200,
      notes: 'Execution closed in profit after spread convergence.',
    });

    expect(outcome?.result).toBe('win');
    const attribution = store.listAgentAttribution();
    expect(attribution.length).toBeGreaterThan(0);
    expect(attribution.some((entry) => entry.contributionScore > 0)).toBe(true);
  });
});
