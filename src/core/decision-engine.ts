import { createHash } from 'node:crypto';

import type {
  DecisionContext,
  DecisionResponse,
  ExecutionStep,
  Opportunity,
  StrategyDefinition,
  TonExecutionHints,
  TradeIdea,
  TradeProposal,
} from './types.js';
import type { RiskEngine } from './risk-engine.js';

export interface DecisionEngineDependencies {
  readonly config: {
    readonly organizationName: string;
    readonly policyVersion: string;
    readonly requestIdSeed: string;
  };
  readonly strategies: StrategyDefinition[];
  readonly riskEngine: RiskEngine;
}

export interface DecisionEngine {
  scoreOpportunity(opportunity: Opportunity): number;
  evaluate(context: DecisionContext): DecisionResponse;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createProposalId(seed: string, opportunityId: string): string {
  return createHash('sha256')
    .update(`${seed}:${opportunityId}`)
    .digest('hex')
    .slice(0, 16);
}

function scoreOpportunity(opportunity: Opportunity): number {
  const edgeComponent = clamp(opportunity.expectedEdgeBps / 50, -1, 1) * 0.4;
  const confidenceComponent = clamp(opportunity.confidence, 0, 1) * 0.25;
  const liquidityComponent = clamp(opportunity.liquidityScore, 0, 1) * 0.2;
  const complexityPenalty = clamp(opportunity.executionComplexity, 0, 1) * 0.15;

  return Number(
    (
      edgeComponent +
      confidenceComponent +
      liquidityComponent -
      complexityPenalty
    ).toFixed(4),
  );
}

function mergeTonExecutionHints(
  opportunity: Opportunity,
): TonExecutionHints | undefined {
  const fromMeta = opportunity.venueMetadata?.tonExecution as
    | TonExecutionHints
    | undefined;
  const merged: TonExecutionHints = {
    ...(fromMeta ?? {}),
    ...(opportunity.tonExecution ?? {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function toTradeIdea(opportunity: Opportunity): TradeIdea {
  const idea: TradeIdea = {
    symbol: opportunity.symbol,
    venue: opportunity.venue,
    direction:
      opportunity.direction === 'short'
        ? 'sell'
        : opportunity.direction === 'market-neutral'
          ? 'hedge'
          : 'buy',
    notionalUsd: opportunity.notionalUsd,
    strategyId: opportunity.strategyId,
    expectedEdgeBps: opportunity.expectedEdgeBps,
    confidence: opportunity.confidence,
    liquidityScore: opportunity.liquidityScore,
    executionComplexity: opportunity.executionComplexity,
    estimatedVaRUsd: Number((opportunity.notionalUsd * 0.08).toFixed(2)),
  };
  const tonExecution = mergeTonExecutionHints(opportunity);
  if (tonExecution) {
    idea.tonExecution = tonExecution;
  }
  return idea;
}

function buildExecutionPlan(idea: TradeIdea): ExecutionStep[] {
  return [
    {
      step: 'risk-check',
      description: `Re-check policy, exposure, and venue constraints for ${idea.strategyId}.`,
    },
    {
      step: 'wallet-balance',
      description: `Confirm spendable balance and settlement inventory for ${idea.symbol}.`,
    },
    {
      step: 'quote',
      description: `Request executable quotes on ${idea.venue} for ${idea.notionalUsd} USD.`,
    },
    {
      step: 'execution',
      description: `Execute ${idea.direction} for ${idea.symbol} through the approved route.`,
    },
    {
      step: 'post-trade-reconciliation',
      description: 'Persist fills, updated limits, and audit records to the control plane.',
    },
  ];
}

export function buildDecisionEngine(
  dependencies: DecisionEngineDependencies,
): DecisionEngine {
  const strategyMap = new Map<string, StrategyDefinition>(
    dependencies.strategies.map((strategy) => [strategy.id, strategy]),
  );

  return {
    scoreOpportunity,
    evaluate(context: DecisionContext): DecisionResponse {
      const proposals: TradeProposal[] = context.opportunities
        .filter((opportunity) => strategyMap.has(opportunity.strategyId))
        .map((opportunity) => {
          const idea = toTradeIdea(opportunity);
          const score = scoreOpportunity(opportunity);
          const policyDecision = dependencies.riskEngine.evaluateOpportunity(
            idea,
            context,
          );
          const strategy = strategyMap.get(opportunity.strategyId)!;

          return {
            proposalId: createProposalId(
              dependencies.config.requestIdSeed,
              opportunity.id,
            ),
            strategy,
            idea,
            score,
            risk: policyDecision,
            executionPlan: buildExecutionPlan(idea),
          };
        })
        .sort((left, right) => right.score - left.score);

      const approvedTrades = proposals.filter(
        (proposal) =>
          proposal.risk.approved && !proposal.risk.requiresHumanApproval,
      ).length;
      const humanReviewTrades = proposals.filter(
        (proposal) =>
          proposal.risk.approved && proposal.risk.requiresHumanApproval,
      ).length;
      const blockedTrades = proposals.filter((proposal) => !proposal.risk.approved)
        .length;

      return {
        organization: dependencies.config.organizationName,
        policyVersion: dependencies.config.policyVersion,
        generatedAt: new Date().toISOString(),
        summary: {
          evaluatedCount: context.opportunities.length,
          approvedCount: approvedTrades,
          blockedCount: blockedTrades,
          humanReviewCount: humanReviewTrades,
        },
        proposals,
      };
    },
  };
}
