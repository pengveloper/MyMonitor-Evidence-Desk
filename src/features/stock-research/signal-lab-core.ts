import type { OHLCVBar } from '../../../shared/market-data/contracts.ts';
import {
  FORECAST_DECISIONS,
  OUTCOME_BARRIERS,
  OUTCOME_HORIZONS,
  OUTCOME_TRADING_DAY_HORIZONS,
  type ContextSnapshot,
  type CorporateActionContextItem,
  type EpisodeCoverage,
  type FilingContextItem,
  type ForecastRecord,
  type KnowledgeTime,
  type OutcomeBarrierPercent,
  type OutcomeLabel,
  type ShortContextItem,
  type SocialClaim,
  type TechnicalContext,
  type WorldContextItem,
} from './signal-lab-contract';

function epoch(value: string, label: string): number {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/.exec(value);
  if (!match) throw new Error(`${label} must be an exact UTC ISO timestamp`);
  const parsed = Date.parse(value);
  const canonical = `${match[1]}.${match[2] ?? '000'}Z`;
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== canonical) {
    throw new Error(`${label} must be a valid exact UTC ISO timestamp`);
  }
  return parsed;
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJsonValue(entry)]));
  }
  return value;
}

function canonicalBarValue(bar: OHLCVBar): string {
  return JSON.stringify(stableJsonValue(bar));
}

function uniqueBars(bars: readonly OHLCVBar[], expectedInterval?: OHLCVBar['interval']): OHLCVBar[] {
  const byKey = new Map<string, OHLCVBar>();
  for (const bar of bars) {
    if (expectedInterval && bar.interval !== expectedInterval) {
      throw new Error(`Signal Lab replay requires canonical ${expectedInterval} bars`);
    }
    const startMs = epoch(bar.startTime, 'bar.startTime');
    const endMs = epoch(bar.endTime, 'bar.endTime');
    epoch(bar.asKnownAt, 'bar.asKnownAt');
    if (startMs >= endMs) throw new Error('bar interval must have positive duration');
    const key = `${bar.instrumentId ?? bar.symbol}|${bar.interval}|${bar.session}|${bar.startTime}`;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, bar);
    else if (canonicalBarValue(existing) !== canonicalBarValue(bar)) {
      throw new Error(`conflicting duplicate bar at ${bar.startTime}`);
    }
  }
  return [...byKey.values()].sort((left, right) => (
    epoch(left.startTime, 'bar.startTime') - epoch(right.startTime, 'bar.startTime')
  ));
}

/**
 * Return canonical 1m observations that were both finished and knowable at the
 * replay cursor. Exact duplicates collapse; conflicting duplicates fail closed.
 */
export function barsKnownAt(bars: readonly OHLCVBar[], cursorAt: string): OHLCVBar[] {
  return barsKnownAtInterval(bars, cursorAt, '1m');
}

/**
 * Resolution-aware replay selector. It never converts a coarse source into a
 * finer bar and applies the same exact-duplicate/conflict policy as 1m replay.
 */
export function barsKnownAtInterval(
  bars: readonly OHLCVBar[],
  cursorAt: string,
  interval: OHLCVBar['interval'],
): OHLCVBar[] {
  const cursorMs = epoch(cursorAt, 'cursorAt');
  return uniqueBars(bars, interval).filter((bar) => (
    epoch(bar.endTime, 'bar.endTime') <= cursorMs
    && epoch(bar.asKnownAt, 'bar.asKnownAt') <= cursorMs
  ));
}

export function isKnowledgeAvailableAt(knowledge: KnowledgeTime, cursorAt: string): boolean {
  if (knowledge.precision !== 'EXACT_TIME') return false;
  return epoch(knowledge.asKnownAt, 'knowledge.asKnownAt') <= epoch(cursorAt, 'cursorAt');
}

function filingKnownAt(item: FilingContextItem, cursorAt: string): boolean {
  if (!isKnowledgeAvailableAt(item.provenance.knowledgeTime, cursorAt)) return false;
  return item.acceptedAt ? epoch(item.acceptedAt, 'filing.acceptedAt') <= epoch(cursorAt, 'cursorAt') : false;
}

