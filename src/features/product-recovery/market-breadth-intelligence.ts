import { isBreadthObservationDelayed } from '@/components/market-breadth-state';
import type { SituationEvidence } from './situation-synthesis-model.ts';
import type { MarketBreadthObservation, MarketBreadthWindow } from './market-regime.ts';

interface RawWindow {
  numerator?: unknown;
  denominator?: unknown;
  coverage?: unknown;
}

interface RawBreadthPoint {
  date?: unknown;
  observationDate?: unknown;
  provider?: unknown;
  methodologyVersion?: unknown;
  universeVersion?: unknown;
  pctAbove20d?: unknown;
  pctAbove50d?: unknown;
  pctAbove200d?: unknown;
  windows?: Record<string, RawWindow>;
  universe?: {
    observedUniverse?: unknown;
  };
}

interface RawBreadthPayload {
  current?: RawBreadthPoint;
  currentPctAbove20d?: unknown;
  currentPctAbove50d?: unknown;
  currentPctAbove200d?: unknown;
  observationDate?: unknown;
  latestExpectedObservationDate?: unknown;
  freshnessGraceUntil?: unknown;
  history?: RawBreadthPoint[];
}

function percentage(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function isoDate(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function windowObservation(
  point: RawBreadthPoint,
  key: '20d' | '50d' | '200d',
  reading: number,
): MarketBreadthWindow {
  const raw = point.windows?.[key];
  const coverage = percentage(raw?.coverage);
  const numerator = nonNegativeInteger(raw?.numerator);
  const denominator = nonNegativeInteger(raw?.denominator);
  return {
    percentage: reading,
    ...(coverage !== undefined ? { coverage } : {}),
    ...(numerator !== undefined ? { numerator } : {}),
    ...(denominator !== undefined ? { denominator } : {}),
  };
}

export function parseMarketBreadthObservation(value: unknown): MarketBreadthObservation | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as RawBreadthPayload;
  const latest = Array.isArray(payload.history) && payload.history.length > 0
    ? payload.history[payload.history.length - 1]
    : undefined;
  const point = latest ?? payload.current;
  if (!point) return null;
  const observationDate = isoDate(point.observationDate) ?? isoDate(point.date) ?? isoDate(payload.observationDate);
  const current = payload.current;
  const reading20 = percentage(point.pctAbove20d)
    ?? percentage(current?.pctAbove20d) ?? percentage(payload.currentPctAbove20d);
  const reading50 = percentage(point.pctAbove50d)
    ?? percentage(current?.pctAbove50d) ?? percentage(payload.currentPctAbove50d);
  const reading200 = percentage(point.pctAbove200d)
    ?? percentage(current?.pctAbove200d) ?? percentage(payload.currentPctAbove200d);
  if (!observationDate || reading20 === undefined || reading50 === undefined || reading200 === undefined) return null;
  const provider = typeof point.provider === 'string' && point.provider.trim()
    ? point.provider.trim()
    : typeof current?.provider === 'string' && current.provider.trim() ? current.provider.trim() : '시장 breadth';
  const methodologyVersion = typeof point.methodologyVersion === 'string' ? point.methodologyVersion : undefined;
  const universeVersion = typeof point.universeVersion === 'string' ? point.universeVersion : undefined;
  const commonStocks = nonNegativeInteger(point.universe?.observedUniverse)
    ?? nonNegativeInteger(current?.universe?.observedUniverse);
  return {
    observationDate,
    provider,
    ...(methodologyVersion ? { methodologyVersion } : {}),
    ...(universeVersion ? { universeVersion } : {}),
    ...(commonStocks !== undefined ? { commonStocks } : {}),
    windows: {
      '20d': windowObservation(point, '20d', reading20),
      '50d': windowObservation(point, '50d', reading50),
      '200d': windowObservation(point, '200d', reading200),
    },
  };
}

function breadthIsDelayed(value: RawBreadthPayload, observationDate: string, now: number): boolean {
  const expected = isoDate(value.latestExpectedObservationDate);
  const graceUntil = typeof value.freshnessGraceUntil === 'string'
    ? Date.parse(value.freshnessGraceUntil)
    : Number.NaN;
  if (expected) {
    if (observationDate >= expected) return false;
    return !Number.isFinite(graceUntil) || now > graceUntil;
  }
  if (Number.isFinite(graceUntil)) return now > graceUntil;
  return isBreadthObservationDelayed(observationDate, now);
}

function formatPercentage(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

/** Convert the canonical/derived seed payload into bounded decision evidence.
 * Raw provider rows never cross this browser-facing boundary. */
export function marketBreadthSituationEvidence(value: unknown, now = Date.now()): SituationEvidence {
  const observation = parseMarketBreadthObservation(value);
  if (!observation) {
    return {
      id: 'data-quality:market-breadth',
      category: 'DATA_QUALITY',
      title: '시장 breadth 사용 불가',
      summary: '현재 신뢰 가능한 시장 breadth 데이터가 없습니다.',
      relevanceReason: '시장 내부 체력을 확인할 최신 관측이 없어 판단 근거에서 제외합니다.',
      observedAt: null,
      source: null,
      freshness: 'UNKNOWN',
      evidenceRefs: ['market-breadth'],
      deepLink: '#market-breadth-panel',
      availability: 'UNAVAILABLE',
      internalReason: 'market-breadth 파생 관측을 찾지 못했습니다.',
      nextCheck: {
        label: '시장 breadth 데이터 복구 후 다시 확인',
        reason: '최신 관측이 없으므로 현재 시장 판단에 사용하지 않습니다.',
        deepLink: '#market-breadth-panel',
      },
    };
  }

  const payload = value as RawBreadthPayload;
  const delayed = breadthIsDelayed(payload, observation.observationDate, now);
  const short = observation.windows['20d'].percentage;
  const medium = observation.windows['50d'].percentage;
  const long = observation.windows['200d'].percentage;
  const commonStocks = observation.commonStocks ? ` · 보통주 ${observation.commonStocks.toLocaleString('ko-KR')}개` : '';
  return {
    id: `market-breadth:${observation.observationDate}`,
    category: 'MARKET',
    context: { marketBreadth: observation, confirmed: true },
    title: delayed ? '시장 breadth 업데이트 지연' : '미국 주식시장 breadth',
    summary: `20일 ${formatPercentage(short)} · 50일 ${formatPercentage(medium)} · 200일 ${formatPercentage(long)}${commonStocks}`,
    relevanceReason: 'NYSE·NASDAQ·AMEX 보통주의 상승 참여 폭을 가격·변동성과 교차 확인하는 시장 내부 체력 지표입니다.',
    observedAt: observation.observationDate,
    source: { id: observation.provider, label: observation.provider, mode: delayed ? 'STALE' : 'LIVE' },
    freshness: delayed ? 'STALE' : 'FRESH',
    evidenceRefs: ['market-breadth', `market-breadth:${observation.observationDate}`],
    deepLink: '#market-breadth-panel',
    availability: delayed ? 'DELAYED' : 'AVAILABLE',
    signals: short >= 60 && medium >= 55 && long >= 50 ? ['BREADTH_STRONG'] : short < 40 && medium < 45 ? ['BREADTH_WEAK'] : [],
    uncertainty: delayed
      ? `관측 세션 ${observation.observationDate}이 최신 기대 세션보다 뒤처져 현재 시장 폭과 다를 수 있습니다.`
      : 'breadth는 시장 참여 폭을 보여주지만 지수 방향이나 향후 수익률을 단독으로 확정하지 않습니다.',
    nextCheck: {
      label: 'S&P 500·VIX·업종 확산과 함께 확인',
      reason: '단일 breadth 수치가 아니라 가격·변동성·업종 방향의 동행 여부로 시장 국면을 검증합니다.',
      deepLink: '#market-breadth-panel',
    },
  };
}
