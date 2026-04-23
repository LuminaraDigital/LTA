import type {
  DecisionContext,
  GatingReason,
  PolicyPack,
  TradeIdea,
} from './types.js';

export interface RiskEngine {
  evaluateOpportunity(opportunity: TradeIdea, context: DecisionContext): {
    approved: boolean;
    requiresHumanApproval: boolean;
    reasons: GatingReason[];
  };
}

function exceedsPositionLimit(tradeIdea: TradeIdea, policy: PolicyPack): boolean {
  return tradeIdea.notionalUsd > policy.maxSingleTradeUsd;
}

function exceedsVaR(tradeIdea: TradeIdea, policy: PolicyPack): boolean {
  return tradeIdea.estimatedVaRUsd > policy.maxPortfolioVaRUsd;
}

function exceedsDrawdown(context: DecisionContext, policy: PolicyPack): boolean {
  return context.portfolio.drawdownPct > policy.maxDrawdownPct;
}

function breachesConcentration(tradeIdea: TradeIdea, context: DecisionContext, policy: PolicyPack): boolean {
  const currentNetExposure = context.portfolio.positions.reduce(
    (sum, position) => sum + Math.abs(position.notionalUsd),
    0,
  );
  return currentNetExposure + tradeIdea.notionalUsd > policy.maxNetExposureUsd;
}

function venueNotAllowed(tradeIdea: TradeIdea, policy: PolicyPack): boolean {
  return !policy.allowedVenues.includes(tradeIdea.venue);
}

function strategyNotAllowed(tradeIdea: TradeIdea, context: DecisionContext, policy: PolicyPack): boolean {
  const approvedStrategies = context.governance?.approvedStrategies;
  if (approvedStrategies && !approvedStrategies.includes(tradeIdea.strategyId)) {
    return true;
  }

  return !policy.allowedStrategies.includes(tradeIdea.strategyId);
}

function emergencyStopActive(context: DecisionContext): boolean {
  return Boolean(context.governance?.emergencyStop);
}

export function buildRiskEngine(policy: PolicyPack): RiskEngine {
  return {
    evaluateOpportunity(tradeIdea: TradeIdea, context: DecisionContext) {
      const reasons: GatingReason[] = [];

      if (emergencyStopActive(context)) {
        reasons.push({
          code: 'EMERGENCY_STOP',
          severity: 'critical',
          message: 'Emergency stop is active; all autonomous execution is blocked.',
        });
      }

      if (strategyNotAllowed(tradeIdea, context, policy)) {
        reasons.push({
          code: 'STRATEGY_NOT_APPROVED',
          severity: 'critical',
          message: `Strategy ${tradeIdea.strategyId} is not approved for autonomous execution.`,
        });
      }

      if (venueNotAllowed(tradeIdea, policy)) {
        reasons.push({
          code: 'POLICY_BLOCK',
          severity: 'critical',
          message: `Venue ${tradeIdea.venue} is not in the approved venue list.`,
        });
      }

      if (exceedsPositionLimit(tradeIdea, policy)) {
        reasons.push({
          code: 'POSITION_LIMIT',
          severity: 'critical',
          message: `Proposed position ${tradeIdea.notionalUsd} exceeds per-trade cap ${policy.maxSingleTradeUsd}.`,
        });
      }

      if (exceedsVaR(tradeIdea, policy)) {
        reasons.push({
          code: 'VAR_LIMIT',
          severity: 'critical',
          message: `Estimated VaR ${tradeIdea.estimatedVaRUsd} exceeds portfolio ceiling ${policy.maxPortfolioVaRUsd}.`,
        });
      }

      if (exceedsDrawdown(context, policy)) {
        reasons.push({
          code: 'DRAWDOWN_GUARD',
          severity: 'warning',
          message: `Portfolio drawdown ${context.portfolio.drawdownPct}% is above allowed ${policy.maxDrawdownPct}%.`,
        });
      }

      if (breachesConcentration(tradeIdea, context, policy)) {
        reasons.push({
          code: 'CONCENTRATION_LIMIT',
          severity: 'warning',
          message: 'The trade would breach configured net exposure limits.',
        });
      }

      const requiresHumanApproval =
        tradeIdea.notionalUsd >= policy.manualApprovalThresholdUsd ||
        (policy.allowShorting === false && tradeIdea.direction === 'sell') ||
        tradeIdea.venue.toLowerCase().includes('dex');

      if (requiresHumanApproval) {
        reasons.push({
          code: 'MANUAL_APPROVAL',
          severity: 'info',
          message: 'Trade exceeds autonomous approval policy and requires human sign-off.',
        });
      }

      const blockingReasons = reasons.filter((reason) => reason.severity === 'critical');

      return {
        approved: blockingReasons.length === 0,
        requiresHumanApproval,
        reasons,
      };
    },
  };
}