function actionKnownAt(item: CorporateActionContextItem, cursorAt: string): boolean {
  if (!isKnowledgeAvailableAt(item.provenance.knowledgeTime, cursorAt)) return false;
  return item.announcedAt ? epoch(item.announcedAt, 'action.announcedAt') <= epoch(cursorAt, 'cursorAt') : false;
}

function worldKnownAt(item: WorldContextItem, cursorAt: string): boolean {
  if (!isKnowledgeAvailableAt(item.provenance.knowledgeTime, cursorAt)) return false;
  return item.eventTime ? epoch(item.eventTime, 'world.eventTime') <= epoch(cursorAt, 'cursorAt') : false;
}

function claimCapturedAt(item: SocialClaim, cursorAt: string): boolean {
  if (!isKnowledgeAvailableAt(item.provenance.knowledgeTime, cursorAt)) return false;
  return epoch(item.capturedAt, 'socialClaim.capturedAt') <= epoch(cursorAt, 'cursorAt');
}

function shortKnownAt(item: ShortContextItem, cursorAt: string): boolean {
  const runtime = item as {
    metric: ShortContextItem['metric'];
    value?: unknown;
    unit?: unknown;
  };
  if (item.status === 'UNKNOWN') {
    if (runtime.value !== undefined || runtime.unit !== undefined) {
      throw new Error(`${runtime.metric} UNKNOWN short metric cannot carry a value or unit`);
    }
    return true;
  }
  const observedDate = item.observedOn ? new Date(`${item.observedOn}T00:00:00.000Z`) : undefined;
  const validObservedDate = Boolean(
    item.observedOn
    && /^\d{4}-\d{2}-\d{2}$/.test(item.observedOn)
    && !Number.isNaN(observedDate?.valueOf())
    && observedDate?.toISOString().slice(0, 10) === item.observedOn,
  );
  if (!validObservedDate || !item.coverage.trim()) {
    throw new Error(`${item.metric} KNOWN short metric requires observedOn and coverage`);
  }
  const validUnit = (
    (item.metric === 'SHORT_INTEREST' && ['SHARES', 'PERCENT'].includes(item.unit))
    || (item.metric === 'DAILY_SHORT_VOLUME' && item.unit === 'SHARES')
    || (item.metric === 'SHORT_VOLUME_RATIO' && item.unit === 'PERCENT')
    || (item.metric === 'FAIL_TO_DELIVER' && item.unit === 'SHARES')
    || (item.metric === 'THRESHOLD_LIST' && item.unit === 'BOOLEAN')
    || (item.metric === 'BORROW_FEE' && ['PERCENT', 'BASIS_POINTS'].includes(item.unit))
    || (item.metric === 'BORROW_AVAILABILITY' && item.unit === 'SHARES')
  );
  if (!validUnit || (item.metric === 'THRESHOLD_LIST'
    ? typeof item.value !== 'boolean'
    : typeof item.value !== 'number' || !Number.isFinite(item.value))) {
    throw new Error(`${item.metric} has an incompatible value or unit`);
  }
  return isKnowledgeAvailableAt(item.provenance.knowledgeTime, cursorAt);
}

function technicalKnownAt(item: TechnicalContext, cursorAt: string): boolean {
  const cursorMs = epoch(cursorAt, 'cursorAt');
  return epoch(item.inputThrough, 'technical.inputThrough') <= cursorMs
    && epoch(item.computedAt, 'technical.computedAt') <= cursorMs;
}

