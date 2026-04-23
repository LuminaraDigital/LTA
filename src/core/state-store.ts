import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  AgentJournalEntry,
  AgentJournalCategory,
  AgentPerformanceSnapshot,
  ApprovalDecision,
  ApprovalRecord,
  CaseFile,
  DelegationGraph,
  DelegationTask,
  LtaConfig,
  OrchestrationResponse,
  ProposalOutcome,
  StoredState,
  TradeProposal,
} from './types.js';

const INITIAL_STATE: StoredState = {
  caseFiles: [],
  agentJournal: [],
  delegationTasks: [],
  approvals: [],
  executionJobs: [],
  outcomes: [],
  attribution: [],
};

function cloneState(state: StoredState): StoredState {
  return JSON.parse(JSON.stringify(state)) as StoredState;
}

function nowIso(): string {
  return new Date().toISOString();
}

function scoreAttribution(state: StoredState): AgentPerformanceSnapshot[] {
  const snapshots = new Map<string, AgentPerformanceSnapshot>();
  const caseMap = new Map(state.caseFiles.map((caseFile) => [caseFile.id, caseFile]));

  for (const caseFile of state.caseFiles) {
    const outcome = state.outcomes.find((item) => item.caseFileId === caseFile.id);
    for (const finding of caseFile.committeeReview.findings) {
      const existing =
        snapshots.get(finding.agentId) ??
        {
          agentId: finding.agentId,
          role: finding.role,
          casesReviewed: 0,
          supportWins: 0,
          supportLosses: 0,
          opposeWins: 0,
          opposeLosses: 0,
          escalateCount: 0,
          abstainCount: 0,
          contributionScore: 0,
          updatedAt: nowIso(),
        };

      existing.casesReviewed += 1;
      if (finding.stance === 'escalate') {
        existing.escalateCount += 1;
      } else if (finding.stance === 'abstain') {
        existing.abstainCount += 1;
      } else if (finding.stance === 'support' && outcome) {
        if (outcome.result === 'win') {
          existing.supportWins += 1;
        } else if (outcome.result === 'loss') {
          existing.supportLosses += 1;
        }
      } else if (finding.stance === 'oppose' && outcome) {
        if (outcome.result === 'loss') {
          existing.opposeWins += 1;
        } else if (outcome.result === 'win') {
          existing.opposeLosses += 1;
        }
      }

      existing.contributionScore =
        existing.supportWins * 2 +
        existing.opposeWins * 1.5 -
        existing.supportLosses * 1.5 -
        existing.opposeLosses +
        existing.escalateCount * 0.25 -
        existing.abstainCount * 0.1;
      existing.updatedAt = nowIso();
      snapshots.set(finding.agentId, existing);
    }
  }

  for (const approval of state.approvals) {
    const caseFile = caseMap.get(approval.caseFileId);
    if (!caseFile) {
      continue;
    }

    state.agentJournal.push({
      id: `approval-journal-${approval.id}`,
      timestamp: approval.timestamp,
      agentId: 'human-approval-console',
      role: 'chief-investment-officer',
      category: 'approval',
      summary: `Human ${approval.decision} decision recorded for case ${approval.caseFileId}.`,
      linkedCaseFileId: approval.caseFileId,
      linkedProposalId: caseFile.proposalId,
      metadata: {
        actor: approval.actor,
        comment: approval.comment,
      },
    });
  }

  return [...snapshots.values()].sort(
    (left, right) => right.contributionScore - left.contributionScore,
  );
}

export interface StateStore {
  listCases(): CaseFile[];
  getCase(caseId: string): CaseFile | undefined;
  createCaseFromOrchestration(input: {
    context: OrchestrationResponse['decisionBook'] extends never ? never : unknown;
    orchestrationResponse: OrchestrationResponse;
    delegatedTasks: DelegationGraph[];
  }): CaseFile;
  recordApproval(input: {
    caseId: string;
    reviewId: string;
    approver: string;
    decision: ApprovalDecision;
    rationale?: string;
  }): ApprovalRecord | null;
  recordOutcome(input: {
    caseId: string;
    proposalId: string;
    outcome: 'profit' | 'loss' | 'scratch' | 'cancelled';
    pnlUsd: number;
    notes?: string;
  }): ProposalOutcome | null;
  listAgentAttribution(): AgentPerformanceSnapshot[];
  listAgentMemories(): AgentJournalEntry[];
  appendExecutionJob(job: import('./types.js').ExecutionJob): import('./types.js').ExecutionJob;
  updateExecutionJob(job: import('./types.js').ExecutionJob): import('./types.js').ExecutionJob;
  listExecutionJobs(): import('./types.js').ExecutionJob[];
}

