import { randomUUID } from 'node:crypto';

import type {
  AgentJournalCategory,
  AgentJournalEntry,
  AgentPerformanceSnapshot,
  ApprovalDecision,
  ApprovalRecord,
  CaseEvent,
  CaseFile,
  DelegationGraph,
  DelegationTask,
  ExecutionJob,
  ProposalCommitteeReview,
  ProposalOutcome,
  StoredState,
  TradeProposal,
} from './types.js';
import type { DatabaseClient } from '../db/client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function cloneState(state: StoredState): StoredState {
  return JSON.parse(JSON.stringify(state)) as StoredState;
}

function emptyState(): StoredState {
  return {
    caseFiles: [],
    agentJournal: [],
    delegationTasks: [],
    approvals: [],
    executionJobs: [],
    outcomes: [],
    attribution: [],
  };
}

function withOptional<T extends object, K extends string, V>(
  base: T,
  key: K,
  value: V | null | undefined,
): T & Partial<Record<K, V>> {
  if (value == null) {
    return base;
  }

  return {
    ...base,
    [key]: value,
  } as T & Partial<Record<K, V>>;
}

function scoreAttribution(state: StoredState): AgentPerformanceSnapshot[] {
  const snapshots = new Map<string, AgentPerformanceSnapshot>();

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

  return [...snapshots.values()].sort(
    (left, right) => right.contributionScore - left.contributionScore,
  );
}

export interface StateStore {
  listCases(): CaseFile[];
  getCase(caseId: string): CaseFile | undefined;
  createCaseFromOrchestration(input: {
    context: unknown;
    orchestrationResponse: import('./types.js').OrchestrationResponse;
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
  appendExecutionJob(job: ExecutionJob): ExecutionJob;
  updateExecutionJob(job: ExecutionJob): ExecutionJob;
  listExecutionJobs(): ExecutionJob[];
}

interface CaseRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: CaseFile['status'];
  proposal_id: string;
  strategy_id: CaseFile['strategyId'];
  symbol: string;
  venue: string;
  proposal_json: TradeProposal;
  committee_review_json: ProposalCommitteeReview;
  delegation_json: DelegationGraph;
  approvals_json: ApprovalRecord[] | null;
  execution_job_ids_json: string[] | null;
  events_json: CaseEvent[] | null;
  outcome_json: ProposalOutcome | null;
}

interface JournalRow {
  id: string;
  timestamp: string;
  agent_id: string;
  role: AgentJournalEntry['role'];
  category: AgentJournalCategory;
  summary: string;
  linked_case_file_id: string | null;
  linked_proposal_id: string | null;
  metadata_json: Record<string, unknown> | null;
}

interface TaskRow {
  id: string;
  case_file_id: string;
  proposal_id: string;
  created_at: string;
  assigned_by_agent_id: string;
  assigned_to_agent_id: string;
  assigned_to_role: DelegationTask['assignedToRole'];
  kind: DelegationTask['kind'];
  title: string;
  description: string;
  priority: DelegationTask['priority'];
  status: DelegationTask['status'];
  depends_on_task_ids_json: string[] | null;
  metadata_json: Record<string, unknown> | null;
}

interface ApprovalRow {
  id: string;
  case_file_id: string;
  timestamp: string;
  actor: string;
  decision: ApprovalDecision;
  comment: string;
}

interface ExecutionRow {
  id: string;
  case_file_id: string;
  proposal_id: string;
  target: ExecutionJob['target'];
  mode: ExecutionJob['mode'];
  venue: string;
  created_at: string;
  updated_at: string;
  status: ExecutionJob['status'];
  request_payload_json: Record<string, unknown>;
  result_json: ExecutionJob['result'] | null;
}

interface OutcomeRow {
  case_file_id: string;
  recorded_at: string;
  result: ProposalOutcome['result'];
  realized_pnl_usd: number;
  realized_pnl_bps: number;
  notes: string | null;
}

interface AttributionRow {
  agent_id: string;
  role: AgentPerformanceSnapshot['role'];
  cases_reviewed: number;
  support_wins: number;
  support_losses: number;
  oppose_wins: number;
  oppose_losses: number;
  escalate_count: number;
  abstain_count: number;
  contribution_score: number;
  updated_at: string;
}

function mapCase(row: CaseRow): CaseFile {
  const base: CaseFile = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    proposalId: row.proposal_id,
    strategyId: row.strategy_id,
    symbol: row.symbol,
    venue: row.venue,
    proposal: row.proposal_json,
    committeeReview: row.committee_review_json,
    delegation: row.delegation_json,
    approvals: row.approvals_json ?? [],
    executionJobIds: row.execution_job_ids_json ?? [],
    events: row.events_json ?? [],
  };

