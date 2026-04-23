# LTA Architecture

## Objective

LTA (Luminara Trading Agent) is an enterprise crypto investment control plane for governed wallet automation, strategy orchestration, and risk-aware trade proposal generation.

This repository ships the first production-grade foundation for:

- strategy catalog management
- deterministic opportunity scoring
- policy enforcement and approval gating
- TON agentic wallet onboarding/execution runbooks
- API exposure for dashboards, ops systems, and future execution workers

## System layers

### 1. Control plane API

The Fastify API exposes:

- `/health`
- `/v1/platform/profile`
- `/v1/strategies`
- `/v1/decisions/evaluate`
- `/v1/opportunities/score`
- `/v1/trades/approve`

These endpoints are designed for internal UI, workflow systems, and future execution agents.

### 2. Decision engine

The decision engine converts candidate opportunities into ranked and governed proposals.

Inputs include:

- portfolio state
- wallet state
- market regime
- opportunity set
- governance context

Outputs include:

- score
- approval status
- execution plan
- human approval requirements
- rejection or block reasons

### 2.1 Multi-agent investment workforce

LTA now includes an internal multi-agent operating model inspired by collaborative agent frameworks, but adapted for institutional crypto trading rather than copied from any one project.

The orchestration model has four layers:

- **signal agents**
  - `macro-research-lead`
  - `market-microstructure-analyst`
  - `onchain-flow-scout`
  - `event-driven-catalyst-hunter`
- **challenge and control agents**
  - `risk-sentinel`
  - `compliance-guardian`
  - `adversarial-critic`
- **capital committee agents**
  - `portfolio-allocator`
  - `treasury-quarterback`
  - `execution-chair`
- **execution and surveillance agents**
  - `wallet-operations-controller`
  - `execution-runner`
  - `post-trade-auditor`

The purpose is not to simulate random personalities. It is to create structured disagreement, specialization, and escalation paths:

- some agents generate opportunity conviction
- some agents attack the proposal
- some agents size and prioritize capital
- some agents validate wallet and execution readiness

This creates a more robust internal process than a single-model "decide and trade" loop.

### 2.2 Orchestration pattern

The agent workflow follows an institutional committee pattern:

1. **research synthesis**
   - signal agents score and annotate opportunities
2. **risk and adversarial challenge**
   - control agents identify blockers, fragility, concentration, and policy issues
3. **committee vote**
   - allocator and chair agents determine whether the idea should be advanceable
4. **execution routing**
   - wallet and execution agents produce operational next steps
5. **surveillance**
   - post-trade agents validate outcomes and raise drift alerts

The output is an auditable orchestration brief with:

- agent-by-agent recommendations
- committee consensus level
- challenge notes
- recommended execution mode
- escalation level
- final recommendation

### 3. Policy and risk engine

The risk engine enforces:

- max trade size
- max asset concentration
- allowed venues
- allowed strategies
- emergency stop
- high-stress regime filtering
- approver-presence checks

This design makes it possible to add richer controls later, such as:

- VaR budgets
- liquidity buckets
- jurisdiction rules
- counterparty scorecards
- treasury segmentation

### 4. Wallet and execution adapter layer

The current TON adapter is intentionally governance-first. It does not pretend to sign trades in this repository without secure infrastructure.

Instead, it provides:

- provider metadata
- approval payload generation
- operator wallet import and governance runbooks

This matches TON's split-key agentic wallet model:

- the human owner retains the root wallet
- the agent uses an operator key scoped to the agentic wallet
- operator access can be rotated or revoked independently

### 5. Future execution workers

A production rollout should separate proposal generation from trade execution:

- **proposal service**: computes trade proposals
- **approval service**: records human sign-off and exceptions
- **execution worker**: sends orders/swaps/transfers
- **reconciliation worker**: validates settlement and balances
- **surveillance service**: detects anomalous behavior and policy drift

The orchestration engine is intentionally separate from direct execution. This keeps:

- reasoning auditable
- approvals explicit
- wallet movement isolated from planning logic

## Security model

For production use, LTA should run with:

- HSM or cloud KMS-backed operator key storage
- isolated execution workers
- append-only audit logs
- environment-specific wallet segregation
- separate research, paper, and production policies
- human approval for wallet creation, withdrawals, and key rotation

## Mapping to provided references

Your supplied references influenced these modules directly:

- **TON agentic wallets + TON MCP**
  - wallet adapter design
  - governance runbooks
  - split-key operating model
- **algorithmic trading repositories**
  - seeded strategy catalog for arbitrage, funding carry, and ML trend strategies
- **institutional operating target**
  - emphasis on policy packs, approvals, exposure caps, and auditable execution plans

## Suggested next build phases

1. Add persistent storage for decisions, approvals, and audit trails.
2. Add venue adapters for TON DEXs and selected centralized exchanges.
3. Add market data ingestion and feature engineering pipelines.
4. Add simulation and paper-trading execution modes.
5. Add portfolio analytics, PnL attribution, and treasury reporting.
6. Add formal role-based access control and signed approval workflows.
