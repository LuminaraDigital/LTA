import type {
  AgentPerformanceSnapshot,
  CaseFile,
  PortfolioAnalyticsSnapshot,
  ProposalOutcome,
  StrategyId,
} from './types.js';
import type { StateStore } from './state-store.js';

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export interface AnalyticsService {
  getPortfolioAnalytics(): Promise<PortfolioAnalyticsSnapshot>;
  getDashboardModel(): Promise<{
    portfolio: PortfolioAnalyticsSnapshot;
    topAgents: AgentPerformanceSnapshot[];
    topCases: Array<Pick<CaseFile, 'id' | 'status' | 'strategyId' | 'symbol' | 'venue'>>;
  }>;
}

export function buildAnalyticsService(store: StateStore): AnalyticsService {
  return {
    async getPortfolioAnalytics() {
      const cases = await store.listCases();
      const outcomes = cases
        .map((caseFile) => caseFile.outcome)
        .filter((item): item is ProposalOutcome => item != null);
      const attribution = await store.listAgentAttribution();

      const navUsd = sum(
        cases.map((caseFile) => caseFile.proposal.idea.notionalUsd),
      );
      const realizedPnlUsd = sum(outcomes.map((outcome) => outcome.realizedPnlUsd));
      const unrealizedPnlUsd = sum(
        cases
          .filter((caseFile) => caseFile.outcome == null)
          .map((caseFile) => caseFile.proposal.idea.notionalUsd * 0.001),
      );

      const strategyBreakdown = new Map<
        StrategyId,
        {
          strategyId: StrategyId;
          caseCount: number;
          realizedPnlUsd: number;
          unrealizedPnlUsd: number;
        }
      >();

      for (const caseFile of cases) {
        const existing =
          strategyBreakdown.get(caseFile.strategyId) ??
          {
            strategyId: caseFile.strategyId,
            caseCount: 0,
            realizedPnlUsd: 0,
            unrealizedPnlUsd: 0,
          };
        existing.caseCount += 1;
        if (caseFile.outcome) {
          existing.realizedPnlUsd += caseFile.outcome.realizedPnlUsd;
        } else {
          existing.unrealizedPnlUsd += caseFile.proposal.idea.notionalUsd * 0.001;
        }
        strategyBreakdown.set(caseFile.strategyId, existing);
      }

      return {
        timestamp: new Date().toISOString(),
        navUsd,
        realizedPnlUsd,
        unrealizedPnlUsd,
        totalPnlUsd: realizedPnlUsd + unrealizedPnlUsd,
        openCaseCount: cases.filter((caseFile) => caseFile.outcome == null).length,
        completedCaseCount: cases.filter((caseFile) => caseFile.status === 'completed').length,
        failedCaseCount: cases.filter((caseFile) => caseFile.status === 'failed').length,
        strategyBreakdown: [...strategyBreakdown.values()].sort(
          (left, right) =>
            right.realizedPnlUsd +
            right.unrealizedPnlUsd -
            (left.realizedPnlUsd + left.unrealizedPnlUsd),
        ).map((entry) => ({
          strategyId: entry.strategyId,
          cases: entry.caseCount,
          realizedPnlUsd: entry.realizedPnlUsd,
        })),
        agentAttribution: [...attribution]
          .sort((left, right) => right.contributionScore - left.contributionScore)
          .slice(0, 12),
      };
    },
    async getDashboardModel() {
      const portfolio = await this.getPortfolioAnalytics();
      const cases = await store.listCases();
      return {
        portfolio,
        topAgents: portfolio.agentAttribution.slice(0, 8),
        topCases: cases.slice(0, 8).map((caseFile) => ({
          id: caseFile.id,
          status: caseFile.status,
          strategyId: caseFile.strategyId,
          symbol: caseFile.symbol,
          venue: caseFile.venue,
        })),
      };
    },
  };
}
