# LTA reference map

This document maps the initial LTA foundation to the source material provided for the project.

## TON wallet and agentic execution

- `https://docs.ton.org/ecosystem/ai/wallets`
  - informs the split-key wallet stance
  - drives owner/operator separation guidance
  - supports wallet registration and import runbooks

- `https://docs.ton.org/ecosystem/ai/mcp`
  - informs the `@ton/mcp` integration approach
  - shapes the MCP command and transport configuration in `src/core/config.ts`
  - shapes execution guidance in `src/core/ton-adapter.ts`

- `https://github.com/the-ton-tech/agentic-wallet-contract.git`
  - treated as the underlying contract reference for future wallet validation and import tooling

- `https://github.com/spendollars/TonAgentPlatform.git`
  - treated as a platform-design reference for future TON-native agent workflows

## Trading and strategy references

- `https://github.com/merovinh/best-of-algorithmic-trading.git`
- `https://github.com/fendouai/ArbitrageBot.git`
- `https://github.com/ccyanxyz/uniswap-arbitrage-analysis.git`
- `https://github.com/aoki-h-jp/funding-rate-arbitrage.git`
- `https://github.com/666ghj/BettaFish.git`
- `https://github.com/freqtrade/freqtrade.git`
- `https://medium.com/coding-nexus/top-14-algorithmic-trading-strategies-and-how-they-actually-work-1cdd084692ec`
- `https://github.com/krew-solutions/trading-ml.git`

These references inform:

- the seeded strategy catalog
- the policy-first execution model
- future backtesting, simulation, and execution-connector work

## Current implementation status

The current repository includes:

- a governed decision engine
- a risk and approval engine
- TON secret loading from a private local path
- TON wallet attachment metadata
- API endpoints for control-plane evaluation and approval preparation

The repository does not yet include:

- live venue connectors
- direct `@ton/mcp` transaction execution
- persistent database storage
- market data ingestion pipelines
- portfolio accounting and reconciliation
