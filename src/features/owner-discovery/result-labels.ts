import type { DiscoveryV2 } from '../../../shared/owner-discovery-v2';

type Result = DiscoveryV2['results'][number];
// Codes appended by the trend review after the readiness gate. They decide the
// candidate, never readiness (analysisEligibility comes from the scan blockers).
const REVIEW_CODES = new Set(['TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE', 'NO_VERIFIED_SUPPORTIVE_EVIDENCE', 'CURRENT_PRICE_NOT_CONFIRMING_TREND']);
const readinessBlockers = (result: Result) => result.blockers.filter(code => !REVIEW_CODES.has(code) && !code.endsWith(':HARD_ADVERSE'));
/** A stored price exists but is older than the readiness window, nothing else held the gate and the daily history is usable. */
export function heldByStalePrice(result: Result): boolean {
  const codes = readinessBlockers(result);
  return result.analysisEligibility !== 'ANALYSIS_READY' && codes.length > 0 && codes.every(code => code === 'quote:CANONICAL_QUOTE_STALE')
    && !result.blockers.includes('TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE');
}
/** Presentation only; never changes eligibility, blockers, outcome or fingerprint. */
export function candidateLabel(result: Result): string {
  if (result.marketCandidate === 'CANDIDATE_FOR_REVIEW') return '검토 후보';
  if (heldByStalePrice(result)) return '평가 보류 · 가격 관측 오래됨';
  if (result.analysisEligibility !== 'ANALYSIS_READY'
    || result.blockers.includes('TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE')
    || !result.factors.some(f => f.group === 'TECHNICAL_STATE' && f.state !== 'UNKNOWN')) return '평가 보류 · 자료 부족';
  return '평가 완료 · 조건 미충족';
}
export function candidateSummary(results: Result[]): string {
  const candidates = results.filter(r => r.marketCandidate === 'CANDIDATE_FOR_REVIEW').length;
  const deferred = results.filter(r => candidateLabel(r).startsWith('평가 보류'));
  const stale = deferred.filter(heldByStalePrice).length;
  const evaluated = results.length - deferred.length;
  const causes = [stale ? `가격 관측 오래됨 ${stale}` : '', deferred.length - stale ? `자료 부족 ${deferred.length - stale}` : ''].filter(Boolean).join(' · ');
  return `투자 검토 후보 ${candidates} · 평가 완료 ${evaluated} · 평가 보류 ${deferred.length}${causes ? ` (${causes})` : ''}`;
}

/** Readiness blocker codes as sentences. Unknown codes stay visible as they are. */
export const blockerLabel = (code: string): string => code === 'INSTRUMENT_CLASS_UNVERIFIED' ? '상품 분류를 검증할 canonical 근거가 없습니다.' : code === 'quote:CANONICAL_QUOTE_STALE' ? '가격 관측이 오래되어 현재 판단을 보류합니다.' : code === 'quote:EVIDENCE_MISSING' ? '같은 종목의 검증된 가격 근거가 없습니다.' : code.includes('IDENTITY_MISMATCH') ? '다른 종목의 근거가 섞여 있어 사용하지 않습니다.' : code;
const REVIEW_TEXT: Readonly<Record<string, string>> = { CURRENT_PRICE_NOT_CONFIRMING_TREND: '현재 가격 방향이 과거 추세를 확인해 주지 않습니다.', NO_VERIFIED_SUPPORTIVE_EVIDENCE: '검증된 상품 자체의 지지 근거가 없습니다.', TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE: '최근 조정 가격 이력이 부족하거나 오래됐습니다.', 'TECHNICAL_STATE:HARD_ADVERSE': '상품 자체의 조정 가격 하락 추세가 확인됩니다.', 'VOLATILITY:HARD_ADVERSE': '변동성 위험이 보류 기준에 해당합니다.' };
/** Readiness and review blockers as sentences. */
export const blockerText = (code: string): string => REVIEW_TEXT[code] ?? blockerLabel(code);
export const FACTOR_LABELS: Readonly<Record<string, string>> = { SEMICONDUCTOR_TREND: '반도체 추세', BREADTH: '상승·하락 확산', LEADERS: '주요 종목', BROAD_MARKET: '전체 시장', RATES: '금리', FX: '환율', VOLATILITY: '변동성', TECHNICAL_STATE: '상품 가격 추세', NEWS_EVENTS: '뉴스·이벤트' };
export const FACTOR_STATE_LABELS: Readonly<Record<string, string>> = { SUPPORTIVE: '지지', MIXED: '혼재', ADVERSE: '반대', UNKNOWN: '미확인' };
