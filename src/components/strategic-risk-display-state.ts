import type { StrategicRiskOverview } from '@/services/cross-module-integration';
import type { DataFreshnessSummary } from '@/services/data-freshness';

export function hasSufficientCurrentRiskEvidence(
  overview: Pick<StrategicRiskOverview, 'degraded' | 'stale' | 'timestamp'> | null,
  freshness: Pick<DataFreshnessSummary, 'overallStatus' | 'coveragePercent' | 'activeSources' | 'totalSources'> | null,
): boolean {
  if (!overview?.timestamp || overview.degraded || overview.stale) return false;
  if (!freshness || freshness.overallStatus !== 'sufficient') return false;
  return freshness.totalSources > 0 && freshness.activeSources > 0 && freshness.coveragePercent >= 50;
}