  return withOptional(base, 'outcome', row.outcome_json ?? undefined);
}

function mapJournal(row: JournalRow): AgentJournalEntry {
  let entry: AgentJournalEntry = {
    id: row.id,
    timestamp: row.timestamp,
    agentId: row.agent_id,
    role: row.role,
    category: row.category,
    summary: row.summary,
  };
  entry = withOptional(entry, 'linkedCaseFileId', row.linked_case_file_id ?? undefined);
  entry = withOptional(entry, 'linkedProposalId', row.linked_proposal_id ?? undefined);
  entry = withOptional(entry, 'metadata', row.metadata_json ?? undefined);
  return entry;
}

function mapTask(row: TaskRow): DelegationTask {
  let task: DelegationTask = {
    id: row.id,
    caseFileId: row.case_file_id,
    proposalId: row.proposal_id,
    createdAt: row.created_at,
    assignedByAgentId: row.assigned_by_agent_id,
    assignedToAgentId: row.assigned_to_agent_id,
    assignedToRole: row.assigned_to_role,
    kind: row.kind,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    dependsOnTaskIds: row.depends_on_task_ids_json ?? [],
  };
  task = withOptional(task, 'metadata', row.metadata_json ?? undefined);
  return task;
}

function mapApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    caseFileId: row.case_file_id,
    timestamp: row.timestamp,
    actor: row.actor,
    decision: row.decision,
    comment: row.comment,
  };
}

function mapExecution(row: ExecutionRow): ExecutionJob {
  let job: ExecutionJob = {
    id: row.id,
    caseFileId: row.case_file_id,
    proposalId: row.proposal_id,
    target: row.target,
    mode: row.mode,
    venue: row.venue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    requestPayload: row.request_payload_json,
  };
  job = withOptional(job, 'result', row.result_json ?? undefined);
  return job;
}

function mapOutcome(row: OutcomeRow): ProposalOutcome {
  const base: ProposalOutcome = {
    caseFileId: row.case_file_id,
    recordedAt: row.recorded_at,
    result: row.result,
    realizedPnlUsd: row.realized_pnl_usd,
    realizedPnlBps: row.realized_pnl_bps,
  };
  return withOptional(base, 'notes', row.notes ?? undefined);
}

function mapAttribution(row: AttributionRow): AgentPerformanceSnapshot {
  return {
    agentId: row.agent_id,
    role: row.role,
    casesReviewed: row.cases_reviewed,
    supportWins: row.support_wins,
    supportLosses: row.support_losses,
    opposeWins: row.oppose_wins,
    opposeLosses: row.oppose_losses,
    escalateCount: row.escalate_count,
    abstainCount: row.abstain_count,
    contributionScore: row.contribution_score,
    updatedAt: row.updated_at,
  };
}

async function loadState(db: DatabaseClient): Promise<StoredState> {
  const [caseRows, journalRows, taskRows, approvalRows, executionRows, outcomeRows, attributionRows] =
    await Promise.all([
      db.query<CaseRow>('SELECT * FROM case_files ORDER BY created_at DESC'),
      db.query<JournalRow>('SELECT * FROM agent_journal ORDER BY timestamp DESC'),
      db.query<TaskRow>('SELECT * FROM delegation_tasks ORDER BY created_at DESC'),
      db.query<ApprovalRow>('SELECT * FROM approvals ORDER BY timestamp DESC'),
      db.query<ExecutionRow>('SELECT * FROM execution_jobs ORDER BY created_at DESC'),
      db.query<OutcomeRow>('SELECT * FROM proposal_outcomes ORDER BY recorded_at DESC'),
      db.query<AttributionRow>('SELECT * FROM agent_performance ORDER BY updated_at DESC'),
    ]);

  return {
    caseFiles: caseRows.rows.map(mapCase),
    agentJournal: journalRows.rows.map(mapJournal),
    delegationTasks: taskRows.rows.map(mapTask),
    approvals: approvalRows.rows.map(mapApproval),
    executionJobs: executionRows.rows.map(mapExecution),
    outcomes: outcomeRows.rows.map(mapOutcome),
    attribution: attributionRows.rows.map(mapAttribution),
  };
}

