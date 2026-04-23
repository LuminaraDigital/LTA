import { describe, expect, it } from 'vitest';

import { buildAgentOrchestrator } from '../src/core/agent-orchestrator.js';
import { buildDecisionEngine } from '../src/core/decision-engine.js';
import { loadConfig } from '../src/core/config.js';
import { buildRiskEngine } from '../src/core/risk-engine.js';
import { defaultStrategies } from '../src/core/strategy-catalog.js';
import type { DecisionContext } from '../src/core/types.js';

function buildContext(overrides?: Partial<DecisionContext>): DecisionContext {
  return {
    portfolio: {
      totalEquityUsd: 2_000_000,
      liquidUsd: 900_000,
      drawdownPct: 3.4,
      positions: [
        {
          symbol: 'BTC',
          venue: 'cex-binance',
          notionalUsd: 200_000,
          side: 'long',
        },
      ],
    },
    opportunities: [
      {
        id: 'opp-1',
        strategyId: 'cross-exchange-arbitrage',
        symbol: 'TON',
        venue: 'cex-binance',
        direction: 'market-neutral',
        expectedEdgeBps: 42,
        confidence: 0.84,
        estimatedHoldingPeriodHours: 12,
        notionalUsd: 60_000,
        liquidityScore: 0.86,
        executionComplexity: 0.31,
        reasoning: ['Cross-venue spread remains open.'],
      },
      {
        id: 'opp-2',
        strategyId: 'funding-rate-carry',
        symbol: 'ETH',
        venue: 'cex-bybit',
        direction: 'market-neutral',
        expectedEdgeBps: 24,
        confidence: 0.73,
        estimatedHoldingPeriodHours: 30,
        notionalUsd: 110_000,
        liquidityScore: 0.82,
        executionComplexity: 0.42,
        reasoning: ['Carry still positive after hedge costs.'],
      },
    ],
    marketState: {
      regime: 'mixed',
      realizedVolatility30d: 0.46,
      marketStressScore: 0.29,
      fundingDispersionScore: 0.62,
    },
    walletState: {
      network: 'mainnet',
      walletType: 'ton-agentic',
      availableCashUsd: 700_000,
      tonAgenticWalletAddress: 'EQCexamplewalletaddress',
    },
    governance: {
      emergencyStop: false,
      approverPresent: true,
      approvedStrategies: ['cross-exchange-arbitrage', 'funding-rate-carry'],
    },
    ...overrides,
  };
}

describe('LTA agent orchestrator', () => {
  it('produces a multi-agent review with specialist votes and a committee recommendation', () => {
    const config = loadConfig();
    const orchestrator = buildAgentOrchestrator({
      config: {
        organizationName: config.organizationName,
        policyVersion: config.policyVersion,
      },
      decisionEngine: buildDecisionEngine({
        config,
        strategies: defaultStrategies(),
        riskEngine: buildRiskEngine(config.policy),
      }),
    });

    const review = orchestrator.orchestrate(buildContext());

    expect(review.orchestration.topology.agents.length).toBeGreaterThanOrEqual(6);
    expect(review.orchestration.proposalReviews.length).toBeGreaterThan(0);
    expect(review.orchestration.proposalReviews[0]?.findings.length).toBeGreaterThanOrEqual(4);
    expect(review.orchestration.summary.approvedCount).toBeGreaterThanOrEqual(0);
  });

  it('escalates decisions when the committee cannot clear a proposal autonomously', () => {
    const config = loadConfig();
    const orchestrator = buildAgentOrchestrator({
      config: {
        organizationName: config.organizationName,
        policyVersion: config.policyVersion,
      },
      decisionEngine: buildDecisionEngine({
        config,
        strategies: defaultStrategies(),
        riskEngine: buildRiskEngine(config.policy),
      }),
    });

    const review = orchestrator.orchestrate(
      buildContext({
        governance: {
          emergencyStop: false,
          approverPresent: false,
          approvedStrategies: ['cross-exchange-arbitrage', 'funding-rate-carry'],
        },
        opportunities: [
          {
            id: 'opp-large',
            strategyId: 'funding-rate-carry',
            symbol: 'BTC',
            venue: 'cex-binance',
            direction: 'market-neutral',
            expectedEdgeBps: 32,
            confidence: 0.78,
            estimatedHoldingPeriodHours: 20,
            notionalUsd: 180_000,
            liquidityScore: 0.88,
            executionComplexity: 0.39,
            reasoning: ['Large carry event.'],
          },
        ],
      }),
    );

    expect(review.orchestration.summary.reviewCount).toBeGreaterThan(0);
    expect(
      review.orchestration.proposalReviews.some(
        (proposal: { verdict: string }) =>
          proposal.verdict === 'approve-with-review' || proposal.verdict === 'reject',
      ),
    ).toBe(true);
  });
});
