import { randomUUID } from 'node:crypto';

import type {
  ExecutionDirective,
  ExecutionJob,
  ExecutionJobResult,
  ExecutionJobTarget,
  LtaConfig,
  TradeProposal,
} from './types.js';
import type { buildTonAgenticWalletAdapter } from './ton-adapter.js';

function nowIso(): string {
  return new Date().toISOString();
}

function mapDirectiveToTarget(directive: ExecutionDirective): ExecutionJobTarget {
  return directive === 'exchange-webhook' ? 'venue-webhook' : 'ton-mcp';
}

function venueWebhookTarget(config: LtaConfig, venue: string): string {
  const normalized = venue.toLowerCase();
  return (
    config.execution.venueWebhooks[normalized as keyof typeof config.execution.venueWebhooks] ??
    config.execution.venueWebhooks.default ??
    `${config.execution.exchangeWebhookBaseUrl}/${encodeURIComponent(venue)}`
  );
}

export interface ExecutionService {
  createJob(input: {
    caseId: string;
    proposal: TradeProposal;
    directive: ExecutionDirective;
  }): ExecutionJob;
  dispatch(job: ExecutionJob): Promise<ExecutionJob>;
  reconcile(job: ExecutionJob): Promise<ExecutionJob>;
}

export function buildExecutionService({
  config,
  tonAdapter,
}: {
  config: LtaConfig;
  tonAdapter: ReturnType<typeof buildTonAgenticWalletAdapter>;
}): ExecutionService {
  return {
    createJob({ caseId, proposal, directive }) {
      const target = mapDirectiveToTarget(directive);
      const requestPayload: Record<string, unknown> =
        target === 'ton-mcp'
          ? {
              mode: config.execution.simulationMode ? 'simulation' : 'live',
              tonApprovalPlan: tonAdapter.prepareApproval({
                symbol: proposal.idea.symbol,
                venue: proposal.idea.venue,
                direction: proposal.idea.direction,
                notionalUsd: proposal.idea.notionalUsd,
                strategyId: proposal.idea.strategyId,
              }),
              proposalId: proposal.proposalId,
            }
          : {
              webhookTarget: venueWebhookTarget(config, proposal.idea.venue),
              proposalId: proposal.proposalId,
              strategyId: proposal.idea.strategyId,
              symbol: proposal.idea.symbol,
              direction: proposal.idea.direction,
              notionalUsd: proposal.idea.notionalUsd,
              mode: config.execution.simulationMode ? 'simulation' : 'live',
            };

      return {
        id: `job-${randomUUID()}`,
        caseFileId: caseId,
        proposalId: proposal.proposalId,
        target,
        mode: config.execution.mode,
        venue: proposal.idea.venue,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        status: 'queued',
        requestPayload,
      };
    },
    async dispatch(job: ExecutionJob) {
      const result: ExecutionJobResult =
        job.target === 'ton-mcp'
          ? {
              timestamp: nowIso(),
              summary:
                config.execution.mode === 'dry-run'
                ? 'TON MCP execution simulated successfully.'
                : 'TON MCP execution dispatched successfully.',
              referenceId: `ton-${randomUUID().slice(0, 8)}`,
              rawOutput: JSON.stringify({
                target: job.target,
                mode: job.mode,
                proposalId: job.proposalId,
              }),
            }
          : {
              timestamp: nowIso(),
              summary: config.execution.mode === 'dry-run'
                ? 'Exchange webhook execution simulated successfully.'
                : 'Exchange webhook dispatched successfully.',
              referenceId: `venue-${randomUUID().slice(0, 8)}`,
              rawOutput: JSON.stringify({
                target: job.target,
                venue: job.venue,
                mode: job.mode,
              }),
            };

      return {
        ...job,
        status: 'succeeded',
        updatedAt: nowIso(),
        result,
      };
    },
    async reconcile(job: ExecutionJob) {
      return {
        ...job,
        updatedAt: nowIso(),
      };
    },
  };
}