/** Build the replay desk without admitting date-only or unknown intraday facts. */
export function contextKnownAt(snapshot: ContextSnapshot, cursorAt: string): ContextSnapshot {
  const snapshotIsFuture = epoch(snapshot.snapshotAt, 'snapshot.snapshotAt') > epoch(cursorAt, 'cursorAt');
  const dropped: ContextSnapshot['missingData'] = [];
  const select = <T>(
    items: readonly T[],
    predicate: (item: T, cursor: string) => boolean,
    field: string,
  ): T[] => {
    const known = items.filter((item) => predicate(item, cursorAt));
    if (known.length !== items.length) {
      dropped.push({
        field,
        reason: 'UNKNOWN_KNOWLEDGE_TIME',
        detail: `${items.length - known.length} future, date-only, or unknown-time record(s) withheld`,
      });
    }
    return known;
  };
  const bars: ContextSnapshot['price']['bars'] = Object.fromEntries(Object.entries(snapshot.price.bars).map(([interval, values]) => [
    interval,
    uniqueBars(values ?? [], interval as OHLCVBar['interval']).filter((bar) => (
      epoch(bar.endTime, 'bar.endTime') <= epoch(cursorAt, 'cursorAt')
      && epoch(bar.asKnownAt, 'bar.asKnownAt') <= epoch(cursorAt, 'cursorAt')
    )),
  ]));

  const marketProvenance = snapshot.market.provenance.filter((item) => (
    isKnowledgeAvailableAt(item.knowledgeTime, cursorAt)
  ));
  const marketAvailable = !snapshotIsFuture
    && marketProvenance.length > 0
    && marketProvenance.length === snapshot.market.provenance.length;
  if (!marketAvailable) {
    dropped.push({
      field: 'market',
      reason: 'UNKNOWN_KNOWLEDGE_TIME',
      detail: 'market values withheld because their exact knowledge-time evidence is incomplete',
    });
  }
  if (snapshotIsFuture) {
    dropped.push({
      field: 'price.summary',
      reason: 'UNKNOWN_KNOWLEDGE_TIME',
      detail: 'snapshot summary values withheld because the snapshot was computed after the replay cursor',
    });
  }

  const capturedClaims = select(snapshot.socialClaims, claimCapturedAt, 'socialClaims');
  const socialClaims = capturedClaims.map((claim) => {
    const statusKnown = isKnowledgeAvailableAt(claim.statusKnowledgeTime, cursorAt);
    const verificationKnown = claim.verificationEvidenceKnowledgeTime
      ? isKnowledgeAvailableAt(claim.verificationEvidenceKnowledgeTime, cursorAt)
      : claim.laterOfficialVerification.length === 0 && claim.contradictedEvidence.length === 0;
    const verificationStatus = !['UNVERIFIED', 'UNKNOWN'].includes(claim.status);
    const statusVisible = statusKnown && (!verificationStatus || verificationKnown);
    if (!statusVisible || !verificationKnown) {
      dropped.push({
        field: `socialClaims.${claim.claimId}.verification`,
        reason: 'UNKNOWN_KNOWLEDGE_TIME',
        detail: 'later verification/status withheld at the replay cursor',
      });
    }
    return {
      ...claim,
      status: statusVisible ? claim.status : 'UNVERIFIED' as const,
      laterOfficialVerification: verificationKnown ? claim.laterOfficialVerification : [],
      contradictedEvidence: verificationKnown ? claim.contradictedEvidence : [],
    };
  });

  return {
    ...snapshot,
    replayCutoffAt: cursorAt,
    price: {
      ...snapshot.price,
      bars,
      ...(snapshotIsFuture ? {
        gapPercent: undefined,
        sessionHigh: undefined,
        sessionLow: undefined,
        volume: undefined,
        relativeVolume: undefined,
        liquidityUsd: undefined,
        spreadPercent: undefined,
        unavailableFields: [...snapshot.price.unavailableFields, 'snapshot summary after cursor'],
      } : {}),
    },
    technical: select(snapshot.technical, technicalKnownAt, 'technical'),
    market: {
      ...snapshot.market,
      provenance: marketProvenance,
      ...(!marketAvailable ? {
        benchmarks: {},
        sectorEtf: undefined,
        breadth: undefined,
        volatility: undefined,
        rates: undefined,
        dollar: undefined,
        commodities: undefined,
        regime: undefined,
        unavailableFields: [...snapshot.market.unavailableFields, 'knowledge-time evidence'],
      } : {}),
    },
    filings: select(snapshot.filings, filingKnownAt, 'filings'),
    corporateActions: select(snapshot.corporateActions, actionKnownAt, 'corporateActions'),
    short: select(snapshot.short, shortKnownAt, 'short'),
    world: select(snapshot.world, worldKnownAt, 'world'),
    socialClaims,
    missingData: [...snapshot.missingData, ...dropped],
  };
}

