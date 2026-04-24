import type {
  ExecutionDirective,
  LtaConfig,
  TonExecutionHints,
  TradeProposal,
} from './types.js';

const NATIVE = 'TON';

export interface TonTransferMcpCall {
  tool: 'send_ton' | 'send_jetton';
  args: Record<string, unknown>;
}

export interface TonSwapMcpPlan {
  quote: { tool: 'get_swap_quote'; args: Record<string, unknown> };
}

export interface TonExecutionPlan {
  directive: ExecutionDirective;
  transfer?: TonTransferMcpCall;
  swap?: TonSwapMcpPlan;
}

function readHints(proposal: TradeProposal): TonExecutionHints {
  return proposal.idea.tonExecution ?? {};
}

function defaultSwapTokens(
  proposal: TradeProposal,
  hints: TonExecutionHints,
): { fromToken: string; toToken: string } {
  const symbol = proposal.idea.symbol.trim().toUpperCase();
  const from =
    hints.fromToken ??
    (symbol === NATIVE || symbol === 'TONCOIN' ? NATIVE : proposal.idea.symbol);
  const to =
    hints.toToken ??
    (from === NATIVE ? 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c' : NATIVE);
  return { fromToken: from, toToken: to };
}

/**
 * Resolves human-readable amount for MCP tools (TON / jetton units as strings).
 */
export function resolveTonHumanAmount(
  proposal: TradeProposal,
  hints: TonExecutionHints,
  config: LtaConfig,
): string {
  if (hints.amount != null && String(hints.amount).length > 0) {
    return String(hints.amount);
  }
  if (config.execution.simulationMode || config.execution.mode === 'dry-run') {
    return config.execution.defaultTonHumanAmount ?? '0.01';
  }
  throw new Error(
    'TON execution requires idea.tonExecution.amount (or venueMetadata.tonExecution.amount) for live mode.',
  );
}

export function buildTonExecutionPlan(
  directive: ExecutionDirective,
  proposal: TradeProposal,
  config: LtaConfig,
): TonExecutionPlan {
  if (directive === 'exchange-webhook') {
    throw new Error('buildTonExecutionPlan does not apply to exchange-webhook.');
  }

  const hints = readHints(proposal);

  if (directive === 'ton-mcp-transfer') {
    const toAddress = hints.toAddress?.trim();
    if (!toAddress) {
      throw new Error(
        'ton-mcp-transfer requires idea.tonExecution.toAddress (or venueMetadata.tonExecution.toAddress).',
      );
    }
    const amount = resolveTonHumanAmount(proposal, hints, config);
    const comment = hints.comment;
    const jetton = hints.jettonAddress?.trim();
    if (jetton) {
      const args: Record<string, unknown> = {
        toAddress,
        jettonAddress: jetton,
        amount,
      };
      if (comment != null) {
        args.comment = comment;
      }
      return {
        directive,
        transfer: { tool: 'send_jetton', args },
      };
    }
    const args: Record<string, unknown> = { toAddress, amount };
    if (comment != null) {
      args.comment = comment;
    }
    return {
      directive,
      transfer: { tool: 'send_ton', args },
    };
  }

  const { fromToken, toToken } = defaultSwapTokens(proposal, hints);
  const amount = resolveTonHumanAmount(proposal, hints, config);
  const quoteArgs: Record<string, unknown> = {
    fromToken,
    toToken,
    amount,
  };
  if (hints.slippageBps != null) {
    quoteArgs.slippageBps = hints.slippageBps;
  }
  return {
    directive,
    swap: {
      quote: { tool: 'get_swap_quote', args: quoteArgs },
    },
  };
}

export function extractNormalizedHash(
  structured: Record<string, unknown> | undefined,
): string | undefined {
  if (!structured) {
    return undefined;
  }
  const raw = structured.normalizedHash ?? structured.normalized_hash;
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  return undefined;
}
