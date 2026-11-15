import type { discoveryExplanationInput } from './owner-discovery-v2';
import type { ContextItem } from './owner-universe-scan-contract';
import { contextObservationUsable } from './discovery-context-integrity';

export type ExplanationCapability = 'MARKET_CONTEXT' | 'INSTRUMENT_CONTEXT';
export type CoverageInput = ReturnType<typeof discoveryExplanationInput>;
const hasIdentity = (item: ContextItem) => Boolean(item.canonicalId)
  && /^[a-f0-9]{64}$/.test(item.fingerprint) && /^https:\/\//.test(item.source)
  && Number.isFinite(item.value) && item.value !== null;

/** Input admission only; never edits factors, eligibility, candidate outcome or freshness.
 * Sector explanation needs a usable sector observation and an independent cross-check.
 * Broad-market weakness alone cannot stand in for semiconductor direction. */
export function discoveryCoverage(input: CoverageInput, capability: ExplanationCapability = 'INSTRUMENT_CONTEXT') {
  const groups = input.marketContext.groups;
  const usable = (group: string) => groups.filter(g => g.group === group).flatMap(g => g.items)
    .filter(i => hasIdentity(i) && contextObservationUsable(i, input.cutoffAt));
  const sector = usable('SEMICONDUCTOR_DIRECT').filter(i =>
    ((i.label === 'ICESEMIT' && i.role === 'PRIMARY') || (i.label === 'SOX' && i.role === 'PROXY'))
    && i.change !== null && Number.isFinite(i.change));
  const cross = ['BROAD_MARKET', 'RATES', 'FX', 'VOLATILITY'].flatMap(usable)
    .filter(i => !sector.some(s => s.canonicalId === i.canonicalId || s.signalFamily === i.signalFamily));
  const direct = sector.some(i => i.role === 'PRIMARY');
  const priceHistoryReady = input.result.analysisEligibility === 'ANALYSIS_READY'
    && input.result.factors.some(f => f.group === 'TECHNICAL_STATE' && f.state !== 'UNKNOWN' && f.evidenceIds.length);
  const volatility = usable('VOLATILITY');
  const closedVolatility = groups.filter(g => g.group === 'VOLATILITY').flatMap(g => g.items)
    .some(i => i.reason === 'CLOSED_LAST_KNOWN_NOT_LIVE');
  const blockers: string[] = [];
  if (!/^[a-f0-9]{64}$/.test(input.fingerprint) || !/^[a-f0-9]{64}$/.test(input.marketContext.fingerprint)
    || input.cutoffAt !== input.marketContext.cutoffAt || !Number.isFinite(Date.parse(input.cutoffAt))) blockers.push('COVERAGE_SNAPSHOT_IDENTITY');
  if (!sector.length) blockers.push('COVERAGE_SECTOR_OBSERVATION_REQUIRED');
  if (!cross.length) blockers.push('COVERAGE_INDEPENDENT_CONTEXT_REQUIRED');
  if (capability === 'INSTRUMENT_CONTEXT' && !priceHistoryReady) {
    blockers.push('COVERAGE_INSTRUMENT_PRICE_HISTORY_REQUIRED');
  }
  const gaps = [
    ...(!direct ? [{ code: 'DIRECT_BENCHMARK_UNAVAILABLE', text: '직접 벤치마크 미확보 · SOX는 PROXY_ONLY이며 직접 지수 값이 아닙니다.' }] : []),
    { code: 'SAMPLE_BREADTH_ONLY', text: usable('SEMICONDUCTOR_LEADERS').length
      ? 'breadth는 표본 맥락입니다. 전체 지수 구성·비중·가중 기여도를 검증하지 않았습니다.'
      : '유효한 breadth 표본도 미연결입니다. 전체 지수 구성·비중·가중 기여도를 검증하지 않았습니다.' },
    ...(!priceHistoryReady ? [{ code: 'INSTRUMENT_PRICE_HISTORY_UNAVAILABLE', text: '상품별 가격·이력 준비 조건 미충족 · 시장 맥락만으로 상품 판단을 대신하지 않습니다.' }] : []),
    ...(!volatility.length ? [{ code: 'VOLATILITY_NOT_CURRENT', text: closedVolatility
      ? '변동성은 휴장 중 마지막 참고 관측입니다. live가 아니며 이 사유만으로 공급자 장애를 확정하지 않습니다.'
      : '사용 가능한 현재 변동성 근거가 없습니다. 오래된 값을 live로 사용하지 않습니다.' }] : []),
    { code: 'PERSONAL_CONTEXT_UNAVAILABLE', text: '개인 포지션 미연결 · 보유·수량·헤지 적합성을 판단하지 않습니다.' },
    ...['RATES', 'FX'].filter(g => !usable(g).length).map(g => ({ code: g + '_UNAVAILABLE', text: `${g}의 시점이 유효한 근거가 없습니다.` })),
    ...(!input.newsLinks.length ? [{ code: 'NEWS_UNAVAILABLE', text: '연결된 뉴스 근거가 없습니다. 사건이나 원인이 없다는 뜻은 아닙니다.' }] : []),
  ];
  return { policyVersion: 'discovery-explanation-coverage/v1', capability,
    status: blockers.length ? 'UNQUALIFIED' as const : 'QUALIFIED' as const,
    fingerprint: input.fingerprint, cutoffAt: input.cutoffAt, blockers, gaps,
    evidenceIds: [...new Set([...sector, ...cross].map(i => i.canonicalId))],
    directBenchmark: direct ? 'AVAILABLE' : 'DIRECT_BENCHMARK_UNAVAILABLE',
    sectorBasis: direct ? 'DIRECT' : sector.length ? 'PROXY_ONLY' : 'UNAVAILABLE',
    // These are claim permissions, not a candidate-screening policy.
    claims: { directBenchmark: direct, fullWeightedBreadth: false, personalAction: false },
  };
}
