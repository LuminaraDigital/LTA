import { createHash } from 'node:crypto';

import type {
  AgentFinding,
  AgentRole,
  CommitteeVerdict,
  DecisionContext,
  LtaConfig,
  OrchestrationReport,
  OrchestrationResponse,
  ProposalCommitteeReview,
  TradeProposal,
  WorkforceTopology,
} from './types.js';
import type { DecisionEngine } from './decision-engine.js';

export interface AgentOrchestratorDependencies {
  readonly config: Pick<LtaConfig, 'organizationName' | 'policyVersion'>;
  readonly decisionEngine: DecisionEngine;
}

export interface AgentOrchestrator {
  listAgents(): WorkforceTopology['agents'];
  orchestrate(context: DecisionContext): OrchestrationResponse;
}

function makeId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const workforceTopology: WorkforceTopology = {
  version: 'lta-workforce-v1',
  operatingPrinciples: [
    'Separate idea generation from challenge, allocation, and execution authority.',
    'Require adversarial review before trade release.',
    'Escalate ambiguous or oversized proposals instead of forcing autonomy.',
  ],
  coordinationLoops: [
    'Signal loop -> challenge loop -> allocation loop -> execution control loop',
    'Post-trade feedback loop into future allocation and confidence calibration',
  ],
  cells: [
    {
      id: 'signal-intelligence',
      mission: 'Generate differentiated market intelligence and candidate trade theses.',
      agentIds: ['cio', 'signal-researcher', 'market-structure', 'onchain-intel'],
    },
    {
      id: 'challenge',
      mission: 'Stress test assumptions and enforce downside discipline.',
      agentIds: ['risk-arbiter', 'compliance-sentinel'],
    },
    {
      id: 'allocation',
      mission: 'Decide capital deployment and treasury fit.',
      agentIds: ['portfolio-constructor', 'treasury-steward'],
    },
    {
      id: 'execution-control',
      mission: 'Translate approved ideas into safe execution workflows.',
      agentIds: ['execution-strategist'],
    },
  ],
  agents: [
    {
      id: 'cio',
      name: 'LTA Chief Investment Officer',
      role: 'chief-investment-officer',
      cell: 'signal-intelligence',
      mandate: 'Own final investment framing and weigh opportunity quality.',
      primaryMetrics: ['portfolio return', 'strategy hit rate'],
      handoffTargets: ['risk-arbiter', 'portfolio-constructor'],
    },
    {
      id: 'signal-researcher',
      name: 'Signal Researcher',
      role: 'signal-researcher',
      cell: 'signal-intelligence',
      mandate: 'Assess signal quality and persistence.',
      primaryMetrics: ['signal precision', 'confidence calibration'],
      handoffTargets: ['chief-investment-officer', 'risk-arbiter'],
    },
    {
      id: 'market-structure',
      name: 'Market Structure Analyst',
      role: 'market-structure-analyst',
      cell: 'signal-intelligence',
      mandate: 'Evaluate spread durability, liquidity, and venue quality.',
      primaryMetrics: ['execution slippage', 'venue quality'],
      handoffTargets: ['execution-strategist', 'risk-arbiter'],
    },
    {
      id: 'onchain-intel',
      name: 'Onchain Intelligence Analyst',
      role: 'onchain-intelligence-analyst',
      cell: 'signal-intelligence',
      mandate: 'Incorporate wallet, flow, and token-specific context.',
      primaryMetrics: ['wallet signal coverage', 'onchain anomaly detection'],
      handoffTargets: ['chief-investment-officer', 'compliance-sentinel'],
    },
    {
      id: 'risk-arbiter',
      name: 'Risk Arbiter',
      role: 'risk-arbiter',
      cell: 'challenge',
      mandate: 'Apply hard-loss discipline and veto structurally weak trades.',
      primaryMetrics: ['drawdown control', 'breach avoidance'],
      handoffTargets: ['portfolio-constructor', 'chief-investment-officer'],
    },
    {
      id: 'compliance-sentinel',
      name: 'Compliance Sentinel',
      role: 'compliance-sentinel',
      cell: 'challenge',
      mandate: 'Escalate policy, venue, and governance issues.',
      primaryMetrics: ['policy adherence', 'exception rate'],
      handoffTargets: ['risk-arbiter', 'treasury-steward'],
    },
    {
      id: 'portfolio-constructor',
      name: 'Portfolio Constructor',
      role: 'portfolio-constructor',
      cell: 'allocation',
      mandate: 'Fit proposals into portfolio exposures and capital budgets.',
      primaryMetrics: ['capital efficiency', 'portfolio balance'],
      handoffTargets: ['treasury-steward', 'execution-strategist'],
    },
    {
      id: 'treasury-steward',
      name: 'Treasury Steward',
      role: 'treasury-steward',
      cell: 'allocation',
      mandate: 'Protect liquidity and treasury buffers.',
      primaryMetrics: ['cash coverage', 'treasury utilization'],
      handoffTargets: ['execution-strategist', 'chief-investment-officer'],
    },
    {
      id: 'execution-strategist',
      name: 'Execution Strategist',
      role: 'execution-strategist',
      cell: 'execution-control',
      mandate: 'Convert approved proposals into executable workflows.',
      primaryMetrics: ['fill quality', 'execution reliability'],
      handoffTargets: ['risk-arbiter', 'treasury-steward'],
    },
  ],
};