class DatabaseStateStore implements StateStore {
  private state: StoredState = emptyState();

  constructor(private readonly db: DatabaseClient) {}

  async initialize(): Promise<void> {
    this.state = await loadState(this.db);
  }

  private clone(): StoredState {
    return cloneState(this.state);
  }

  private persistCase(caseFile: CaseFile): void {
    void this.db
      .query(
        `INSERT INTO case_files (
          id, created_at, updated_at, status, proposal_id, strategy_id, symbol, venue,
          proposal_json, committee_review_json, delegation_json, approvals_json,
          execution_job_ids_json, events_json, outcome_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          status = EXCLUDED.status,
          approvals_json = EXCLUDED.approvals_json,
          execution_job_ids_json = EXCLUDED.execution_job_ids_json,
          events_json = EXCLUDED.events_json,
          outcome_json = EXCLUDED.outcome_json,
          proposal_json = EXCLUDED.proposal_json,
          committee_review_json = EXCLUDED.committee_review_json,
          delegation_json = EXCLUDED.delegation_json`,
        [
          caseFile.id,
          caseFile.createdAt,
          caseFile.updatedAt,
          caseFile.status,
          caseFile.proposalId,
          caseFile.strategyId,
          caseFile.symbol,
          caseFile.venue,
          caseFile.proposal,
          caseFile.committeeReview,
          caseFile.delegation,
          caseFile.approvals,
          caseFile.executionJobIds,
          caseFile.events,
          caseFile.outcome ?? null,
        ],
      )
      .catch(() => {});
  }

  private persistTask(task: DelegationTask): void {
    void this.db
      .query(
        `INSERT INTO delegation_tasks (
          id, case_file_id, proposal_id, created_at, assigned_by_agent_id, assigned_to_agent_id,
          assigned_to_role, kind, title, description, priority, status,
          depends_on_task_ids_json, metadata_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          metadata_json = EXCLUDED.metadata_json,
          description = EXCLUDED.description`,
        [
          task.id,
          task.caseFileId,
          task.proposalId,
          task.createdAt,
          task.assignedByAgentId,
          task.assignedToAgentId,
          task.assignedToRole,
          task.kind,
          task.title,
          task.description,
          task.priority,
          task.status,
          task.dependsOnTaskIds,
          task.metadata ?? {},
        ],
      )
      .catch(() => {});
  }

  private persistJournal(entry: AgentJournalEntry): void {
    void this.db
      .query(
        `INSERT INTO agent_journal (
          id, timestamp, agent_id, role, category, summary,
          linked_case_file_id, linked_proposal_id, metadata_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING`,
        [
          entry.id,
          entry.timestamp,
          entry.agentId,
          entry.role,
          entry.category,
          entry.summary,
          entry.linkedCaseFileId ?? null,
          entry.linkedProposalId ?? null,
          entry.metadata ?? {},
        ],
      )
      .catch(() => {});
  }

  private persistApproval(record: ApprovalRecord): void {
    void this.db
      .query(
        `INSERT INTO approvals (id, case_file_id, timestamp, actor, decision, comment)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET decision = EXCLUDED.decision, comment = EXCLUDED.comment`,
        [record.id, record.caseFileId, record.timestamp, record.actor, record.decision, record.comment],
      )
      .catch(() => {});
  }

  private persistExecutionJob(job: ExecutionJob): void {
    void this.db
      .query(
        `INSERT INTO execution_jobs (
          id, case_file_id, proposal_id, target, mode, venue,
          created_at, updated_at, status, request_payload_json, result_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          status = EXCLUDED.status,
          result_json = EXCLUDED.result_json,
          request_payload_json = EXCLUDED.request_payload_json`,
        [
          job.id,
          job.caseFileId,
          job.proposalId,
          job.target,
          job.mode,
          job.venue,
          job.createdAt,
          job.updatedAt,
          job.status,
          job.requestPayload,
          job.result ?? null,
        ],
      )
      .catch(() => {});
  }

