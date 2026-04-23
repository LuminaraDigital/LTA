export type StrategyId =
  | 'ton-agentic-basis'
  | 'cross-exchange-arbitrage'
  | 'funding-rate-carry'
  | 'trend-following-ml';

export type StrategyCategory =
  | 'treasury'
  | 'arbitrage'
  | 'carry'
  | 'directional';

export type StrategyHorizon = 'intraday' | 'swing' | 'position';

export type WalletType = 'ton-agentic' | 'custodial' | 'hybrid';

export type NetworkName = 'TON' | 'Ethereum' | 'Base' | 'Arbitrum' | 'Solana';

export type TradeDirection = 'buy' | 'sell' | 'hedge';

export type OpportunityDirection = 'long' | 'short' | 'market-neutral';

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  category: StrategyCategory;
  description: string;
  timeHorizon: StrategyHorizon;
  expectedEdges: string[];
  supportedNetworks: NetworkName[];
  requiredSignals: string[];
  referenceSources: string[];
}

export interface PolicyPack {
  policyVersion: string;
  maxSingleTradeUsd: number;
  maxNetExposureUsd: number;
  maxPortfolioVaRUsd: number;
  maxDrawdownPct: number;
  manualApprovalThresholdUsd: number;
  allowedVenues: string[];
  allowedStrategies: StrategyId[];
  restrictedAssets: string[];
  allowShorting: boolean;
}

export interface PortfolioPosition {
  symbol: string;
  venue: string;
  notionalUsd: number;
  side: 'long' | 'short' | 'flat';
}

export interface PortfolioSnapshot {
  totalEquityUsd: number;
  liquidUsd: number;
  drawdownPct: number;
  positions: PortfolioPosition[];
}

export interface Opportunity {
  id: string;
  strategyId: StrategyId;
  symbol: string;
  venue: string;
  direction: OpportunityDirection;
  expectedEdgeBps: number;
  confidence: number;
  estimatedHoldingPeriodHours: number;
  notionalUsd: number;
  liquidityScore: number;
  executionComplexity: number;
  catalyst?: string;
  reasoning: string[];
  venueMetadata?: Record<string, unknown>;
}

export interface MarketState {
  regime: 'risk-on' | 'risk-off' | 'mixed';
  realizedVolatility30d: number;
  marketStressScore: number;
  fundingDispersionScore: number;
}

export interface WalletState {
  network: string;
  walletType: WalletType;
  availableCashUsd: number;
  tonAgenticWalletAddress?: string;
}

export interface GovernanceContext {
  emergencyStop?: boolean;
  approverPresent?: boolean;
  approvedStrategies?: StrategyId[];
}

export interface DecisionContext {
  portfolio: PortfolioSnapshot;
  opportunities: Opportunity[];
  marketState: MarketState;
  walletState: WalletState;
  governance?: GovernanceContext;
}

export interface TradeIntent {
  symbol: string;
  venue: string;
  direction: TradeDirection;
  notionalUsd: number;
  strategyId: StrategyId;
}

export interface TradeIdea extends TradeIntent {
  expectedEdgeBps: number;
  confidence: number;
  liquidityScore: number;
  executionComplexity: number;
  estimatedVaRUsd: number;
}