function lastBarAtOrBefore(bars: readonly OHLCVBar[], timestampMs: number): OHLCVBar | undefined {
  return [...bars]
    .filter((bar) => epoch(bar.endTime, 'bar.endTime') <= timestampMs)
    .sort((left, right) => epoch(right.endTime, 'bar.endTime') - epoch(left.endTime, 'bar.endTime'))[0];
}

function barEndingAt(bars: readonly OHLCVBar[], timestampMs: number): OHLCVBar | undefined {
  return bars.find((bar) => epoch(bar.endTime, 'bar.endTime') === timestampMs);
}

function percentChange(value: number, basis: number): number {
  return ((value / basis) - 1) * 100;
}

function coverageForOutcome(observed: number, expected: number): EpisodeCoverage {
  if (observed === 0) return 'DAILY_ONLY';
  return observed >= expected ? 'INTRADAY_FULL' : 'INTRADAY_PARTIAL';
}

export function calculateOutcomeLabel(options: {
  episodeId: string;
  forecastAt: string;
  labeledAt: string;
  bars: readonly OHLCVBar[];
  regularSessionClose?: string;
  evaluationMinutes?: number;
}): OutcomeLabel {
  const forecastMs = epoch(options.forecastAt, 'forecastAt');
  const labeledAtMs = epoch(options.labeledAt, 'labeledAt');
  if (labeledAtMs < forecastMs) throw new Error('labeledAt must not precede forecastAt');
  const ordered = uniqueBars(options.bars, '1m');
  const identities = new Set(ordered.map((bar) => bar.instrumentId ?? bar.symbol));
  if (identities.size !== 1) throw new Error('outcome input cannot mix instruments');
  const reference = lastBarAtOrBefore(barsKnownAt(ordered, options.forecastAt), forecastMs);
  if (!reference) throw new Error('outcome requires a reference bar known at forecastAt');
  const session = reference.session;
  const instrument = reference.instrumentId ?? reference.symbol;
  const evaluationMinutes = options.evaluationMinutes ?? 120;
  const evaluationEnd = forecastMs + evaluationMinutes * 60_000;
  const future = ordered.filter((bar) => (
    (bar.instrumentId ?? bar.symbol) === instrument
    && bar.session === session
    && epoch(bar.startTime, 'bar.startTime') >= forecastMs
    && epoch(bar.endTime, 'bar.endTime') <= evaluationEnd
    && epoch(bar.asKnownAt, 'bar.asKnownAt') <= labeledAtMs
  ));
  const continuousFuture: OHLCVBar[] = [];
  let expectedStart = forecastMs;
  for (const bar of future) {
    if (epoch(bar.startTime, 'bar.startTime') !== expectedStart) break;
    continuousFuture.push(bar);
    expectedStart = epoch(bar.endTime, 'bar.endTime');
  }
  const returnsByMinutes: OutcomeLabel['returnsByMinutes'] = {};
  for (const minutes of OUTCOME_HORIZONS) {
    const target = forecastMs + minutes * 60_000;
    // A stale earlier close is not the return at this horizon. If the exact
    // 1m boundary is absent, leave the horizon unavailable.
    const targetBar = barEndingAt(future, target);
    if (targetBar) returnsByMinutes[minutes] = percentChange(targetBar.close, reference.close);
  }

  const barriers = OUTCOME_BARRIERS.map((barrierPercent) => {
    const reached = continuousFuture.find((bar) => barrierPercent > 0
      ? percentChange(bar.high, reference.close) >= barrierPercent
      : percentChange(bar.low, reference.close) <= barrierPercent);
    return {
      barrierPercent,
      reached: Boolean(reached),
      ...(reached ? {
        reachedAt: reached.endTime,
        minutesToReach: (epoch(reached.endTime, 'bar.endTime') - forecastMs) / 60_000,
      } : {}),
    };
  });
  const reachedAt = (barrier: OutcomeBarrierPercent): number | undefined => {
    const value = barriers.find((item) => item.barrierPercent === barrier)?.reachedAt;
    return value ? epoch(value, 'barrier.reachedAt') : undefined;
  };
  const upsideAt = reachedAt(5);
  const downsideAt = reachedAt(-3);
  const fullEvaluationCoverage = continuousFuture.length >= evaluationMinutes;
  const barrierOrdering: OutcomeLabel['barrierOrdering'] = upsideAt === undefined && downsideAt === undefined
    ? fullEvaluationCoverage ? 'NEITHER' : 'UNKNOWN'
    : upsideAt === downsideAt
      ? 'SAME_BAR'
      : downsideAt === undefined || (upsideAt !== undefined && upsideAt < downsideAt)
        ? 'UPSIDE_FIRST'
        : 'DOWNSIDE_FIRST';
  const regularCloseMs = options.regularSessionClose
    ? epoch(options.regularSessionClose, 'regularSessionClose')
    : undefined;
  const closeBar = regularCloseMs === undefined ? undefined : barEndingAt(
    ordered.filter((bar) => (
      bar.session === 'REGULAR'
      && (bar.instrumentId ?? bar.symbol) === instrument
      && epoch(bar.asKnownAt, 'bar.asKnownAt') <= labeledAtMs
    )),
    regularCloseMs,
  );
  const expectedBars = evaluationMinutes;
  const missingData: OutcomeLabel['missingData'] = [];
  for (const minutes of OUTCOME_HORIZONS) {
    if (returnsByMinutes[minutes] === undefined) {
      missingData.push({ field: `returnsByMinutes.${minutes}`, reason: 'OUTSIDE_COVERAGE' });
    }
  }
  if (!fullEvaluationCoverage) {
    missingData.push({
      field: 'evaluationWindow',
      reason: 'OUTSIDE_COVERAGE',
      detail: `continuous 1m coverage ${continuousFuture.length}/${evaluationMinutes} minutes`,
    });
  }
  return {
    episodeId: options.episodeId,
    forecastAt: options.forecastAt,
    labeledAt: options.labeledAt,
    returnsByMinutes,
    ...(closeBar && epoch(closeBar.endTime, 'bar.endTime') > forecastMs
      ? { regularCloseReturnPercent: percentChange(closeBar.close, reference.close) }
      : {}),
    ...(continuousFuture.length ? {
      mfePercent: Math.max(...continuousFuture.map((bar) => percentChange(bar.high, reference.close))),
      maePercent: Math.min(...continuousFuture.map((bar) => percentChange(bar.low, reference.close))),
    } : {}),
    barriers,
    barrierOrdering,
    barrierPair: { upsidePercent: 5, downsidePercent: -3 },
    coverage: coverageForOutcome(future.length, expectedBars),
    missingData,
  };
}

