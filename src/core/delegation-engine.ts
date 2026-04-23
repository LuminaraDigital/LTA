import { createHash } from 'node:crypto';

import type {
  AgentRole,
  DelegationGraph,
  DelegationTask,
  DelegationTaskKind,
  DelegationTaskPriority,
  DelegationTaskStatus,
  OrchestrationResponse,
  StrategyId,
  WorkforceAgentDefinition,
} from './types.js';

interface DelegationTarget {
  readonly role: AgentRole;
  readonly kind: DelegationTaskKind;
  readonly title: string;
  readonly description: string;
  readonly priority: DelegationTaskPriority;
}

export interface DelegationEngineDependencies {
  readonly topology: WorkforceAgentDefinition[];
}

export interface DelegationEngine {
  buildTaskGraph(orchestrationResponse: OrchestrationResponse): DelegationGraph[];
}

const strategyTargets: Record<StrategyId, DelegationTarget[]> = {
  'ton-agentic-basis': [
    {
      role: 'onchain-intelligence-analyst',
      kind: 'onchain-check',
      title: 'Validate TON wallet and token-flow context',
      description: 'Inspect TON-native wallet and liquidity context before allocation.',
      priority: 'high',
    },
    {
      role: 'treasury-steward',
      kind: 'treasury-review',
      title: 'Protect treasury buffers',
      description: 'Confirm deployment keeps treasury liquidity within mandate.',
      priority: 'high',
    },
    {
      role: 'execution-strategist',
      kind: 'execution-plan',
      title: 'Draft TON execution path',
      description: 'Prepare controlled TON execution workflow and wallet checks.',
      priority: 'medium',
    },
  ],
  'cross-exchange-arbitrage': [
    {
      role: 'market-structure-analyst',
      kind: 'market-structure-check',
      title: 'Verify spread durability',
      description: 'Confirm the arbitrage spread is executable and not ephemeral.',
      priority: 'high',
    },
    {
      role: 'risk-arbiter',
      kind: 'risk-review',
      title: 'Stress test execution slippage',
      description: 'Challenge latency and slippage assumptions before execution.',
      priority: 'high',
    },
    {
      role: 'execution-strategist',
      kind: 'execution-plan',
      title: 'Prepare venue routing',
      description: 'Build cross-venue routing steps and fallback execution paths.',
      priority: 'medium',
    },
  ],
  'funding-rate-carry': [
    {
      role: 'signal-researcher',
      kind: 'signal-analysis',
      title: 'Validate carry persistence',
      description: 'Confirm funding opportunity quality and persistence.',
      priority: 'medium',
    },
    {
      role: 'portfolio-constructor',
      kind: 'allocation-review',
      title: 'Size carry exposure',
      description: 'Fit the carry trade into the live portfolio risk budget.',
      priority: 'high',
    },
    {
      role: 'risk-arbiter',
      kind: 'risk-review',
      title: 'Challenge downside asymmetry',
      description: 'Review basis and hedge-fragility assumptions.',
      priority: 'high',
    },
  ],
  'trend-following-ml': [
    {
      role: 'signal-researcher',
      kind: 'signal-analysis',
      title: 'Review ML signal quality',
      description: 'Assess model confidence, regime fit, and signal drift.',
      priority: 'high',
    },
    {
      role: 'chief-investment-officer',
      kind: 'allocation-review',
      title: 'Frame directional mandate',
      description: 'Confirm directional conviction fits current macro framing.',
      priority: 'high',
    },
    {
      role: 'portfolio-constructor',
      kind: 'allocation-review',
      title: 'Check directional sizing',
      description: 'Validate directional sizing against active risk budgets.',
      priority: 'medium',
    },
  ],
};

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 14);
}

function taskStatus(kind: DelegationTaskKind): DelegationTaskStatus {
  return kind === 'execution-plan' ? 'ready' : 'pending';
}

function assignedAgentId(
  agents: WorkforceAgentDefinition[],
  role: AgentRole,
): string {
  return agents.find((agent) => agent.role === role)?.id ?? `unassigned-${role}`;
}

function fallbackTargets(
  verdict: 'approve' | 'approve-with-review' | 'reject',
): DelegationTarget[] {
  if (verdict === 'reject') {
    return [
      {
        role: 'compliance-sentinel',
        kind: 'compliance-review',
        title: 'Review rejected proposal',
        description: 'Capture control failures and preserve the case for review.',
        priority: 'critical',
      },
    ];
  }

  if (verdict === 'approve-with-review') {
    return [
      {
        role: 'chief-investment-officer',
        kind: 'allocation-review',
        title: 'Escalate to human committee',
        description: 'Secure human sign-off before execution release.',
        priority: 'critical',
      },
    ];
  }

  return [
    {
      role: 'execution-strategist',
      kind: 'execution-plan',
      title: 'Advance to execution planning',
      description: 'Move approved idea into controlled execution workflow.',
      priority: 'medium',
    },
  ];
}

export function buildDelegationEngine(
  dependencies: DelegationEngineDependencies,
): DelegationEngine {
  return {
    buildTaskGraph(orchestrationResponse) {
      return orchestrationResponse.orchestration.proposalReviews.map((review) => {
        const proposal = orchestrationResponse.decisionBook.proposals.find(
          (candidate) => candidate.proposalId === review.proposalId,
        );

        if (!proposal) {
          throw new Error(`Proposal ${review.proposalId} missing from decision book.`);
        }

        const targets = [
          ...(strategyTargets[proposal.idea.strategyId] ?? []),
          ...fallbackTargets(review.verdict),
        ];

        const deduped = new Map<string, DelegationTarget>();
        for (const target of targets) {
          deduped.set(`${target.role}:${target.kind}`, target);
        }

        const tasks: DelegationTask[] = [...deduped.values()].map((target) => ({
          id: makeId(`${review.proposalId}:${target.role}:${target.kind}`),
          caseFileId: '',
          proposalId: review.proposalId,
          createdAt: nowIso(),
          assignedByAgentId: 'cio',
          assignedToAgentId: assignedAgentId(dependencies.topology, target.role),
          assignedToRole: target.role,
          kind: target.kind,
          title: target.title,
          description: target.description,
          priority: target.priority,
          status: taskStatus(target.kind),
          dependsOnTaskIds: [],
          metadata: {
            verdict: review.verdict,
            strategyId: proposal.idea.strategyId,
            symbol: proposal.idea.symbol,
            venue: proposal.idea.venue,
          },
        }));

        return {
          caseFileId: '',
          proposalId: review.proposalId,
          createdAt: nowIso(),
          rootAgentId: 'cio',
          tasks,
        };
      });
    },
  };
}