function summarizeProposal(proposal: TradeProposal): string {
  return `${proposal.idea.strategyId} on ${proposal.idea.symbol} at ${proposal.idea.venue} for ${proposal.idea.notionalUsd} USD.`;
}

function makeFinding(
  proposal: TradeProposal,
  agentId: string,
  role: AgentRole,
  stance: AgentFinding['stance'],
  confidence: number,
  summary: string,
  concerns: string[],
  requestedActions: string[],
): AgentFinding {
  return {
    agentId,
    role,
    stance,
    confidence,
    summary,
    concerns,
    requestedActions,
  };
}

function buildFindings(proposal: TradeProposal): AgentFinding[] {
  const blockedReasons = proposal.risk.reasons.map((reason) => reason.message);
  const executionSummary = summarizeProposal(proposal);
  const requiresReview = proposal.risk.requiresHumanApproval;

  return [
    makeFinding(
      proposal,
      'cio',
      'chief-investment-officer',
      proposal.risk.approved ? 'support' : 'oppose',
      clamp(proposal.score + 0.5, 0.45, 0.96),
      `CIO view: ${executionSummary}`,
      blockedReasons,
      proposal.risk.approved ? ['Continue to allocation review.'] : ['Reject until thesis improves.'],
    ),
    makeFinding(
      proposal,
      'signal-researcher',
      'signal-researcher',
      proposal.score >= 0.45 ? 'support' : 'abstain',
      clamp(proposal.score + 0.35, 0.3, 0.9),
      'Signal quality and confidence appear consistent with the proposal score.',
      [],
      ['Monitor live signal decay after entry.'],
    ),
    makeFinding(
      proposal,
      'market-structure',
      'market-structure-analyst',
      proposal.idea.executionComplexity <= 0.45 ? 'support' : 'escalate',
      clamp(0.8 - proposal.idea.executionComplexity * 0.3, 0.35, 0.88),
      'Venue and microstructure support executable routing.',
      proposal.idea.executionComplexity > 0.45 ? ['Execution complexity is elevated.'] : [],
      ['Confirm quote depth before release.'],
    ),
    makeFinding(
      proposal,
      'onchain-intel',
      'onchain-intelligence-analyst',
      proposal.idea.symbol === 'TON' ? 'support' : 'abstain',
      proposal.idea.symbol === 'TON' ? 0.74 : 0.52,
      'Onchain context is strongest for wallet-native and token-flow-aware trades.',
      [],
      ['Cross-check token and wallet telemetry if applicable.'],
    ),
    makeFinding(
      proposal,
      'risk-arbiter',
      'risk-arbiter',
      proposal.risk.approved ? 'support' : 'oppose',
      proposal.risk.approved ? 0.78 : 0.95,
      proposal.risk.approved
        ? 'Risk limits remain within the current operating envelope.'
        : 'Risk controls reject the proposal under current policy.',
      blockedReasons,
      proposal.risk.approved ? ['Maintain stop discipline.'] : ['Do not execute.'],
    ),
    makeFinding(
      proposal,
      'portfolio-constructor',
      'portfolio-constructor',
      requiresReview ? 'escalate' : proposal.risk.approved ? 'support' : 'oppose',
      requiresReview ? 0.77 : 0.72,
      'Portfolio fit depends on current allocation and treasury budgets.',
      requiresReview ? ['Capital deployment exceeds autonomous threshold.'] : [],
      requiresReview ? ['Escalate to committee for capital approval.'] : ['Size remains within budget.'],
    ),
    makeFinding(
      proposal,
      'treasury-steward',
      'treasury-steward',
      requiresReview ? 'escalate' : 'support',
      0.76,
      'Treasury steward validates liquidity sufficiency before release.',
      requiresReview ? ['Human treasury sign-off required.'] : [],
      ['Preserve post-trade cash buffer.'],
    ),
    makeFinding(
      proposal,
      'execution-strategist',
      'execution-strategist',
      proposal.risk.approved ? (requiresReview ? 'escalate' : 'support') : 'oppose',
      0.73,
      'Execution path is available subject to approvals and venue readiness.',
      [],
      requiresReview
        ? ['Queue for human-approved execution workflow.']
        : ['Proceed to controlled execution workflow.'],
    ),
  ];
}

