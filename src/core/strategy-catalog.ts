import type { StrategyDefinition } from './types.js';

export function defaultStrategies(): StrategyDefinition[] {
  return [
    {
      id: 'ton-agentic-basis',
      name: 'TON Agentic Basis',
      category: 'treasury',
      description:
        'Deploy treasury capital into TON ecosystem opportunities through governed agentic wallets.',
      timeHorizon: 'swing',
      expectedEdges: ['ecosystem_flow', 'execution_automation'],
      supportedNetworks: ['TON'],
      requiredSignals: ['wallet_balance', 'ton_liquidity', 'governance_policy'],
      referenceSources: [
        'https://docs.ton.org/ecosystem/ai/wallets',
        'https://docs.ton.org/ecosystem/ai/mcp',
        'https://github.com/the-ton-tech/agentic-wallet-contract.git',
        'https://github.com/spendollars/TonAgentPlatform.git',
      ],
    },
    {
      id: 'cross-exchange-arbitrage',
      name: 'Cross-Exchange Arbitrage',
      category: 'arbitrage',
      description:
        'Exploit temporary price dislocations across centralized and decentralized venues with strict execution controls.',
      timeHorizon: 'intraday',
      expectedEdges: ['spread_capture', 'latency_aware_execution'],
      supportedNetworks: ['TON', 'Ethereum', 'Base', 'Arbitrum', 'Solana'],
      requiredSignals: ['orderbooks', 'fees', 'withdrawal_status', 'inventory'],
      referenceSources: [
        'https://github.com/fendouai/ArbitrageBot.git',
        'https://github.com/ccyanxyz/uniswap-arbitrage-analysis.git',
      ],
    },
    {
      id: 'funding-rate-carry',
      name: 'Funding Rate Carry',
      category: 'carry',
      description:
        'Harvest positive funding and basis spreads with delta-aware hedging and venue concentration limits.',
      timeHorizon: 'swing',
      expectedEdges: ['funding_spread', 'cash_and_carry'],
      supportedNetworks: ['Ethereum', 'Base', 'Arbitrum', 'Solana'],
      requiredSignals: ['funding_rates', 'basis_curve', 'hedge_inventory'],
      referenceSources: [
        'https://github.com/aoki-h-jp/funding-rate-arbitrage.git',
        'https://github.com/666ghj/BettaFish.git',
      ],
    },
    {
      id: 'trend-following-ml',
      name: 'Trend Following ML',
      category: 'directional',
      description:
        'Use multi-factor and machine-learning signals to express directional positions while respecting hard risk budgets.',
      timeHorizon: 'swing',
      expectedEdges: ['momentum', 'regime_filter', 'ml_signal'],
      supportedNetworks: ['TON', 'Ethereum', 'Base', 'Arbitrum', 'Solana'],
      requiredSignals: ['price_series', 'volatility', 'factor_scores', 'model_confidence'],
      referenceSources: [
        'https://github.com/merovinh/best-of-algorithmic-trading.git',
        'https://github.com/krew-solutions/trading-ml.git',
        'https://medium.com/coding-nexus/top-14-algorithmic-trading-strategies-and-how-they-actually-work-1cdd084692ec',
      ],
    },
  ];
}

export function getStrategyById(strategyId: string): StrategyDefinition | undefined {
  return defaultStrategies().find((strategy) => strategy.id === strategyId);
}
