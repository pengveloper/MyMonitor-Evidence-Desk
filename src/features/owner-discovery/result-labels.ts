import type { DiscoveryV2 } from '../../../shared/owner-discovery-v2';

type Result = DiscoveryV2['results'][number];
/** Presentation only; never changes eligibility, blockers, outcome or fingerprint. */
export function candidateLabel(result: Result): string {
  if (result.marketCandidate === 'CANDIDATE_FOR_REVIEW') return '검토 후보';
  if (result.analysisEligibility !== 'ANALYSIS_READY'
    || result.blockers.includes('TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE')
    || !result.factors.some(f => f.group === 'TECHNICAL_STATE' && f.state !== 'UNKNOWN')) return '평가 보류 · 자료 부족';
  return '평가 완료 · 조건 미충족';
}
export function candidateSummary(results: Result[]): string {
  const candidates = results.filter(r => r.marketCandidate === 'CANDIDATE_FOR_REVIEW').length;
  const deferred = results.filter(r => candidateLabel(r).startsWith('평가 보류')).length;
  const evaluated = results.length - deferred;
  return `투자 검토 후보 ${candidates} · 평가 완료 ${evaluated} · 자료 부족으로 평가 보류 ${deferred}`;
}