function verdictFromFindings(findings: AgentFinding[]): CommitteeVerdict {
  const opposeCount = findings.filter((finding) => finding.stance === 'oppose').length;
  const escalateCount = findings.filter((finding) => finding.stance === 'escalate').length;

  if (opposeCount > 0) {
    return 'reject';
  }

  if (escalateCount > 0) {
    return 'approve-with-review';
  }

  return 'approve';
}

function buildProposalReview(proposal: TradeProposal): ProposalCommitteeReview {
  const findings = buildFindings(proposal);
  const supportCount = findings.filter((finding) => finding.stance === 'support').length;
  const opposeCount = findings.filter((finding) => finding.stance === 'oppose').length;
  const escalateCount = findings.filter((finding) => finding.stance === 'escalate').length;
  const verdict = verdictFromFindings(findings);

  return {
    proposalId: proposal.proposalId,
    verdict,
    consensusScore: clamp((supportCount - opposeCount + 2) / findings.length, 0, 1),
    supportCount,
    opposeCount,
    escalateCount,
    finalRationale:
      verdict === 'approve'
        ? 'Workforce consensus supports execution under current policy.'
        : verdict === 'approve-with-review'
          ? 'Workforce supports the idea but requires additional human review.'
          : 'Workforce rejects the proposal until blocking issues are resolved.',
    findings,
    nextActions:
      verdict === 'approve'
        ? ['Route the proposal to execution control.', 'Capture post-trade reconciliation.']
        : verdict === 'approve-with-review'
          ? ['Escalate to human approver.', 'Hold execution until sign-off is captured.']
          : ['Do not execute.', 'Reassess signal quality or policy exemptions.'],
  };
}

function buildOrchestrationReport(proposals: TradeProposal[]): OrchestrationReport {
  const proposalReviews = proposals.map(buildProposalReview);
  const approvedCount = proposalReviews.filter((review) => review.verdict === 'approve').length;
  const reviewCount = proposalReviews.filter(
    (review) => review.verdict === 'approve-with-review',
  ).length;
  const rejectedCount = proposalReviews.filter((review) => review.verdict === 'reject').length;

  return {
    generatedAt: new Date().toISOString(),
    topology: workforceTopology,
    proposalReviews,
    summary: {
      approvedCount,
      reviewCount,
      rejectedCount,
    },
  };
}

export function buildAgentOrchestrator(
  dependencies: AgentOrchestratorDependencies,
): AgentOrchestrator {
  return {
    listAgents() {
      return workforceTopology.agents;
    },
    orchestrate(context: DecisionContext): OrchestrationResponse {
      const decisionBook = dependencies.decisionEngine.evaluate(context);

      return {
        decisionBook,
        orchestration: buildOrchestrationReport(decisionBook.proposals),
      };
    },
  };
}
