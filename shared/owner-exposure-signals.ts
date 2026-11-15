import type { OwnerEvent, OwnerIntelligenceEvidence, OwnerSignalStoryItem } from './owner-intelligence-contract';

/** News older than 72 hours remains evidence, but cannot lead today's catalyst list. */
export const OWNER_NEWS_CURRENT_MS = 72 * 60 * 60_000;
export function ownerNewsIsCurrent(publishedAt: string | null, observedAt: string): boolean {
  const age = Date.parse(observedAt) - Date.parse(publishedAt ?? '');
  return Number.isFinite(age) && age >= 0 && age <= OWNER_NEWS_CURRENT_MS;
}

export const COMPANY_RISK_TAG = /ATM|DILUTION|NEW_SHARE|SHELF|OFFER|FINANCING|ISSUANCE|REVERSE_SPLIT|SPLIT_ADJUSTMENT|LISTING|COMPLIANCE|DELIST|BANKRUPT/i;

/** Only the semiconductor exposure reverses. Macro observations never enter this rule. */
export function semiconductorSignals(e: Pick<OwnerIntelligenceEvidence, 'symbol' | 'profile' | 'events' | 'macro' | 'collectedAt'>): OwnerSignalStoryItem[] {
  if (!['SOXL', 'SOXS'].includes(e.symbol) || e.profile.state !== 'AVAILABLE'
    || !/NYSE Semiconductor/i.test(e.profile.underlying ?? '')
    || e.profile.leverageMultiple !== 3 || e.profile.dailyReset !== true
    || !['LONG', 'INVERSE'].includes(e.profile.leverageDirection)) return [];
  const inverse = e.profile.leverageDirection === 'INVERSE';
  const make = (positive: boolean, row: OwnerSignalStoryItem): OwnerSignalStoryItem => {
    const supportive = positive !== inverse;
    return { ...row, direction: supportive ? 'SUPPORTIVE' : 'COUNTER',
      detail: `${row.detail} · ${e.symbol} 일일 ${inverse ? '-' : '+'}300% 기초 노출에 ${supportive ? '지지' : '반대'} 방향${row.evidenceType === 'HYPOTHESIS' ? '의 가설 · 업종 보도가 ETF 기초지수의 실제 수익률을 입증하지 않음' : ''}.` };
  };
  const benchmark = e.macro.find(row => row.id === 'NYSE_SEMICONDUCTOR_INDEX' && row.state === 'AVAILABLE'
    && row.value !== null && row.previous !== null && row.value !== row.previous);
  if (benchmark) return [make(benchmark.value! > benchmark.previous!, {
    id: 'underlying-benchmark', label: '반도체 기초지수 방향', detail: `${benchmark.label} ${benchmark.previous} → ${benchmark.value} ${benchmark.unit}`,
    state: 'AVAILABLE', evidenceType: 'DIRECT', source: benchmark.source, observedAt: benchmark.observedAt,
    fetchedAt: benchmark.fetchedAt, url: benchmark.url,
  })];
  // Conservative title-only fallback. Split independent clauses; ambiguous/negated
  // demand language stays unclassified, and is never promoted to measured index data.
  return e.events.flatMap(event => {
    if (event.kind !== 'NEWS' || !ownerNewsIsCurrent(event.publishedAt, e.collectedAt)) return [];
    const clauses = event.title.split(/[,;]|\b(?:while|but|despite|although)\b/i);
    const demand = clauses.find(value => /semiconductor|chipmaker|chip demand/i.test(value) && /demand/i.test(value));
    // SOX/sector price headlines are related reports, never the fund's exact measured benchmark.
    const sector = clauses.find(value => /\b(?:SOX|semiconductor (?:stocks|index|sector)|chip stocks)\b/i.test(value)
      && !/\b(?:red|white)\s+sox\b|\bMLB\b/i.test(value));
    const clause = demand ?? sector;
    if (!clause || /\b(?:not|no|may|could|would|if|uncertain|forecast\w*|expect\w*|predict\w*|target\w*)\b/i.test(clause)) return [];
    const positive = /improv|strong|grow|rising|rise|rebound|rall|gain|surge|climb|advance/i.test(clause);
    const negative = /weaken|declin|fall|fell|slump|deteriorat|contract|drop|plung|sell.off/i.test(clause);
    if (positive === negative) return [];
    return [make(positive, { id: `underlying-${demand ? 'demand' : 'sector'}-${event.id}`, label: `반도체 ${demand ? '수요' : '업종'} ${positive ? '개선' : '악화'} 보도`,
      detail: `반도체 ${demand ? '수요' : '업종'} ${positive ? '개선' : '악화'} 보도`, state: 'AVAILABLE', evidenceType: 'HYPOTHESIS',
      source: event.sources[0]?.name, url: event.sources[0]?.url, observedAt: event.publishedAt, fetchedAt: e.collectedAt })];
  }).slice(0, 3);
}

/** CISS direct structure > liquidity > company events; macro lives outside this list. */
export function companyEvidencePriority(event: OwnerEvent): number {
  if (event.scope === 'INDIRECT') return 0;
  if (event.kind === 'SEC' || event.kind === 'CORPORATE_ACTION' || event.tags.some(tag => COMPANY_RISK_TAG.test(tag))) return 3;
  if (event.tags.some(tag => /LIQUIDITY|CASH_FLOW|CASH_RUNWAY/i.test(tag))) return 2;
  return 1;
}