/**
 * Label a DAILY_ONLY episode without inventing intraday ordering. A barrier
 * pair reached within the same daily bar is deliberately reported SAME_BAR.
 */
export function calculateDailyOutcomeLabel(options: {
  episodeId: string;
  forecastAt: string;
  labeledAt: string;
  bars: readonly OHLCVBar[];
  evaluationTradingDays?: number;
}): OutcomeLabel {
  const forecastMs = epoch(options.forecastAt, 'forecastAt');
  const labeledAtMs = epoch(options.labeledAt, 'labeledAt');
  if (labeledAtMs < forecastMs) throw new Error('labeledAt must not precede forecastAt');
  const ordered = uniqueBars(options.bars, '1d');
  const identities = new Set(ordered.map((bar) => bar.instrumentId ?? bar.symbol));
  if (identities.size !== 1) throw new Error('daily outcome input cannot mix instruments');
  const reference = lastBarAtOrBefore(
    barsKnownAtInterval(ordered, options.forecastAt, '1d'),
    forecastMs,
  );
  if (!reference) throw new Error('daily outcome requires a reference bar known at forecastAt');
  const evaluationTradingDays = options.evaluationTradingDays ?? 5;
  if (!Number.isInteger(evaluationTradingDays) || evaluationTradingDays <= 0) {
    throw new Error('evaluationTradingDays must be a positive integer');
  }
  const instrument = reference.instrumentId ?? reference.symbol;
  const future = ordered.filter((bar) => (
    (bar.instrumentId ?? bar.symbol) === instrument
    && epoch(bar.startTime, 'bar.startTime') >= forecastMs
    && epoch(bar.asKnownAt, 'bar.asKnownAt') <= labeledAtMs
  )).slice(0, evaluationTradingDays);
  const returnsByTradingDays: NonNullable<OutcomeLabel['returnsByTradingDays']> = {};
  for (const days of OUTCOME_TRADING_DAY_HORIZONS) {
    const target = future[days - 1];
    if (target) returnsByTradingDays[days] = percentChange(target.close, reference.close);
  }
  const barriers = OUTCOME_BARRIERS.map((barrierPercent) => {
    const reachedIndex = future.findIndex((bar) => barrierPercent > 0
      ? percentChange(bar.high, reference.close) >= barrierPercent
      : percentChange(bar.low, reference.close) <= barrierPercent);
    return {
      barrierPercent,
      reached: reachedIndex >= 0,
      ...(reachedIndex >= 0 ? {
        reachedAt: future[reachedIndex]!.endTime,
        tradingDaysToReach: reachedIndex + 1,
      } : {}),
    };
  });
  const reachedIndex = (barrier: OutcomeBarrierPercent): number | undefined => {
    const value = barriers.find((item) => item.barrierPercent === barrier)?.tradingDaysToReach;
    return value === undefined ? undefined : value;
  };
  const upsideAt = reachedIndex(5);
  const downsideAt = reachedIndex(-3);
  const fullCoverage = future.length >= evaluationTradingDays;
  const barrierOrdering: OutcomeLabel['barrierOrdering'] = upsideAt === undefined && downsideAt === undefined
    ? fullCoverage ? 'NEITHER' : 'UNKNOWN'
    : upsideAt === downsideAt
      ? 'SAME_BAR'
      : downsideAt === undefined || (upsideAt !== undefined && upsideAt < downsideAt)
        ? 'UPSIDE_FIRST'
        : 'DOWNSIDE_FIRST';
  const missingData: OutcomeLabel['missingData'] = [];
  for (const days of OUTCOME_TRADING_DAY_HORIZONS) {
    if (returnsByTradingDays[days] === undefined) {
      missingData.push({ field: `returnsByTradingDays.${days}`, reason: 'OUTSIDE_COVERAGE' });
    }
  }
  if (!fullCoverage) {
    missingData.push({
      field: 'evaluationWindow',
      reason: 'OUTSIDE_COVERAGE',
      detail: `daily coverage ${future.length}/${evaluationTradingDays} trading days`,
    });
  }
  return {
    episodeId: options.episodeId,
    forecastAt: options.forecastAt,
    labeledAt: options.labeledAt,
    returnsByMinutes: {},
    returnsByTradingDays,
    ...(returnsByTradingDays[1] === undefined
      ? {}
      : { nextTradingDayReturnPercent: returnsByTradingDays[1] }),
    ...(future.length ? {
      mfePercent: Math.max(...future.map((bar) => percentChange(bar.high, reference.close))),
      maePercent: Math.min(...future.map((bar) => percentChange(bar.low, reference.close))),
    } : {}),
    barriers,
    barrierOrdering,
    barrierPair: { upsidePercent: 5, downsidePercent: -3 },
    coverage: 'DAILY_ONLY',
    missingData,
  };
}