  private persistOutcome(outcome: ProposalOutcome): void {
    void this.db
      .query(
        `INSERT INTO proposal_outcomes (
          case_file_id, recorded_at, result, realized_pnl_usd, realized_pnl_bps, notes
        ) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (case_file_id) DO UPDATE SET
          recorded_at = EXCLUDED.recorded_at,
          result = EXCLUDED.result,
          realized_pnl_usd = EXCLUDED.realized_pnl_usd,
          realized_pnl_bps = EXCLUDED.realized_pnl_bps,
          notes = EXCLUDED.notes`,
        [
          outcome.caseFileId,
          outcome.recordedAt,
          outcome.result,
          outcome.realizedPnlUsd,
          outcome.realizedPnlBps,
          outcome.notes ?? null,
        ],
      )
      .catch(() => {});
  }

  private persistAttribution(score: AgentPerformanceSnapshot): void {
    void this.db
      .query(
        `INSERT INTO agent_performance (
          agent_id, role, cases_reviewed, support_wins, support_losses,
          oppose_wins, oppose_losses, escalate_count, abstain_count,
          contribution_score, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (agent_id) DO UPDATE SET
          role = EXCLUDED.role,
          cases_reviewed = EXCLUDED.cases_reviewed,
          support_wins = EXCLUDED.support_wins,
          support_losses = EXCLUDED.support_losses,
          oppose_wins = EXCLUDED.oppose_wins,
          oppose_losses = EXCLUDED.oppose_losses,
          escalate_count = EXCLUDED.escalate_count,
          abstain_count = EXCLUDED.abstain_count,
          contribution_score = EXCLUDED.contribution_score,
          updated_at = EXCLUDED.updated_at`,
        [
          score.agentId,
          score.role,
          score.casesReviewed,
          score.supportWins,
          score.supportLosses,
          score.opposeWins,
          score.opposeLosses,
          score.escalateCount,
          score.abstainCount,
          score.contributionScore,
          score.updatedAt,
        ],
      )
      .catch(() => {});
  }

  listCases(): CaseFile[] {
    return this.clone().caseFiles;
  }

  getCase(caseId: string): CaseFile | undefined {
    return this.clone().caseFiles.find((caseFile) => caseFile.id === caseId);
  }

  createCaseFromOrchestration(input: {
    context: unknown;
    orchestrationResponse: import('./types.js').OrchestrationResponse;
    delegatedTasks: DelegationGraph[];
  }): CaseFile {
    const proposal = input.orchestrationResponse.decisionBook.proposals[0];
    const review = input.orchestrationResponse.orchestration.proposalReviews.find(
      (item) => item.proposalId === proposal?.proposalId,
    );
    const graph = input.delegatedTasks.find((item) => item.proposalId === proposal?.proposalId);

    if (!proposal || !review || !graph) {
      throw new Error('Case creation requires a proposal, committee review, and delegation graph.');
    }

    const caseFile: CaseFile = {
      id: `case-${randomUUID()}`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status:
        review.verdict === 'approve'
          ? 'approved'
          : review.verdict === 'approve-with-review'
            ? 'pending-approval'
            : 'rejected',
      proposalId: proposal.proposalId,
      strategyId: proposal.idea.strategyId,
      symbol: proposal.idea.symbol,
      venue: proposal.idea.venue,
      proposal,
      committeeReview: review,
      delegation: {
        ...graph,
        caseFileId: `case-${randomUUID()}`,
        tasks: graph.tasks,
      },
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
    caseFile.delegation.caseFileId = caseFile.id;
    caseFile.delegation.tasks = caseFile.delegation.tasks.map((task) => ({
      ...task,
      caseFileId: caseFile.id,
    }));

    this.state.caseFiles.push(caseFile);
    this.state.delegationTasks.push(...caseFile.delegation.tasks);

    for (const finding of review.findings) {
      const entry: AgentJournalEntry = {
        id: `journal-${randomUUID()}`,
        timestamp: nowIso(),
        agentId: finding.agentId,
        role: finding.role,
        category: 'case',
        summary: finding.summary,
        linkedCaseFileId: caseFile.id,
        linkedProposalId: caseFile.proposalId,
        metadata: {
          concerns: finding.concerns,
          requestedActions: finding.requestedActions,
          stance: finding.stance,
        },
      };
      this.state.agentJournal.push(entry);
      this.persistJournal(entry);
    }

    this.state.attribution = scoreAttribution(this.state);
    this.persistCase(caseFile);
    for (const task of caseFile.delegation.tasks) {
      this.persistTask(task);
    }
    for (const score of this.state.attribution) {
      this.persistAttribution(score);
    }

    return caseFile;
  }

  recordApproval(input: {
    caseId: string;
    reviewId: string;
    approver: string;
    decision: ApprovalDecision;
    rationale?: string;
  }): ApprovalRecord | null {
    const caseFile = this.state.caseFiles.find((item) => item.id === input.caseId);
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
      metadata: { rationale: input.rationale ?? '' },
    });