class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      writeFileSync(this.filePath, JSON.stringify(INITIAL_STATE, null, 2) + '\n', 'utf8');
    }
  }

  private readState(): StoredState {
    const raw = readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredState;
    return {
      caseFiles: parsed.caseFiles ?? [],
      agentJournal: parsed.agentJournal ?? [],
      delegationTasks: parsed.delegationTasks ?? [],
      approvals: parsed.approvals ?? [],
      executionJobs: parsed.executionJobs ?? [],
      outcomes: parsed.outcomes ?? [],
      attribution: parsed.attribution ?? [],
    };
  }

  private writeState(state: StoredState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  listCases(): CaseFile[] {
    return cloneState(this.readState()).caseFiles;
  }

  getCase(caseId: string): CaseFile | undefined {
    return this.listCases().find((caseFile) => caseFile.id === caseId);
  }

  createCaseFromOrchestration(input: {
    context: unknown;
    orchestrationResponse: OrchestrationResponse;
    delegatedTasks: DelegationGraph[];
  }): CaseFile {
    const { orchestrationResponse, delegatedTasks } = input;
    const proposal = orchestrationResponse.decisionBook.proposals[0];
    const proposalReview = orchestrationResponse.orchestration.proposalReviews.find(
      (review) => review.proposalId === proposal?.proposalId,
    );

    if (!proposal || !proposalReview) {
      throw new Error('Cannot create case without a proposal and committee review.');
    }

    const state = this.readState();
    const selectedGraph =
      delegatedTasks.find((taskGraph) => taskGraph.proposalId === proposal.proposalId) ??
      delegatedTasks[0];

    if (!selectedGraph) {
      throw new Error('No delegation graph available for case creation.');
    }

    const caseFile: CaseFile = {
      id: `case-${randomUUID()}`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status:
        proposalReview.verdict === 'approve'
          ? 'approved'
          : proposalReview.verdict === 'approve-with-review'
            ? 'pending-approval'
            : 'rejected',
      proposalId: proposal.proposalId,
      strategyId: proposal.idea.strategyId,
      symbol: proposal.idea.symbol,
      venue: proposal.idea.venue,
      proposal,
      committeeReview: proposalReview,
      delegation: selectedGraph,
      approvals: [],
      executionJobIds: [],
      events: [
        {
          timestamp: nowIso(),
          actor: 'lta-orchestrator',
          type: 'created',
          summary: 'Case file created from orchestration response.',
        },
      ],
    };

    state.caseFiles.push(caseFile);
    state.delegationTasks.push(...selectedGraph.tasks);
    state.agentJournal.push(
      ...proposalReview.findings.map((finding): AgentJournalEntry => ({
        id: `journal-${randomUUID()}`,
        timestamp: nowIso(),
        agentId: finding.agentId,
        role: finding.role,
        category: 'case' as AgentJournalCategory,
        summary: finding.summary,
        linkedCaseFileId: caseFile.id,
        linkedProposalId: proposal.proposalId,
        metadata: {
          concerns: finding.concerns,
          requestedActions: finding.requestedActions,
          stance: finding.stance,
        },
      })),
    );
    state.attribution = scoreAttribution(state);
    this.writeState(state);
    return caseFile;
  }

  recordApproval(input: {
    caseId: string;
    reviewId: string;
    approver: string;
    decision: ApprovalDecision;
    rationale?: string;
  }): ApprovalRecord | null {
    const state = this.readState();
    const caseFile = state.caseFiles.find((item) => item.id === input.caseId);
    if (!caseFile || caseFile.committeeReview.proposalId !== input.reviewId) {
      return null;
    }

    const record: ApprovalRecord = {
      id: `approval-${randomUUID()}`,
      caseFileId: input.caseId,
      timestamp: nowIso(),
      actor: input.approver,
      decision: input.decision,
      comment: input.rationale ?? '',
    };

    caseFile.approvals.push(record);
    caseFile.status =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'overridden';
    caseFile.updatedAt = nowIso();
    caseFile.events.push({
      timestamp: nowIso(),
      actor: input.approver,
      type: 'approval',
      summary: `Approval decision ${input.decision} recorded.`,
      metadata: {
        rationale: input.rationale ?? null,
      },
    });
    state.approvals.push(record);
    state.agentJournal.push({
      id: `journal-${randomUUID()}`,
      timestamp: nowIso(),
      agentId: 'human-approval-console',
      role: 'chief-investment-officer',
      category: 'approval',
      summary: `Human approver ${input.decision} decision for ${caseFile.id}.`,
      linkedCaseFileId: caseFile.id,
      linkedProposalId: caseFile.proposalId,
      metadata: {
        approver: input.approver,
      },
    });
    state.attribution = scoreAttribution(state);
    this.writeState(state);
    return record;
  }

  recordOutcome(input: {
    caseId: string;
    proposalId: string;
    outcome: 'profit' | 'loss' | 'scratch' | 'cancelled';
    pnlUsd: number;
    notes?: string;
  }): ProposalOutcome | null {
    const state = this.readState();
    const caseFile = state.caseFiles.find(
      (item) => item.id === input.caseId && item.proposalId === input.proposalId,
    );
    if (!caseFile) {
      return null;
    }

    const realizedPnlBps =
      caseFile.proposal.idea.notionalUsd === 0
        ? 0
        : Number(
            ((input.pnlUsd / caseFile.proposal.idea.notionalUsd) * 10_000).toFixed(2),
          );
    const result: ProposalOutcome['result'] =
      input.outcome === 'profit'
        ? 'win'
        : input.outcome === 'loss'
          ? 'loss'
          : 'flat';
    const outcomeBase = {
      caseFileId: input.caseId,
      recordedAt: nowIso(),
      result,
      realizedPnlUsd: input.pnlUsd,
      realizedPnlBps,
    };
    const outcome: ProposalOutcome =
      input.notes != null
        ? {
            ...outcomeBase,
            notes: input.notes,
          }
        : outcomeBase;

    caseFile.outcome = outcome;
    caseFile.status =
      input.outcome === 'cancelled'
        ? 'failed'
        : input.outcome === 'scratch'
          ? 'completed'
          : 'completed';
    caseFile.updatedAt = nowIso();
    caseFile.events.push({
      timestamp: nowIso(),
      actor: 'post-trade-auditor',
      type: 'outcome',
      summary: `Outcome recorded as ${input.outcome} with pnl ${input.pnlUsd} USD.`,
      metadata: {
        notes: input.notes ?? null,
      },
    });
    state.outcomes = state.outcomes.filter((item) => item.caseFileId !== input.caseId);
    state.outcomes.push(outcome);
    state.agentJournal.push({
      id: `journal-${randomUUID()}`,
      timestamp: nowIso(),
      agentId: 'post-trade-auditor',
      role: 'execution-strategist',
      category: 'outcome',
      summary: `Case ${input.caseId} closed with ${input.outcome}.`,
      linkedCaseFileId: input.caseId,
      linkedProposalId: input.proposalId,
      metadata: {
        pnlUsd: input.pnlUsd,
        result,
      },
    });
    state.attribution = scoreAttribution(state);
    this.writeState(state);
    return outcome;
  }

  listAgentAttribution(): AgentPerformanceSnapshot[] {
    return cloneState(this.readState()).attribution;
  }

  listAgentMemories(): AgentJournalEntry[] {
    return cloneState(this.readState()).agentJournal;
  }

  appendExecutionJob(job: import('./types.js').ExecutionJob): import('./types.js').ExecutionJob {
    const state = this.readState();
    state.executionJobs.push(job);
    const caseFile = state.caseFiles.find((item) => item.id === job.caseFileId);
    if (caseFile) {
      caseFile.executionJobIds.push(job.id);
      caseFile.status = 'executing';
      caseFile.updatedAt = nowIso();
      caseFile.events.push({
        timestamp: nowIso(),
        actor: 'execution-runner',
        type: 'execution',
        summary: `Execution job ${job.id} queued.`,
      });
    }
    this.writeState(state);
    return job;
  }

  updateExecutionJob(job: import('./types.js').ExecutionJob): import('./types.js').ExecutionJob {
    const state = this.readState();
    const index = state.executionJobs.findIndex((item) => item.id === job.id);
    if (index >= 0) {
      state.executionJobs[index] = job;
    } else {
      state.executionJobs.push(job);
    }
    this.writeState(state);
    return job;
  }

  listExecutionJobs(): import('./types.js').ExecutionJob[] {
    return cloneState(this.readState()).executionJobs;
  }
}

export function buildStateStore(config: Pick<LtaConfig, 'execution'>): StateStore {
  return new FileStateStore(
    resolve(config.execution.stateDirectory, 'lta-state.json'),
  );
}
