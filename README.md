# LTA - Luminara Trading Agent

Enterprise-grade control plane for a governed, agentic crypto wallet and trading platform.

LTA is designed as the execution and governance layer for Luminara Digital's investment arm:

- **Agentic wallet aware** with TON split-key wallet workflows
- **Policy-first** with exposure, venue, and approval controls
- **Strategy extensible** across arbitrage, carry, treasury, and directional systems
- **Enterprise operable** with typed APIs, tests, CI, Docker, and documented runbooks

This repository intentionally ships a production-minded **foundation**, not a fake promise of an overnight "BlackRock-scale" system. The platform here gives your team a serious starting point for building one.

## What is included

- Fastify API control plane
- LTA domain model for opportunities, trade proposals, policies, and wallet execution
- Decision engine with deterministic scoring and gating
- Risk engine with hard blocks and human-approval triggers
- Persistent case files, agent memory journals, delegated task graphs, approval records, and execution jobs
- Human approval console for committee review workflows
- Delegation engine that routes proposal work from the CIO to specialist agents automatically
- Agent attribution tracking to measure who improved or weakened outcomes
- TON agentic wallet adapter contract for future `@ton/mcp` execution wiring
- Docker image, CI workflow, environment template, and Vitest coverage
- Architecture documentation and source-reference mapping

## Architecture

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/reference-map.md`](docs/reference-map.md)

## Quick start

### 1. Install dependencies

```bash
corepack enable
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

For secrets, use a **local-only JSON file outside git**. LTA will read:

```bash
~/.lta/secrets/ton.json
```

Example:

```json
{
  "tonCenterApiKey": "local-only-secret",
  "attachedWalletAddress": "UQ..."
}
```

Recommended permissions:

```bash
mkdir -p ~/.lta/secrets
chmod 700 ~/.lta ~/.lta/secrets
chmod 600 ~/.lta/secrets/ton.json
```

### 3. Run locally

```bash
pnpm dev
```

The API starts on `http://localhost:3000` by default.

## API overview

### `GET /health`

Service health and environment metadata.

### `GET /v1/platform/profile`

Returns LTA organization, active policy, strategy catalog size, and TON adapter capabilities.

Secret values such as TON Center API keys are never returned.

### `GET /v1/strategies`

Lists the built-in strategy catalog.

### `POST /v1/decisions/evaluate`

Evaluates current opportunities against policy and returns ranked trade proposals and blocked candidates.

### `POST /v1/agents/orchestrate`

Runs LTA's multi-agent committee workflow. Specialist agents generate theses, challenge assumptions, impose risk constraints, and form a coordinated execution recommendation.

This also persists:

- a case file
- agent memory and journal entries
- delegated specialist tasks
- committee review records

### `GET /v1/cases`

Lists persisted case files for review and execution follow-up.

### `GET /v1/cases/:caseId`

Returns a single persisted case file with orchestration, task graph, approvals, jobs, and outcome history.

### `POST /v1/cases/:caseId/approvals`

Records committee approval, rejection, or override for a specific proposal review inside a case.

### `POST /v1/cases/:caseId/outcomes`

Records realized outcome data and updates per-agent attribution.

### `GET /v1/agents/memory`

Returns agent journal history and prior case-memory records.

### `GET /v1/agents/attribution`

Returns performance attribution snapshots for each agent.

### `GET /v1/console`

Serves an internal browser-based committee approval console.

### `POST /v1/execution/jobs`

Creates and dispatches execution jobs for approved proposals. Current connectors include:

- `ton-mcp-transfer`
- `ton-mcp-swap`
- `exchange-webhook`

### `GET /v1/execution/jobs`

Lists execution jobs and their live/simulated dispatch status.

### `POST /v1/trades/approve`

Builds an approval package and execution steps for a proposed trade.

## Example decision request

```json
{
  "portfolio": {
    "totalEquityUsd": 1500000,
    "liquidUsd": 600000,
    "positions": [
      { "symbol": "BTC", "venue": "binance", "notionalUsd": 250000, "side": "long" }
    ]
  },
  "walletState": {
    "network": "mainnet",
    "walletType": "ton-agentic",
    "availableCashUsd": 450000,
    "tonAgenticWalletAddress": "EQExampleWallet"
  },
  "marketState": {
    "regime": "mixed",
    "realizedVolatility30d": 0.48,
    "marketStressScore": 0.32,
    "fundingDispersionScore": 0.71
  },
  "governance": {
    "emergencyStop": false,
    "approverPresent": true,
    "approvedStrategies": [
      "cross-exchange-arbitrage",
      "funding-rate-carry",
      "ton-agentic-basis"
    ]
  },
  "opportunities": [
    {
      "id": "opp-1",
      "strategyId": "funding-rate-carry",
      "symbol": "BTC",
      "venue": "binance",
      "direction": "market-neutral",
      "expectedEdgeBps": 46,
      "confidence": 0.83,
      "estimatedHoldingPeriodHours": 36,
      "notionalUsd": 120000,
      "liquidityScore": 0.9,
      "executionComplexity": 0.28,
      "reasoning": [
        "Funding rich versus spot hedge",
        "Liquidity deep enough for target size"
      ]
    }
  ]
}
```

## Production notes

This repository now includes a lightweight internal workflow OS, but a full institutional deployment still requires:

- real venue connectors
- secure secret management / HSM integration
- market data ingestion and feature pipelines
- execution monitoring and reconciliation
- compliance, audit, and operational alerting
- pre-production certification for every strategy and wallet path
- hardened persistence backends (e.g. Postgres/Object storage instead of file-backed local state)

## TON agentic wallet stance

LTA follows TON's split-key model:

- the **owner wallet remains outside agent control**
- the **operator key is restricted to the funded agentic wallet**
- all wallet creation, rotation, and withdrawal paths should remain human-governed

## Testing

```bash
pnpm test
pnpm typecheck
pnpm build
```