    const journal: AgentJournalEntry = {
      id: `journal-${randomUUID()}`,
      timestamp: nowIso(),
      agentId: 'human-approval-console',
      role: 'chief-investment-officer',
      category: 'approval',
      summary: `Human approver ${input.decision} decision for ${caseFile.id}.`,
      linkedCaseFileId: caseFile.id,
      linkedProposalId: caseFile.proposalId,
      metadata: { approver: input.approver },
    };

    this.state.approvals.push(record);
    this.state.agentJournal.push(journal);
    this.state.attribution = scoreAttribution(this.state);

    this.persistApproval(record);
    this.persistJournal(journal);
    this.persistCase(caseFile);
    for (const score of this.state.attribution) {
      this.persistAttribution(score);
    }

    return record;
  }

  recordOutcome(input: {
    caseId: string;
    proposalId: string;
    outcome: 'profit' | 'loss' | 'scratch' | 'cancelled';
    pnlUsd: number;
    notes?: string;
  }): ProposalOutcome | null {
    const caseFile = this.state.caseFiles.find(
      (item) => item.id === input.caseId && item.proposalId === input.proposalId,
    );
    if (!caseFile) {
      return null;
    }

    const realizedPnlBps =
      caseFile.proposal.idea.notionalUsd === 0
        ? 0
        : Number(((input.pnlUsd / caseFile.proposal.idea.notionalUsd) * 10_000).toFixed(2));
    const result: ProposalOutcome['result'] =
      input.outcome === 'profit' ? 'win' : input.outcome === 'loss' ? 'loss' : 'flat';

    const outcome = withOptional(
      {
        caseFileId: input.caseId,
        recordedAt: nowIso(),
        result,
        realizedPnlUsd: input.pnlUsd,
        realizedPnlBps,
      },
      'notes',
      input.notes,
    );

    caseFile.outcome = outcome;
    caseFile.status = input.outcome === 'cancelled' ? 'failed' : 'completed';
    caseFile.updatedAt = nowIso();
    caseFile.events.push({
      timestamp: nowIso(),
      actor: 'post-trade-auditor',
      type: 'outcome',
      summary: `Outcome recorded as ${input.outcome} with pnl ${input.pnlUsd} USD.`,
      metadata: { notes: input.notes ?? '' },
    });

    const journal: AgentJournalEntry = {
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
    };

    this.state.outcomes = this.state.outcomes.filter((item) => item.caseFileId !== input.caseId);
    this.state.outcomes.push(outcome);
    this.state.agentJournal.push(journal);
    this.state.attribution = scoreAttribution(this.state);

    this.persistOutcome(outcome);
    this.persistJournal(journal);
    this.persistCase(caseFile);
    for (const score of this.state.attribution) {
      this.persistAttribution(score);
    }

    return outcome;
  }

  listAgentAttribution(): AgentPerformanceSnapshot[] {
    return this.clone().attribution;
  }

  listAgentMemories(): AgentJournalEntry[] {
    return this.clone().agentJournal;
  }

  appendExecutionJob(job: ExecutionJob): ExecutionJob {
    this.state.executionJobs.push(job);
    const caseFile = this.state.caseFiles.find((item) => item.id === job.caseFileId);
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
      this.persistCase(caseFile);
    }
    this.persistExecutionJob(job);
    return job;
  }

  updateExecutionJob(job: ExecutionJob): ExecutionJob {
    const index = this.state.executionJobs.findIndex((item) => item.id === job.id);
    if (index >= 0) {
      this.state.executionJobs[index] = job;
    } else {
      this.state.executionJobs.push(job);
    }
    this.persistExecutionJob(job);
    return job;
  }

  listExecutionJobs(): ExecutionJob[] {
    return this.clone().executionJobs;
  }
}

export async function buildStateStore({ db }: { db: DatabaseClient }): Promise<StateStore> {
  const store = new DatabaseStateStore(db);
  await store.initialize();
  return store;
}
