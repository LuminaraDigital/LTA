import { describe, expect, it } from 'vitest';

import { buildDecisionEngine } from '../src/core/decision-engine.js';
import { loadConfig } from '../src/core/config.js';
import { buildRiskEngine } from '../src/core/risk-engine.js';
import { defaultStrategies } from '../src/core/strategy-catalog.js';
import type { DecisionContext } from '../src/core/types.js';

function buildContext(overrides?: Partial<DecisionContext>): DecisionContext {
  return {
    portfolio: {
      totalEquityUsd: 1_000_000,
      liquidUsd: 600_000,
      drawdownPct: 4.2,
      positions: [
        {
          symbol: 'BTC',
          venue: 'cex-binance',
          notionalUsd: 100_000,
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
        expectedEdgeBps: 38,
        confidence: 0.82,
        estimatedHoldingPeriodHours: 10,
        notionalUsd: 40_000,
        liquidityScore: 0.78,
        executionComplexity: 0.44,
        reasoning: ['Temporary spread between approved venues.'],
      },
      {
        id: 'opp-2',
        strategyId: 'funding-rate-carry',
        symbol: 'ETH',
        venue: 'hyperliquid',
        direction: 'market-neutral',
        expectedEdgeBps: 26,
        confidence: 0.74,
        estimatedHoldingPeriodHours: 36,
        notionalUsd: 65_000,
        liquidityScore: 0.81,
        executionComplexity: 0.48,
        reasoning: ['Funding dislocation favorable for carry.'],
      },
    ],
    marketState: {
      regime: 'mixed',
      realizedVolatility30d: 0.48,
      marketStressScore: 0.33,
      fundingDispersionScore: 0.66,
    },
    walletState: {
      network: 'mainnet',
      walletType: 'ton-agentic',
      availableCashUsd: 450_000,
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

describe('LTA decision engine', () => {
  it('approves at least one viable opportunity under normal conditions', () => {
    const config = loadConfig();
    const engine = buildDecisionEngine({
      config,
      strategies: defaultStrategies(),
      riskEngine: buildRiskEngine(config.policy),
    });

    const response = engine.evaluate(buildContext());

    expect(response.summary.approvedCount).toBeGreaterThan(0);
    expect(response.proposals[0]?.risk.approved).toBe(true);
  });

  it('blocks all autonomous execution when emergency stop is enabled', () => {
    const config = loadConfig();
    const engine = buildDecisionEngine({
      config,
      strategies: defaultStrategies(),
      riskEngine: buildRiskEngine(config.policy),
    });

    const response = engine.evaluate(
      buildContext({
        governance: {
          emergencyStop: true,
          approverPresent: true,
          approvedStrategies: ['cross-exchange-arbitrage', 'funding-rate-carry'],
        },
      }),
    );

    expect(response.summary.approvedCount).toBe(0);
    expect(response.proposals.every((proposal) => proposal.risk.approved === false)).toBe(
      true,
    );
    expect(
      response.proposals.every((proposal) =>
        proposal.risk.reasons.some((reason) =>
          reason.message.includes('Emergency stop'),
        ),
      ),
    ).toBe(true);
  });

  it('requires manual approval when proposal size exceeds autonomous threshold', () => {
    const config = loadConfig();
    const engine = buildDecisionEngine({
      config,
      strategies: defaultStrategies(),
      riskEngine: buildRiskEngine(config.policy),
    });

    const response = engine.evaluate(
      buildContext({
        opportunities: [
          {
            id: 'opp-big',
            strategyId: 'cross-exchange-arbitrage',
            symbol: 'BTC',
            venue: 'cex-binance',
            direction: 'market-neutral',
            expectedEdgeBps: 30,
            confidence: 0.88,
            estimatedHoldingPeriodHours: 6,
            notionalUsd: 160_000,
            liquidityScore: 0.92,
            executionComplexity: 0.35,
            reasoning: ['Large but high-confidence spread event.'],
          },
        ],
      }),
    );

    expect(response.proposals[0]?.risk.requiresHumanApproval).toBe(true);
  });
});