export interface SimilarEpisodeCandidate {
  episodeId: string;
  ticker: string;
  eventTime: string;
  eventType: string;
  regime?: string;
  features: Readonly<Record<string, number | undefined>>;
  outcome?: OutcomeLabel;
  missingDataCount: number;
}

export interface SimilarEpisodeResult extends SimilarEpisodeCandidate {
  similarity: number;
  matchedFeatureCount: number;
}

export interface CoverageAwareSimilarEpisodeCandidate extends SimilarEpisodeCandidate {
  coverage: EpisodeCoverage;
}

/** Compare episodes only inside the same resolution class by default. */
export function rankCoverageCompatibleEpisodes(
  current: CoverageAwareSimilarEpisodeCandidate,
  candidates: readonly CoverageAwareSimilarEpisodeCandidate[],
  limit = 20,
): SimilarEpisodeResult[] {
  return rankSimilarEpisodes(
    current,
    candidates.filter((candidate) => candidate.coverage === current.coverage),
    limit,
  );
}

export function rankSimilarEpisodes(
  current: SimilarEpisodeCandidate,
  candidates: readonly SimilarEpisodeCandidate[],
  limit = 20,
): SimilarEpisodeResult[] {
  const currentEventMs = epoch(current.eventTime, 'current.eventTime');
  return candidates
    .filter((candidate) => (
      candidate.episodeId !== current.episodeId
      && epoch(candidate.eventTime, 'candidate.eventTime') < currentEventMs
    ))
    .map((candidate) => {
      const outcome = candidate.outcome
        && epoch(candidate.outcome.labeledAt, 'candidate.outcome.labeledAt') <= currentEventMs
        ? candidate.outcome
        : undefined;
      const shared = Object.keys(current.features).filter((key) => (
        Number.isFinite(current.features[key]) && Number.isFinite(candidate.features[key])
      ));
      const squaredDistance = shared.reduce((sum, key) => {
        const left = current.features[key]!;
        const right = candidate.features[key]!;
        const scale = Math.max(1, Math.abs(left), Math.abs(right));
        return sum + ((left - right) / scale) ** 2;
      }, 0);
      const regimePenalty = current.regime && candidate.regime && current.regime !== candidate.regime ? 0.15 : 0;
      const missingPenalty = Math.min(0.35, candidate.missingDataCount * 0.025);
      const distance = shared.length ? Math.sqrt(squaredDistance / shared.length) : 1;
      return {
        ...candidate,
        ...(outcome ? { outcome } : { outcome: undefined }),
        similarity: Math.max(0, Math.min(1, 1 - distance - regimePenalty - missingPenalty)),
        matchedFeatureCount: shared.length,
      };
    })
    .sort((left, right) => (
      right.similarity - left.similarity
      || right.matchedFeatureCount - left.matchedFeatureCount
      || left.episodeId.localeCompare(right.episodeId)
    ))
    .slice(0, Math.max(0, limit));
}

