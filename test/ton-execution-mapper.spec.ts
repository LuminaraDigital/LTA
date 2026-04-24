import { describe, expect, it } from 'vitest';

import { loadConfigFromEnv } from '../src/core/config.js';
import { buildTonExecutionPlan, extractNormalizedHash } from '../src/core/ton-execution-mapper.js';
import type { TradeProposal } from '../src/core/types.js';
import { defaultStrategies } from '../src/core/strategy-catalog.js';

function minimalProposal(overrides?: Partial<TradeProposal>): TradeProposal {
  const strategies = defaultStrategies();
  const strategy = strategies[0]!;
  return {
    proposalId: 'prop-test',
    strategy,
    idea: {
      symbol: 'TON',
      venue: 'ton-dex',
      direction: 'buy',
      notionalUsd: 1000,
      strategyId: strategy.id,
      expectedEdgeBps: 10,
      confidence: 0.9,
      liquidityScore: 0.8,
      executionComplexity: 0.2,
      estimatedVaRUsd: 80,
    },
    score: 0.5,
    risk: {
      approved: true,
      requiresHumanApproval: false,
      reasons: [],
    },
    executionPlan: [],
    ...overrides,
  };
}

describe('ton-execution-mapper', () => {
  it('maps transfer with jetton to send_jetton', () => {
    const config = loadConfigFromEnv({
      NODE_ENV: 'test',
      LTA_EXECUTION_SIMULATION: 'true',
    });
    const proposal = minimalProposal({
      idea: {
        ...minimalProposal().idea,
        tonExecution: {
          toAddress: 'UQTestRecipient',
          jettonAddress: 'EQJettonMaster',
          amount: '10',
        },
      },
    });
    const plan = buildTonExecutionPlan('ton-mcp-transfer', proposal, config);
    expect(plan.transfer?.tool).toBe('send_jetton');
    expect(plan.transfer?.args).toMatchObject({
      toAddress: 'UQTestRecipient',
      jettonAddress: 'EQJettonMaster',
      amount: '10',
    });
  });

  it('maps transfer without jetton to send_ton', () => {
    const config = loadConfigFromEnv({
      NODE_ENV: 'test',
      LTA_EXECUTION_SIMULATION: 'true',
    });
    const proposal = minimalProposal({
      idea: {
        ...minimalProposal().idea,
        tonExecution: {
          toAddress: 'UQTestRecipient',
          amount: '0.05',
        },
      },
    });
    const plan = buildTonExecutionPlan('ton-mcp-transfer', proposal, config);
    expect(plan.transfer?.tool).toBe('send_ton');
  });

  it('extracts normalizedHash from structured content', () => {
    expect(extractNormalizedHash({ normalizedHash: '0xabc' })).toBe('0xabc');
    expect(extractNormalizedHash(undefined)).toBeUndefined();
  });
});
