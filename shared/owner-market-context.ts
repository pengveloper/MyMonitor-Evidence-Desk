import type { OwnerObservation } from './owner-intelligence-contract';
import { finite, freshness, iso, record } from './owner-intelligence-core';

/** Reads the existing breadth writer's serving payload, not a new breadth engine. */
export function ownerBreadthObservations(value: unknown, now = Date.now()): OwnerObservation[] {
  const outer = record(value);
  const payload = outer._seed && outer.data ? record(outer.data) : outer;
  const current = record(payload.current);
  const history = (Array.isArray(payload.history) ? payload.history : []).map(record);
  const latestHistory = history[history.length - 1];
  const observedAt = iso(current.observationDate ?? payload.observationDate ?? latestHistory?.observationDate ?? latestHistory?.date);
  const publishedAt = iso(payload.publishedAt ?? payload.updatedAt);
  const deadline = iso(payload.freshnessGraceUntil);
  const universe = record(current.universe);
  const method = typeof current.methodologyVersion === 'string' ? current.methodologyVersion : '';
  const priorHistory = history.filter(row => String(row.observationDate ?? row.date) < String(observedAt)
    && row.methodologyVersion === current.methodologyVersion && row.universeVersion === current.universeVersion);
  const prior = priorHistory[priorHistory.length - 1];
  return [20, 50, 200].map(days => {
    const field = `pctAbove${days}d`;
    const window = record(record(current.windows)[`${days}d`]);
    const reading = finite(current[field]);
    const denominator = finite(window.denominator);
    const coverage = finite(window.coverage);
    const sampleValid = denominator !== null && denominator > 0 && Number.isInteger(denominator)
      && finite(window.numerator) !== null && Number(window.numerator) >= 0 && Number(window.numerator) <= denominator
      && coverage !== null && coverage > 0 && coverage <= 100
      && finite(universe.observedUniverse) !== null && Number(universe.observedUniverse) >= denominator;
    const invalidV3 = method === 'eodhd-pit-adjusted-close-sma-v3' && !sampleValid;
    const valid = reading !== null && reading >= 0 && reading <= 100 && !invalidV3 && observedAt !== null;
    // The writer computes this deadline from the provider's next session and EOD grace.
    // Republishing a Friday observation does not make its observation date Monday.
    const state = !valid || freshness(observedAt, now, 24 * 365) === 'UNAVAILABLE' ? 'UNAVAILABLE'
      : deadline && Date.parse(deadline) > Date.parse(observedAt) && Date.parse(deadline) - Date.parse(observedAt) <= 10 * 86_400_000
        ? now <= Date.parse(deadline) ? 'AVAILABLE' : 'STALE'
        : freshness(observedAt, now, 120);
    return {
      id: `BREADTH_${days}`, label: `${days}일 시장 확산도`, value: valid ? reading : null,
      previous: finite(prior?.[field]), previousObservedAt: iso(prior?.observationDate ?? prior?.date),
      unit: '%', observedAt, publishedAt, source: typeof current.provider === 'string' ? current.provider : '시장 확산도 저장 관측',
      url: '', state, basis: 'EOD', methodology: method,
      universe: typeof current.universeVersion === 'string' ? current.universeVersion : '',
      sampleCount: denominator, coveragePercent: coverage,
      limitation: invalidV3 ? '이동평균 표본·coverage 검증 실패'
        : `${method === 'eodhd-pit-adjusted-close-sma-v3' ? '미국 전체시장' : /sp500/i.test(`${method} ${current.universeVersion}`) ? 'S&P 500 표본' : '저장된 시장 표본(대상 범위 확인 필요)'} 종가 참여율입니다. 장중 확산도 또는 특정 업종 지수의 참여율이 아닙니다.`,
    } satisfies OwnerObservation;
  });
}