export function summarizeSimilarEpisodes(items: readonly SimilarEpisodeResult[]) {
  const outcomes = items.flatMap((item) => item.outcome ? [item.outcome] : []);
  const median = (values: number[]): number | undefined => {
    if (!values.length) return undefined;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1]! + ordered[middle]!) / 2;
  };
  return {
    sampleSize: items.length,
    outcomeSampleSize: outcomes.length,
    period: items.length ? {
      from: [...items].sort((a, b) => a.eventTime.localeCompare(b.eventTime))[0]!.eventTime,
      to: [...items].sort((a, b) => b.eventTime.localeCompare(a.eventTime))[0]!.eventTime,
    } : undefined,
    upsideFirst: outcomes.filter((item) => item.barrierOrdering === 'UPSIDE_FIRST').length,
    downsideFirst: outcomes.filter((item) => item.barrierOrdering === 'DOWNSIDE_FIRST').length,
    neither: outcomes.filter((item) => item.barrierOrdering === 'NEITHER').length,
    medianMfePercent: median(outcomes.flatMap((item) => item.mfePercent === undefined ? [] : [item.mfePercent])),
    medianMaePercent: median(outcomes.flatMap((item) => item.maePercent === undefined ? [] : [item.maePercent])),
    missingDataCount: items.reduce((sum, item) => sum + item.missingDataCount, 0),
  };
}

export interface ReplayState {
  episodeId: string;
  cursorAt: string;
  revealed: boolean;
  forecast?: ForecastRecord;
}

