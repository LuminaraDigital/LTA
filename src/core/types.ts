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

export type AgentJournalCategory =
  | 'case'
  | 'delegation'
  | 'approval'
  | 'execution'
  | 'outcome'
  | 'lesson';

export interface AgentJournalEntry {
  id: string;
  timestamp: string;
  agentId: string;
  role: AgentRole;
  category: AgentJournalCategory;
  summary: string;
  linkedCaseFileId?: string;
  linkedProposalId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentMemoryFile {
  agentId: string;
  role: AgentRole;
  updatedAt: string;
  journal: AgentJournalEntry[];
}

export type DelegationTaskKind =
  | 'signal-analysis'
  | 'market-structure-check'
  | 'onchain-check'
  | 'risk-review'
  | 'compliance-review'
  | 'allocation-review'
  | 'treasury-review'
  | 'execution-plan'
  | 'post-trade-review';

export type DelegationTaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type DelegationTaskStatus =
  | 'pending'
  | 'ready'
  | 'in-progress'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface DelegationTask {
  id: string;
  caseFileId: string;
  proposalId: string;
  createdAt: string;
  assignedByAgentId: string;
  assignedToAgentId: string;
  assignedToRole: AgentRole;
  kind: DelegationTaskKind;
  title: string;
  description: string;
  priority: DelegationTaskPriority;
  status: DelegationTaskStatus;
  dependsOnTaskIds: string[];
  metadata?: Record<string, unknown>;
}

export interface DelegationGraph {
  caseFileId: string;
  proposalId: string;
  createdAt: string;
  rootAgentId: string;
  tasks: DelegationTask[];
}

export type ApprovalDecision = 'approve' | 'reject' | 'override';

export interface ApprovalRecord {
  id: string;
  caseFileId: string;
  timestamp: string;
  actor: string;
  decision: ApprovalDecision;
  comment: string;
}

export type ProposalOutcomeResult = 'win' | 'loss' | 'flat';

export interface ProposalOutcome {
  caseFileId: string;
  recordedAt: string;
  result: ProposalOutcomeResult;
  realizedPnlUsd: number;
  realizedPnlBps: number;
  notes?: string;
}

export interface CaseEvent {
  timestamp: string;
  actor: string;
  type:
    | 'created'
    | 'delegated'
    | 'approval'
    | 'execution'
    | 'outcome'
    | 'note';
  summary: string;
  metadata?: Record<string, unknown>;
}

export type CaseFileStatus =
  | 'pending-approval'
  | 'approved'
  | 'rejected'
  | 'overridden'
  | 'executing'
  | 'completed'
  | 'failed';

export interface CaseFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: CaseFileStatus;
  proposalId: string;
  strategyId: StrategyId;
  symbol: string;
  venue: string;
  proposal: TradeProposal;
  committeeReview: ProposalCommitteeReview;
  delegation: DelegationGraph;
  approvals: ApprovalRecord[];
  executionJobIds: string[];
  events: CaseEvent[];
  outcome?: ProposalOutcome;
}

export type ExecutionMode = 'dry-run' | 'live';

export type ExecutionDirective =
  | 'ton-mcp-transfer'
  | 'ton-mcp-swap'
  | 'exchange-webhook';

export type ExecutionJobTarget = 'ton-mcp' | 'venue-webhook';

export type ExecutionJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface ExecutionJobResult {
  timestamp: string;
  summary: string;
  referenceId?: string;
  rawOutput?: string;
}

export interface ExecutionJob {
  id: string;
  caseFileId: string;
  proposalId: string;
  target: ExecutionJobTarget;
  mode: ExecutionMode;
  venue: string;
  createdAt: string;
  updatedAt: string;
  status: ExecutionJobStatus;
  requestPayload: Record<string, unknown>;
  result?: ExecutionJobResult;
}

export interface AgentPerformanceSnapshot {
  agentId: string;
  role: AgentRole;
  casesReviewed: number;
  supportWins: number;
  supportLosses: number;
  opposeWins: number;
  opposeLosses: number;
  escalateCount: number;
  abstainCount: number;
  contributionScore: number;
  updatedAt: string;
}

export interface ExecutionWebhookMap {
  default?: string;
  binance?: string;
  bybit?: string;
  hyperliquid?: string;
  tonDex?: string;
  stonfi?: string;
}

export interface ExecutionConfig {
  stateDirectory: string;
  mode: ExecutionMode;
  tonExecutionTimeoutMs: number;
  venueWebhooks: ExecutionWebhookMap;
  exchangeWebhookBaseUrl?: string;
  simulationMode?: boolean;
}

export interface PortfolioAnalyticsSnapshot {
  timestamp: string;
  navUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  openCaseCount: number;
  completedCaseCount: number;
  failedCaseCount: number;
  strategyBreakdown: Array<{
    strategyId: StrategyId;
    cases: number;
    realizedPnlUsd: number;
  }>;
  agentAttribution: AgentPerformanceSnapshot[];
}

export interface PersistenceConfig {
  dataDirectory: string;
  autoCreate: boolean;
  databaseUrl?: string;
}

export interface StoredState {
  caseFiles: CaseFile[];
  agentJournal: AgentJournalEntry[];
  delegationTasks: DelegationTask[];
  approvals: ApprovalRecord[];
  executionJobs: ExecutionJob[];
  outcomes: ProposalOutcome[];
  attribution: AgentPerformanceSnapshot[];
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
  database: DatabaseConfig;
  persistence: PersistenceConfig;
  execution: ExecutionConfig;
  ton: TonConfig;
}

export interface DatabaseConfig {
  connectionString: string;
  maxConnections: number;
  ssl: boolean;
}

export interface WorkerRunSummary {
  polledAt: string;
  jobsSeen: number;
  jobsDispatched: number;
  jobsSucceeded: number;
  jobsFailed: number;
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