export interface GatingReason {
  code:
    | 'POLICY_BLOCK'
    | 'POSITION_LIMIT'
    | 'VAR_LIMIT'
    | 'DRAWDOWN_GUARD'
    | 'CONCENTRATION_LIMIT'
    | 'MANUAL_APPROVAL'
    | 'EMERGENCY_STOP'
    | 'STRATEGY_NOT_APPROVED'
    | 'SHORTING_DISABLED';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface TradePolicyDecision {
  approved: boolean;
  requiresHumanApproval: boolean;
  reasons: GatingReason[];
}

export interface ExecutionStep {
  step:
    | 'risk-check'
    | 'wallet-balance'
    | 'quote'
    | 'execution'
    | 'post-trade-reconciliation';
  description: string;
}

export interface TradeProposal {
  proposalId: string;
  strategy: StrategyDefinition;
  idea: TradeIdea;
  score: number;
  risk: TradePolicyDecision;
  executionPlan: ExecutionStep[];
}

export interface DecisionResponse {
  organization: string;
  policyVersion: string;
  generatedAt: string;
  summary: {
    evaluatedCount: number;
    approvedCount: number;
    blockedCount: number;
    humanReviewCount: number;
  };
  proposals: TradeProposal[];
}

export type AgentCell =
  | 'signal-intelligence'
  | 'challenge'
  | 'allocation'
  | 'execution-control';

export type AgentRole =
  | 'chief-investment-officer'
  | 'signal-researcher'
  | 'market-structure-analyst'
  | 'onchain-intelligence-analyst'
  | 'risk-arbiter'
  | 'portfolio-constructor'
  | 'treasury-steward'
  | 'execution-strategist'
  | 'compliance-sentinel';

export type AgentStance = 'support' | 'oppose' | 'escalate' | 'abstain';

export type CommitteeVerdict = 'approve' | 'approve-with-review' | 'reject';

export interface WorkforceAgentDefinition {
  id: string;
  name: string;
  role: AgentRole;
  cell: AgentCell;
  mandate: string;
  primaryMetrics: string[];
  handoffTargets: string[];
}

export interface WorkforceCellDefinition {
  id: AgentCell;
  mission: string;
  agentIds: string[];
}

export interface WorkforceTopology {
  version: string;
  operatingPrinciples: string[];
  coordinationLoops: string[];
  cells: WorkforceCellDefinition[];
  agents: WorkforceAgentDefinition[];
}

export interface AgentFinding {
  agentId: string;
  role: AgentRole;
  stance: AgentStance;
  confidence: number;
  summary: string;
  concerns: string[];
  requestedActions: string[];
}

export interface ProposalCommitteeReview {
  proposalId: string;
  verdict: CommitteeVerdict;
  consensusScore: number;
  supportCount: number;
  opposeCount: number;
  escalateCount: number;
  finalRationale: string;
  findings: AgentFinding[];
  nextActions: string[];
}

export interface OrchestrationReport {
  generatedAt: string;
  topology: WorkforceTopology;
  proposalReviews: ProposalCommitteeReview[];
  summary: {
    approvedCount: number;
    reviewCount: number;
    rejectedCount: number;
  };
}

export interface OrchestrationResponse {
  decisionBook: DecisionResponse;
  orchestration: OrchestrationReport;
}

export interface TonConfig {
  network: 'mainnet' | 'testnet';
  mcpCommand: string;
  mcpArgs: string[];
  mcpMode: 'stdio' | 'http';
  mcpEndpoint?: string;
  tonCenterApiKey?: string;
  localSecretFilePath: string;
  agentCollectionAddress: string;
  attachedWallets: AttachedTonWallet[];
}

export interface LtaConfig {
  environment: string;
  port: number;
  host: string;
  organizationName: string;
  deploymentStage: string;
  policyVersion: string;
  requestIdSeed: string;
  policy: PolicyPack;
  ton: TonConfig;
}

export interface TonWalletRegistration {
  walletAddress: string;
  ownerAddress: string;
  operatorLabel: string;
  network: 'mainnet' | 'testnet';
  status: 'pending_import' | 'active' | 'revoked';
}

export interface AttachedTonWallet {
  address: string;
  operatorLabel: string;
  network: 'mainnet' | 'testnet';
}

export interface SecretBackedAttachedTonWallet {
  address: string;
  label?: string;
  operatorLabel?: string;
  network?: 'mainnet' | 'testnet';
}

export interface TonSecretsFile {
  tonCenterApiKey?: string;
  attachedWallets?: SecretBackedAttachedTonWallet[];
}

export interface TonApprovalPlan {
  mode: 'simulation' | 'agentic-wallet';
  trade: TradeIntent;
  requiredActions: string[];
  warnings: string[];
  mcpInvocation: {
    command: string;
    args: string[];
  };
}
