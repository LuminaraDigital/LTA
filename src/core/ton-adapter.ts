import type {
  AttachedTonWallet,
  TonApprovalPlan,
  TonConfig,
  TonWalletRegistration,
  TradeIntent,
} from './types.js';

class TonAgenticWalletAdapter {
  constructor(private readonly config: TonConfig) {}

  capabilities() {
    const primaryWallet = this.config.attachedWallets[0];

    return {
      provider: 'ton',
      network: this.config.network,
      mode: this.config.mcpMode,
      endpoint: this.config.mcpEndpoint,
      mcpCommand: this.config.mcpCommand,
      mcpArgs: this.config.mcpArgs,
      walletCollection: this.config.agentCollectionAddress,
      attachedWalletAddress: primaryWallet?.address ?? null,
      attachedWalletCount: this.config.attachedWallets.length,
      tonCenterConfigured: Boolean(this.config.tonCenterApiKey),
      notes: [
        'Use split-key agentic wallets for operator isolation.',
        'Keep the owner wallet outside the LTA control plane.',
        'Require explicit human approval for wallet creation, operator rotation, and withdrawals.',
      ],
    };
  }

  buildWalletRegistration(
    walletAddress: string,
    ownerAddress: string,
    operatorLabel: string,
  ): TonWalletRegistration {
    return {
      walletAddress,
      ownerAddress,
      operatorLabel,
      network: this.config.network,
      status: 'pending_import',
    };
  }

  getPrimaryWallet(): AttachedTonWallet | null {
    return this.config.attachedWallets[0] ?? null;
  }

  buildImportRunbook(wallet: TonWalletRegistration) {
    return {
      wallet,
      steps: [
        'Generate and store an operator key in an HSM or dedicated secret manager.',
        'Deploy or import the agentic wallet from the owner-controlled dashboard.',
        'Validate the wallet against the expected TON collection and network.',
        'Record wallet metadata in the LTA control plane before allowing execution.',
        'Run a limited notional test transfer before enabling production strategies.',
      ],
      productionGuardrails: [
        'Do not fund agentic wallets above approved risk limits.',
        'Rotate operator keys on schedule and after any suspected compromise.',
        'Separate research, simulation, and production wallets.',
      ],
    };
  }

  prepareApproval(trade: TradeIntent): TonApprovalPlan {
    return {
      mode: 'agentic-wallet',
      trade,
      requiredActions: [
        'Validate wallet address against the expected TON agentic collection.',
        'Confirm the operator key is active and not pending rotation.',
        'Verify post-trade cash buffers remain within treasury policy.',
        'Simulate the transfer or swap in a sandbox before mainnet execution.',
      ],
      warnings: [
        'Owner keys must remain outside the LTA control plane.',
        'Only pre-approved strategy wallets should be used for mainnet execution.',
      ],
      mcpInvocation: {
        command: this.config.mcpCommand,
        args: this.config.mcpArgs,
      },
    };
  }
}

export function buildTonAgenticWalletAdapter(config: TonConfig) {
  return new TonAgenticWalletAdapter(config);
}