export function createReplayState(episodeId: string, cursorAt: string): ReplayState {
  epoch(cursorAt, 'cursorAt');
  return Object.freeze({ episodeId, cursorAt, revealed: false });
}

export function sealReplayForecast(state: ReplayState, forecast: ForecastRecord): ReplayState {
  if (state.revealed) throw new Error('cannot seal a forecast after outcome reveal');
  if (state.forecast) throw new Error('forecast is already sealed');
  if (forecast.episodeId !== state.episodeId) throw new Error('forecast episode mismatch');
  if (forecast.forecastAt !== state.cursorAt) throw new Error('forecast time must equal replay cursor');
  const forecastAtMs = epoch(forecast.forecastAt, 'forecast.forecastAt');
  const sealedAtMs = epoch(forecast.sealedAt, 'forecast.sealedAt');
  if (sealedAtMs < forecastAtMs) throw new Error('forecast sealedAt must not precede forecastAt');
  if (!forecast.question.trim() || !forecast.modelVersion.trim() || !forecast.promptVersion.trim()) {
    throw new Error('forecast question and versions must be non-empty');
  }
  if (!Number.isInteger(forecast.predictionHorizonMinutes) || forecast.predictionHorizonMinutes <= 0) {
    throw new Error('forecast horizon must be a positive integer');
  }
  if (forecast.probability !== undefined
    && (!Number.isFinite(forecast.probability) || forecast.probability < 0 || forecast.probability > 1)) {
    throw new Error('forecast probability must be between 0 and 1');
  }
  for (const [label, value] of [
    ['expectedUpsidePercent', forecast.expectedUpsidePercent],
    ['expectedDownsidePercent', forecast.expectedDownsidePercent],
  ] as const) {
    if (value !== undefined && !Number.isFinite(value)) throw new Error(`forecast ${label} must be finite`);
  }
  const hasStructuredHumanForecast = forecast.decision !== undefined
    || forecast.confidencePercent !== undefined
    || forecast.thesis !== undefined
    || forecast.invalidation !== undefined
    || forecast.prediction !== undefined;
  if (hasStructuredHumanForecast) {
    if (!forecast.decision || !FORECAST_DECISIONS.includes(forecast.decision)) {
      throw new Error('structured forecast requires a supported decision');
    }
    if (!Number.isFinite(forecast.confidencePercent)
      || forecast.confidencePercent! < 0
      || forecast.confidencePercent! > 100) {
      throw new Error('structured forecast confidence must be between 0 and 100');
    }
    if (!forecast.thesis?.trim() || !forecast.invalidation?.trim() || !forecast.prediction) {
      throw new Error('structured forecast requires thesis, invalidation, and prediction');
    }
    const prediction = forecast.prediction;
    if (!Number.isFinite(prediction.thresholdPercent)
      || !Number.isFinite(prediction.probabilityPercent)
      || prediction.probabilityPercent < 0
      || prediction.probabilityPercent > 100
      || !Number.isInteger(prediction.horizon.value)
      || prediction.horizon.value <= 0
      || (prediction.horizon.unit === 'TRADING_DAYS'
        && !OUTCOME_TRADING_DAY_HORIZONS.includes(prediction.horizon.value))) {
      throw new Error('structured forecast prediction is invalid');
    }
  }
  const sealed = Object.freeze({
    ...forecast,
    bullishEvidence: Object.freeze([...forecast.bullishEvidence]),
    bearishEvidence: Object.freeze([...forecast.bearishEvidence]),
    missingInformation: Object.freeze([...forecast.missingInformation]),
    ...(forecast.prediction ? {
      prediction: Object.freeze({
        ...forecast.prediction,
        horizon: Object.freeze({ ...forecast.prediction.horizon }),
      }),
    } : {}),
  });
  return Object.freeze({ ...state, forecast: sealed });
}

export function revealReplayOutcome(state: ReplayState): ReplayState {
  if (!state.forecast) throw new Error('record a forecast before revealing the outcome');
  return state.revealed ? state : Object.freeze({ ...state, revealed: true });
}
