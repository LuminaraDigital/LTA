import { randomUUID } from 'node:crypto';

import type {
  ExecutionDirective,
  ExecutionJob,
  ExecutionJobResult,
  ExecutionJobTarget,
  LtaConfig,
  TonChainStatus,
  TradeProposal,
} from './types.js';
import type { buildTonAgenticWalletAdapter } from './ton-adapter.js';
import type { TonMcpClient } from './ton-mcp-client.js';
import {
  buildTonExecutionPlan,
  extractNormalizedHash,
} from './ton-execution-mapper.js';

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function parseTransactionStatus(
  text: string,
): { chainStatus: TonChainStatus; raw: Record<string, unknown> } | undefined {
  const obj = parseJsonObject(text);
  if (!obj) {
    return undefined;
  }
  const statusRaw = obj.status;
  if (statusRaw === 'completed') {
    return { chainStatus: 'completed', raw: obj };
  }
  if (statusRaw === 'failed') {
    return { chainStatus: 'failed', raw: obj };
  }
  if (statusRaw === 'pending') {
    return { chainStatus: 'pending', raw: obj };
  }
  if (statusRaw === 'unknown') {
    return { chainStatus: 'pending', raw: obj };
  }
  return { chainStatus: 'pending', raw: obj };
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
  tonMcp,
}: {
  config: LtaConfig;
  tonAdapter: ReturnType<typeof buildTonAgenticWalletAdapter>;
  tonMcp?: TonMcpClient;
}): ExecutionService {
  async function runTonMcpDispatch(job: ExecutionJob): Promise<ExecutionJob> {
    if (!tonMcp) {
      return stubTonDispatch(job);
    }

    const directive = job.requestPayload.directive as ExecutionDirective | undefined;
    if (
      directive !== 'ton-mcp-transfer' &&
      directive !== 'ton-mcp-swap'
    ) {
      return stubTonDispatch(job);
    }

    const proposal = job.requestPayload.proposalSnapshot as TradeProposal | undefined;
    if (!proposal) {
      return failJob(job, 'Missing proposalSnapshot on execution job for TON MCP dispatch.');
    }

    let plan;
    try {
      plan = buildTonExecutionPlan(directive, proposal, config);
    } catch (error) {
      return failJob(
        job,
        error instanceof Error ? error.message : 'Invalid TON execution plan.',
      );
    }

    const toolLog: Array<{ tool: string; phase: string; result: Record<string, unknown> }> = [];
    const startedAt = nowIso();

    await tonMcp.connect();
    try {
      if (plan.transfer) {
        const call = await tonMcp.callTool(plan.transfer.tool, plan.transfer.args);
        const structured = call.structuredContent ?? parseJsonObject(call.text);
        const hash = extractNormalizedHash(structured);
        toolLog.push({
          tool: plan.transfer.tool,
          phase: 'transfer',
          result: {
            isError: call.isError,
            text: call.text,
            structuredContent: structured ?? null,
            normalizedHash: hash ?? null,
          },
        });
        if (call.isError || !hash) {
          return failJob(
            job,
            hash
              ? 'TON transfer tool returned an error.'
              : 'TON transfer did not return normalizedHash.',
            {
              normalizedHash: hash,
              toolLog,
              mcpPhase: 'transfer',
            },
            startedAt,
          );
        }
        return pendingJob(job, hash, toolLog, startedAt, 'TON transfer submitted; awaiting reconciliation.');
      }

      if (plan.swap) {
        const quoteCall = await tonMcp.callTool(
          plan.swap.quote.tool,
          plan.swap.quote.args,
        );
        const quoteStructured =
          quoteCall.structuredContent ?? parseJsonObject(quoteCall.text);
        const quoteParsed = quoteStructured;
        toolLog.push({
          tool: 'get_swap_quote',
          phase: 'quote',
          result: {
            isError: quoteCall.isError,
            text: quoteCall.text,
            structuredContent: quoteStructured ?? null,
          },
        });
        if (quoteCall.isError) {
          return failJob(job, 'get_swap_quote failed.', {
            toolLog,
            mcpPhase: 'quote',
          }, startedAt);
        }

        if (!quoteParsed) {
          return failJob(job, 'get_swap_quote returned empty or non-JSON body.', {
            toolLog,
            mcpPhase: 'quote',
          }, startedAt);
        }

        const fromObj =
          typeof quoteParsed.quote === 'object' && quoteParsed.quote !== null
            ? (quoteParsed.quote as Record<string, unknown>)
            : undefined;
        const success =
          quoteParsed.success === true ? true : fromObj != null;
        if (!success) {
          return failJob(job, 'Swap quote response was not successful.', {
            toolLog,
            mcpPhase: 'quote',
          }, startedAt);
        }

        const txContainer = quoteParsed.transaction as
          | Record<string, unknown>
          | undefined;
        if (!txContainer) {
          return failJob(job, 'Swap quote did not include transaction.', {
            toolLog,
            mcpPhase: 'quote',
          }, startedAt);
        }
        const messages = txContainer.messages;
        if (!Array.isArray(messages) || messages.length === 0) {
          return failJob(job, 'Swap quote did not include transaction.messages.', {
            toolLog,
            mcpPhase: 'quote',
          }, startedAt);
        }

        const rawArgs: Record<string, unknown> = { messages };
        if (typeof txContainer.validUntil === 'number') {
          rawArgs.validUntil = txContainer.validUntil;
        }
        if (typeof txContainer.fromAddress === 'string') {
          rawArgs.fromAddress = txContainer.fromAddress;
        }

        const sendCall = await tonMcp.callTool('send_raw_transaction', rawArgs);
        const sendStructured =
          sendCall.structuredContent ?? parseJsonObject(sendCall.text);
        const hash = extractNormalizedHash(sendStructured);
        toolLog.push({
          tool: 'send_raw_transaction',
          phase: 'swap_execute',
          result: {
            isError: sendCall.isError,
            text: sendCall.text,
            structuredContent: sendStructured ?? null,
            normalizedHash: hash ?? null,
          },
        });
        if (sendCall.isError || !hash) {
          return failJob(
            job,
            hash
              ? 'send_raw_transaction returned an error.'
              : 'send_raw_transaction did not return normalizedHash.',
            {
              normalizedHash: hash,
              toolLog,
              mcpPhase: 'swap_execute',
            },
            startedAt,
          );
        }
        return pendingJob(job, hash, toolLog, startedAt, 'Swap transaction submitted; awaiting reconciliation.');
      }

      return failJob(job, 'No TON MCP action in execution plan.', { toolLog }, startedAt);
    } finally {
      await tonMcp.close();
    }
  }

  function stubTonDispatch(job: ExecutionJob): ExecutionJob {
    const result: ExecutionJobResult = {
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
        stub: true,
      }),
    };
    return {
      ...job,
      status: 'succeeded',
      updatedAt: nowIso(),
      result,
    };
  }

  function failJob(
    job: ExecutionJob,
    summary: string,
    metadata?: Record<string, unknown>,
    reconciliationStartedAt?: string,
  ): ExecutionJob {
    const nh =
      metadata && typeof metadata.normalizedHash === 'string'
        ? metadata.normalizedHash
        : undefined;
    const result: ExecutionJobResult = {
      timestamp: nowIso(),
      summary,
      rawOutput: JSON.stringify(metadata ?? {}),
      ...(nh ? { normalizedHash: nh } : {}),
      ...(metadata ? { metadata } : {}),
      ...(reconciliationStartedAt
        ? {
            reconciliation: {
              startedAt: reconciliationStartedAt,
              completedAt: nowIso(),
              pollHistory: [],
            },
          }
        : {}),
    };
    return {
      ...job,
      status: 'failed',
      updatedAt: nowIso(),
      result,
    };
  }

  function pendingJob(
    job: ExecutionJob,
    normalizedHash: string,
    toolLog: Array<{ tool: string; phase: string; result: Record<string, unknown> }>,
    startedAt: string,
    summary: string,
  ): ExecutionJob {
    const result: ExecutionJobResult = {
      timestamp: nowIso(),
      summary,
      referenceId: normalizedHash,
      normalizedHash,
      rawOutput: JSON.stringify({ toolLog }),
      metadata: { toolLog },
      chainStatus: 'pending',
      reconciliation: {
        startedAt,
        pollHistory: [],
      },
    };
    return {
      ...job,
      status: 'pending',
      updatedAt: nowIso(),
      result,
    };
  }

  return {
    createJob({ caseId, proposal, directive }) {
      const target = mapDirectiveToTarget(directive);
      const requestPayload: Record<string, unknown> =
        target === 'ton-mcp'
          ? {
              directive,
              mode: config.execution.simulationMode ? 'simulation' : 'live',
              tonApprovalPlan: tonAdapter.prepareApproval({
                symbol: proposal.idea.symbol,
                venue: proposal.idea.venue,
                direction: proposal.idea.direction,
                notionalUsd: proposal.idea.notionalUsd,
                strategyId: proposal.idea.strategyId,
              }),
              proposalId: proposal.proposalId,
              proposalSnapshot: proposal,
            }
          : {
              directive,
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
    async dispatch(job) {
      if (job.target !== 'ton-mcp') {
        const result: ExecutionJobResult = {
          timestamp: nowIso(),
          summary:
            config.execution.mode === 'dry-run'
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
      }

      const useRealMcp =
        tonMcp != null &&
        config.execution.mode === 'live' &&
        config.execution.simulationMode !== true;

      if (!useRealMcp) {
        return stubTonDispatch(job);
      }

      return runTonMcpDispatch(job);
    },
    async reconcile(job) {
      if (job.target !== 'ton-mcp' || !job.result?.normalizedHash || !tonMcp) {
        return {
          ...job,
          updatedAt: nowIso(),
        };
      }

      const hash = job.result.normalizedHash;
      const pollHistory = job.result.reconciliation?.pollHistory ?? [];
      const startedAt = job.result.reconciliation?.startedAt ?? job.result.timestamp;
      let lastChainStatus: TonChainStatus = job.result.chainStatus ?? 'pending';
      let lastText = '';
      let lastStructured: Record<string, unknown> | undefined;

      await tonMcp.connect();
      try {
        for (let attempt = 0; attempt < config.execution.tonMaxPollAttempts; attempt += 1) {
          if (attempt > 0) {
            await sleep(config.execution.tonPollIntervalMs);
          }
          const polledAt = nowIso();
          const statusCall = await tonMcp.callTool('get_transaction_status', {
            normalizedHash: hash,
          });
          lastText = statusCall.text;
          lastStructured =
            statusCall.structuredContent ?? parseJsonObject(statusCall.text);
          const parsed = parseTransactionStatus(statusCall.text);
          const chainStatus = parsed?.chainStatus ?? 'pending';
          lastChainStatus = chainStatus;

          const entry = {
            polledAt,
            chainStatus,
            rawText: lastText,
            ...(lastStructured ? { rawStructured: lastStructured } : {}),
          };
          pollHistory.push(entry);

          if (chainStatus === 'completed') {
            const result: ExecutionJobResult = {
              ...job.result,
              timestamp: nowIso(),
              summary: 'TON transaction completed on-chain.',
              chainStatus: 'completed',
              rawOutput: JSON.stringify({
                ...(job.result.metadata ?? {}),
                finalStatusCall: {
                  text: lastText,
                  structuredContent: lastStructured ?? null,
                },
              }),
              reconciliation: {
                startedAt,
                lastPolledAt: polledAt,
                completedAt: polledAt,
                pollHistory,
              },
            };
            return {
              ...job,
              status: 'succeeded',
              updatedAt: nowIso(),
              result,
            };
          }

          if (chainStatus === 'failed') {
            const result: ExecutionJobResult = {
              ...job.result,
              timestamp: nowIso(),
              summary: 'TON transaction failed on-chain.',
              chainStatus: 'failed',
              rawOutput: JSON.stringify({
                ...(job.result.metadata ?? {}),
                finalStatusCall: {
                  text: lastText,
                  structuredContent: lastStructured ?? null,
                },
              }),
              reconciliation: {
                startedAt,
                lastPolledAt: polledAt,
                completedAt: polledAt,
                pollHistory,
              },
            };
            return {
              ...job,
              status: 'failed',
              updatedAt: nowIso(),
              result,
            };
          }
        }

        const lastPoll = pollHistory[pollHistory.length - 1];
        const reconBase = {
          startedAt,
          completedAt: nowIso(),
          pollHistory,
          ...(lastPoll ? { lastPolledAt: lastPoll.polledAt } : {}),
        };
        const result: ExecutionJobResult = {
          ...job.result,
          timestamp: nowIso(),
          summary: `TON transaction still pending after ${config.execution.tonMaxPollAttempts} status polls.`,
          chainStatus: lastChainStatus,
          rawOutput: JSON.stringify({
            ...(job.result.metadata ?? {}),
            lastStatusCall: {
              text: lastText,
              structuredContent: lastStructured ?? null,
            },
          }),
          reconciliation: reconBase,
        };
        return {
          ...job,
          status: 'failed',
          updatedAt: nowIso(),
          result,
        };
      } finally {
        await tonMcp.close();
      }
    },
  };
}
