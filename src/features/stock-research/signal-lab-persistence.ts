import {
  FORECAST_DECISIONS,
  OUTCOME_BARRIERS,
  OUTCOME_HORIZONS,
  OUTCOME_TRADING_DAY_HORIZONS,
  REVIEW_PATH_ASSESSMENTS,
  type BarrierOutcome,
  type ForecastPrediction,
  type ForecastRecord,
  type MissingDataNotice,
  type OutcomeLabel,
  type RelativeReturnOutcome,
  type ReviewRecord,
  type TradingDayOutcome,
} from './signal-lab-contract.ts';

export const SIGNAL_LAB_PERSISTENCE_VERSION = 'signal-lab-local/v1' as const;
export const SIGNAL_LAB_PERSISTENCE_KEY = 'worldmonitor:signal-lab:v1' as const;

const MAX_ENVELOPE_BYTES = 1_000_000;
const MAX_RECORDS = 500;
const MAX_ARRAY_ITEMS = 100;
const MAX_TEXT_LENGTH = 20_000;

export interface SignalLabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface RevealRecord {
  forecastId: string;
  revealedAt: string;
}

interface PersistenceEnvelope {
  version: typeof SIGNAL_LAB_PERSISTENCE_VERSION;
  forecastsByEpisode: Record<string, ForecastRecord>;
  reviewsByForecast: Record<string, ReviewRecord>;
  revealsByEpisode: Record<string, RevealRecord>;
}

interface ParsedEnvelope {
  status: 'EMPTY' | 'VALID' | 'CORRUPT' | 'UNSUPPORTED' | 'UNAVAILABLE';
  envelope?: PersistenceEnvelope;
}

export interface SignalLabPersistence {
  getForecast(episodeId: string): ForecastRecord | undefined;
  saveForecast(forecast: ForecastRecord): boolean;
  getReview(forecastId: string): ReviewRecord | undefined;
  saveReview(review: ReviewRecord): boolean;
  isOutcomeRevealed(episodeId: string): boolean;
  markOutcomeRevealed(episodeId: string, forecastId: string, revealedAt?: string): boolean;
}

function emptyEnvelope(): PersistenceEnvelope {
  return {
    version: SIGNAL_LAB_PERSISTENCE_VERSION,
    forecastsByEpisode: {},
    reviewsByForecast: {},
    revealsByEpisode: {},
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
}

function isoDate(value: unknown): value is string {
  return nonEmptyText(value) && Number.isFinite(Date.parse(value));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || record[key] === undefined || finiteNumber(record[key]);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_ARRAY_ITEMS
    && value.every(text);
}

function oneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function normalizeMissingData(value: unknown): MissingDataNotice[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return undefined;
  const normalized: MissingDataNotice[] = [];
  for (const item of value) {
    if (!isObject(item)
      || !nonEmptyText(item.field)
      || !oneOf(item.reason, ['NOT_AVAILABLE', 'OUTSIDE_COVERAGE', 'UNKNOWN_KNOWLEDGE_TIME', 'CONFLICT'] as const)
      || (hasOwn(item, 'detail') && item.detail !== undefined && !text(item.detail))) {
      return undefined;
    }
    normalized.push({
      field: item.field,
      reason: item.reason,
      ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
    });
  }
  return normalized;
}

function normalizeNumberRecord<T extends number>(
  value: unknown,
  allowedKeys: readonly T[],
): Partial<Record<T, number>> | undefined {
  if (!isObject(value)) return undefined;
  const normalized: Partial<Record<T, number>> = {};
  for (const [key, item] of Object.entries(value)) {
    const numericKey = Number(key) as T;
    if (!allowedKeys.includes(numericKey) || !finiteNumber(item)) return undefined;
    normalized[numericKey] = item;
  }
  return normalized;
}

function normalizeRelativeReturn(value: unknown): RelativeReturnOutcome | undefined {
  if (!isObject(value)
    || !nonEmptyText(value.benchmarkSymbol)
    || !finiteNumber(value.benchmarkReturnPercent)
    || !finiteNumber(value.relativeReturnPercent)) {
    return undefined;
  }
  return {
    benchmarkSymbol: value.benchmarkSymbol,
    benchmarkReturnPercent: value.benchmarkReturnPercent,
    relativeReturnPercent: value.relativeReturnPercent,
  };
}

function normalizeTradingDayOutcome(value: unknown): TradingDayOutcome | undefined {
  if (!isObject(value)
    || !oneOf(value.coverage, ['COMPLETE', 'INCOMPLETE', 'UNKNOWN'] as const)
    || !optionalFiniteNumber(value, 'absoluteReturnPercent')
    || !optionalFiniteNumber(value, 'mfePercent')
    || !optionalFiniteNumber(value, 'maePercent')) {
    return undefined;
  }
  const marketRelative = value.marketRelative === undefined
    ? undefined
    : normalizeRelativeReturn(value.marketRelative);
  const sectorRelative = value.sectorRelative === undefined
    ? undefined
    : normalizeRelativeReturn(value.sectorRelative);
  const missingData = normalizeMissingData(value.missingData);
  if ((value.marketRelative !== undefined && !marketRelative)
    || (value.sectorRelative !== undefined && !sectorRelative)
    || !missingData) {
    return undefined;
  }
  const tradingDays = value.tradingDays as TradingDayOutcome['tradingDays'];
  const hasPathMetadata = hasOwn(value, 'usableSessionCount')
    || hasOwn(value, 'expectedSessionCount')
    || hasOwn(value, 'coverageStatus');
  let usableSessionCount: number;
  let expectedSessionCount: TradingDayOutcome['expectedSessionCount'];
  let coverageStatus: TradingDayOutcome['coverageStatus'];
  if (!hasPathMetadata && value.coverage === 'COMPLETE') {
    // Backward compatibility is safe only for a legacy horizon that already
    // asserted a complete path. Never invent counts for an incomplete path.
    usableSessionCount = tradingDays;
    expectedSessionCount = tradingDays;
    coverageStatus = 'COMPLETE';
  } else {
    if (!Number.isInteger(value.usableSessionCount)
      || !Number.isInteger(value.expectedSessionCount)
      || value.expectedSessionCount !== tradingDays
      || !oneOf(value.coverageStatus, ['COMPLETE', 'PARTIAL', 'INSUFFICIENT_SAMPLE'] as const)) {
      return undefined;
    }
    usableSessionCount = value.usableSessionCount as number;
    expectedSessionCount = value.expectedSessionCount as TradingDayOutcome['expectedSessionCount'];
    coverageStatus = value.coverageStatus;
  }
  if (usableSessionCount < 0
    || usableSessionCount > expectedSessionCount
    || (coverageStatus === 'COMPLETE'
      && (usableSessionCount !== expectedSessionCount || value.coverage !== 'COMPLETE'))
    || (coverageStatus === 'PARTIAL'
      && (usableSessionCount === 0
        || usableSessionCount === expectedSessionCount
        || value.coverage !== 'INCOMPLETE'))
    || (coverageStatus === 'INSUFFICIENT_SAMPLE'
      && (usableSessionCount !== 0 || value.coverage !== 'INCOMPLETE'))
    || (coverageStatus !== 'COMPLETE'
      && (value.mfePercent !== undefined || value.maePercent !== undefined))) {
    return undefined;
  }
  return {
    tradingDays,
    ...(finiteNumber(value.absoluteReturnPercent) ? { absoluteReturnPercent: value.absoluteReturnPercent } : {}),
    ...(marketRelative ? { marketRelative } : {}),
    ...(sectorRelative ? { sectorRelative } : {}),
    ...(finiteNumber(value.mfePercent) ? { mfePercent: value.mfePercent } : {}),
    ...(finiteNumber(value.maePercent) ? { maePercent: value.maePercent } : {}),
    usableSessionCount,
    expectedSessionCount,
    coverageStatus,
    coverage: value.coverage,
    missingData,
  };
}

function normalizeTradingDayOutcomes(
  value: unknown,
): OutcomeLabel['tradingDayOutcomes'] | undefined {
  if (!isObject(value)) return undefined;
  const normalized: NonNullable<OutcomeLabel['tradingDayOutcomes']> = {};
  for (const [key, item] of Object.entries(value)) {
    const tradingDays = Number(key) as (typeof OUTCOME_TRADING_DAY_HORIZONS)[number];
    const outcome = normalizeTradingDayOutcome(item);
    if (!OUTCOME_TRADING_DAY_HORIZONS.includes(tradingDays)
      || !outcome
      || outcome.tradingDays !== tradingDays) {
      return undefined;
    }
    normalized[tradingDays] = outcome;
  }
  return normalized;
}

function normalizeBarrier(value: unknown): BarrierOutcome | undefined {
  if (!isObject(value)
    || !finiteNumber(value.barrierPercent)
    || !OUTCOME_BARRIERS.includes(value.barrierPercent as BarrierOutcome['barrierPercent'])
    || typeof value.reached !== 'boolean'
    || (value.reachedAt !== undefined && !isoDate(value.reachedAt))
    || (value.minutesToReach !== undefined
      && (!finiteNumber(value.minutesToReach) || value.minutesToReach < 0))
    || (value.tradingDaysToReach !== undefined
      && (!finiteNumber(value.tradingDaysToReach) || value.tradingDaysToReach < 0))) {
    return undefined;
  }
  if (!value.reached
    && (value.reachedAt !== undefined
      || value.minutesToReach !== undefined
      || value.tradingDaysToReach !== undefined)) {
    return undefined;
  }
  return {
    barrierPercent: value.barrierPercent as BarrierOutcome['barrierPercent'],
    reached: value.reached,
    ...(typeof value.reachedAt === 'string' ? { reachedAt: value.reachedAt } : {}),
    ...(finiteNumber(value.minutesToReach) ? { minutesToReach: value.minutesToReach } : {}),
    ...(finiteNumber(value.tradingDaysToReach) ? { tradingDaysToReach: value.tradingDaysToReach } : {}),
  };
}

function normalizeOutcome(value: unknown): OutcomeLabel | undefined {
  if (!isObject(value)
    || !nonEmptyText(value.episodeId)
    || !isoDate(value.forecastAt)
    || !isoDate(value.labeledAt)
    || Date.parse(value.labeledAt) < Date.parse(value.forecastAt)
    || !oneOf(value.barrierOrdering, ['UPSIDE_FIRST', 'DOWNSIDE_FIRST', 'SAME_BAR', 'NEITHER', 'UNKNOWN'] as const)
    || !oneOf(value.coverage, ['DAILY_ONLY', 'INTRADAY_PARTIAL', 'INTRADAY_FULL'] as const)
    || !optionalFiniteNumber(value, 'regularCloseReturnPercent')
    || !optionalFiniteNumber(value, 'nextTradingDayReturnPercent')
    || !optionalFiniteNumber(value, 'mfePercent')
    || !optionalFiniteNumber(value, 'maePercent')
    || !isObject(value.barrierPair)
    || value.barrierPair.upsidePercent !== 5
    || value.barrierPair.downsidePercent !== -3
    || !Array.isArray(value.barriers)
    || value.barriers.length > OUTCOME_BARRIERS.length) {
    return undefined;
  }
  const returnsByMinutes = normalizeNumberRecord(value.returnsByMinutes, OUTCOME_HORIZONS);
  const returnsByTradingDays = value.returnsByTradingDays === undefined
    ? undefined
    : normalizeNumberRecord(value.returnsByTradingDays, OUTCOME_TRADING_DAY_HORIZONS);
  const tradingDayOutcomes = value.tradingDayOutcomes === undefined
    ? undefined
    : normalizeTradingDayOutcomes(value.tradingDayOutcomes);
  const barriers = value.barriers.map(normalizeBarrier);
  const missingData = normalizeMissingData(value.missingData);
  if (!returnsByMinutes
    || (value.returnsByTradingDays !== undefined && !returnsByTradingDays)
    || (value.tradingDayOutcomes !== undefined && !tradingDayOutcomes)
    || barriers.some((item) => !item)
    || !missingData
    || (value.barrierOrderingStatus !== undefined
      && !oneOf(value.barrierOrderingStatus, ['ORDERED', 'SAME_BAR_UNKNOWN_ORDER', 'INCOMPLETE_WINDOW'] as const))) {
    return undefined;
  }
  return {
    episodeId: value.episodeId,
    forecastAt: value.forecastAt,
    labeledAt: value.labeledAt,
    returnsByMinutes,
    ...(returnsByTradingDays ? { returnsByTradingDays } : {}),
    ...(tradingDayOutcomes ? { tradingDayOutcomes } : {}),
    ...(finiteNumber(value.regularCloseReturnPercent)
      ? { regularCloseReturnPercent: value.regularCloseReturnPercent }
      : {}),
    ...(finiteNumber(value.nextTradingDayReturnPercent)
      ? { nextTradingDayReturnPercent: value.nextTradingDayReturnPercent }
      : {}),
    ...(finiteNumber(value.mfePercent) ? { mfePercent: value.mfePercent } : {}),
    ...(finiteNumber(value.maePercent) ? { maePercent: value.maePercent } : {}),
    barriers: barriers as BarrierOutcome[],
    barrierOrdering: value.barrierOrdering,
    ...(value.barrierOrderingStatus !== undefined
      ? { barrierOrderingStatus: value.barrierOrderingStatus }
      : {}),
    barrierPair: { upsidePercent: 5, downsidePercent: -3 },
    coverage: value.coverage,
    missingData,
  };
}

function normalizePrediction(value: unknown): ForecastPrediction | undefined {
  if (!isObject(value)
    || !isObject(value.horizon)
    || !oneOf(value.metric, ['ABSOLUTE_RETURN', 'MARKET_RELATIVE_RETURN', 'SECTOR_RELATIVE_RETURN'] as const)
    || !oneOf(value.operator, ['AT_LEAST', 'AT_MOST'] as const)
    || !finiteNumber(value.thresholdPercent)
    || !finiteNumber(value.probabilityPercent)
    || value.probabilityPercent < 0
    || value.probabilityPercent > 100) {
    return undefined;
  }
  const horizon = value.horizon;
  if (horizon.unit === 'MINUTES') {
    if (!Number.isInteger(horizon.value) || (horizon.value as number) <= 0) return undefined;
  } else if (horizon.unit === 'TRADING_DAYS') {
    if (!OUTCOME_TRADING_DAY_HORIZONS.includes(horizon.value as (typeof OUTCOME_TRADING_DAY_HORIZONS)[number])) {
      return undefined;
    }
  } else {
    return undefined;
  }
  return {
    horizon: horizon.unit === 'MINUTES'
      ? { unit: 'MINUTES', value: horizon.value as number }
      : { unit: 'TRADING_DAYS', value: horizon.value as (typeof OUTCOME_TRADING_DAY_HORIZONS)[number] },
    metric: value.metric,
    operator: value.operator,
    thresholdPercent: value.thresholdPercent,
    probabilityPercent: value.probabilityPercent,
  };
}

function normalizeForecast(value: unknown): ForecastRecord | undefined {
  if (!isObject(value)
    || !nonEmptyText(value.forecastId)
    || !nonEmptyText(value.episodeId)
    || !isoDate(value.forecastAt)
    || !Number.isInteger(value.predictionHorizonMinutes)
    || (value.predictionHorizonMinutes as number) <= 0
    || !nonEmptyText(value.question)
    || !stringArray(value.bullishEvidence)
    || !stringArray(value.bearishEvidence)
    || !stringArray(value.missingInformation)
    || typeof value.abstain !== 'boolean'
    || !nonEmptyText(value.modelVersion)
    || !nonEmptyText(value.promptVersion)
    || !Number.isInteger(value.similarEpisodeCount)
    || (value.similarEpisodeCount as number) < 0
    || !isoDate(value.sealedAt)
    || Date.parse(value.sealedAt) < Date.parse(value.forecastAt)
    || !optionalFiniteNumber(value, 'probability')
    || (finiteNumber(value.probability) && (value.probability < 0 || value.probability > 1))
    || !optionalFiniteNumber(value, 'expectedUpsidePercent')
    || !optionalFiniteNumber(value, 'expectedDownsidePercent')
    || (value.notes !== undefined && !text(value.notes))
    || (value.decision !== undefined && !oneOf(value.decision, FORECAST_DECISIONS))
    || !optionalFiniteNumber(value, 'confidencePercent')
    || (finiteNumber(value.confidencePercent)
      && (value.confidencePercent < 0 || value.confidencePercent > 100))
    || (value.thesis !== undefined && !text(value.thesis))
    || (value.invalidation !== undefined && !text(value.invalidation))) {
    return undefined;
  }
  const prediction = value.prediction === undefined ? undefined : normalizePrediction(value.prediction);
  if (value.prediction !== undefined && !prediction) return undefined;
  return {
    forecastId: value.forecastId,
    episodeId: value.episodeId,
    forecastAt: value.forecastAt,
    predictionHorizonMinutes: value.predictionHorizonMinutes as number,
    question: value.question,
    ...(finiteNumber(value.probability) ? { probability: value.probability } : {}),
    ...(finiteNumber(value.expectedUpsidePercent)
      ? { expectedUpsidePercent: value.expectedUpsidePercent }
      : {}),
    ...(finiteNumber(value.expectedDownsidePercent)
      ? { expectedDownsidePercent: value.expectedDownsidePercent }
      : {}),
    bullishEvidence: [...value.bullishEvidence],
    bearishEvidence: [...value.bearishEvidence],
    missingInformation: [...value.missingInformation],
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    abstain: value.abstain,
    modelVersion: value.modelVersion,
    promptVersion: value.promptVersion,
    similarEpisodeCount: value.similarEpisodeCount as number,
    sealedAt: value.sealedAt,
    ...(value.decision !== undefined ? { decision: value.decision } : {}),
    ...(finiteNumber(value.confidencePercent) ? { confidencePercent: value.confidencePercent } : {}),
    ...(typeof value.thesis === 'string' ? { thesis: value.thesis } : {}),
    ...(typeof value.invalidation === 'string' ? { invalidation: value.invalidation } : {}),
    ...(prediction ? { prediction } : {}),
  };
}

function normalizeReview(value: unknown): ReviewRecord | undefined {
  if (!isObject(value)
    || !nonEmptyText(value.reviewId)
    || !nonEmptyText(value.forecastId)
    || !isoDate(value.reviewedAt)
    || !stringArray(value.errorClasses)
    || !value.errorClasses.every((item) => oneOf(item, [
      'DATA_ERROR',
      'TIME_LEAK',
      'CATALYST_MISREAD',
      'MARKET_REGIME_ERROR',
      'TECHNICAL_OVERFIT',
      'SOCIAL_FALSE_CLAIM',
      'EXECUTION_ERROR',
      'PSYCHOLOGY_ERROR',
      'UNKNOWN',
    ] as const))
    || !text(value.notes)
    || !stringArray(value.proposedHypotheses)
    || (value.humanApprovedFeatureVersion !== undefined && !nonEmptyText(value.humanApprovedFeatureVersion))
    || (value.pathAssessment !== undefined
      && !oneOf(value.pathAssessment, REVIEW_PATH_ASSESSMENTS))
    || (value.verdict !== undefined && !oneOf(value.verdict, [
      'GOOD_DECISION_BAD_OUTCOME',
      'BAD_DECISION_GOOD_OUTCOME',
      'GOOD_DECISION_GOOD_OUTCOME',
      'BAD_DECISION_BAD_OUTCOME',
      'INDETERMINATE',
    ] as const))) {
    return undefined;
  }
  const outcome = normalizeOutcome(value.outcome);
  if (!outcome) return undefined;
  return {
    reviewId: value.reviewId,
    forecastId: value.forecastId,
    reviewedAt: value.reviewedAt,
    outcome,
    errorClasses: [...value.errorClasses] as ReviewRecord['errorClasses'],
    notes: value.notes,
    proposedHypotheses: [...value.proposedHypotheses],
    ...(typeof value.humanApprovedFeatureVersion === 'string'
      ? { humanApprovedFeatureVersion: value.humanApprovedFeatureVersion }
      : {}),
    ...(value.pathAssessment !== undefined ? { pathAssessment: value.pathAssessment } : {}),
    ...(value.verdict !== undefined ? { verdict: value.verdict } : {}),
  };
}

function normalizeReveal(value: unknown): RevealRecord | undefined {
  if (!isObject(value) || !nonEmptyText(value.forecastId) || !isoDate(value.revealedAt)) return undefined;
  return { forecastId: value.forecastId, revealedAt: value.revealedAt };
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freezeDeep(item);
  return Object.freeze(value);
}

function sanitizeEnvelope(value: Record<string, unknown>): PersistenceEnvelope | undefined {
  if (!isObject(value.forecastsByEpisode)
    || !isObject(value.reviewsByForecast)
    || !isObject(value.revealsByEpisode)
    || Object.keys(value.forecastsByEpisode).length > MAX_RECORDS
    || Object.keys(value.reviewsByForecast).length > MAX_RECORDS
    || Object.keys(value.revealsByEpisode).length > MAX_RECORDS) {
    return undefined;
  }
  const envelope = emptyEnvelope();
  for (const [episodeId, rawForecast] of Object.entries(value.forecastsByEpisode)) {
    const forecast = normalizeForecast(rawForecast);
    if (forecast?.episodeId === episodeId) envelope.forecastsByEpisode[episodeId] = forecast;
  }
  for (const [episodeId, rawReveal] of Object.entries(value.revealsByEpisode)) {
    const reveal = normalizeReveal(rawReveal);
    const forecast = envelope.forecastsByEpisode[episodeId];
    if (reveal && forecast?.forecastId === reveal.forecastId
      && Date.parse(reveal.revealedAt) >= Date.parse(forecast.sealedAt)) {
      envelope.revealsByEpisode[episodeId] = reveal;
    }
  }
  const forecastsById = new Map(
    Object.values(envelope.forecastsByEpisode).map((forecast) => [forecast.forecastId, forecast]),
  );
  for (const [forecastId, rawReview] of Object.entries(value.reviewsByForecast)) {
    const review = normalizeReview(rawReview);
    const forecast = forecastsById.get(forecastId);
    const reveal = forecast ? envelope.revealsByEpisode[forecast.episodeId] : undefined;
    if (review?.forecastId === forecastId
      && forecast
      && review.outcome.episodeId === forecast.episodeId
      && review.outcome.forecastAt === forecast.forecastAt
      && reveal?.forecastId === forecastId
      && Date.parse(review.reviewedAt) >= Date.parse(reveal.revealedAt)) {
      envelope.reviewsByForecast[forecastId] = review;
    }
  }
  return envelope;
}

function readEnvelope(storage: SignalLabStorage | null): ParsedEnvelope {
  if (!storage) return { status: 'UNAVAILABLE' };
  let raw: string | null;
  try {
    raw = storage.getItem(SIGNAL_LAB_PERSISTENCE_KEY);
  } catch {
    return { status: 'UNAVAILABLE' };
  }
  if (raw === null) return { status: 'EMPTY', envelope: emptyEnvelope() };
  if (raw.length > MAX_ENVELOPE_BYTES) return { status: 'CORRUPT' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return { status: 'CORRUPT' };
    if (parsed.version !== SIGNAL_LAB_PERSISTENCE_VERSION) return { status: 'UNSUPPORTED' };
    const envelope = sanitizeEnvelope(parsed);
    return envelope ? { status: 'VALID', envelope } : { status: 'CORRUPT' };
  } catch {
    return { status: 'CORRUPT' };
  }
}

function envelopeForWrite(storage: SignalLabStorage | null): PersistenceEnvelope | undefined {
  const parsed = readEnvelope(storage);
  if (parsed.status === 'UNSUPPORTED' || parsed.status === 'UNAVAILABLE') return undefined;
  return parsed.envelope ?? emptyEnvelope();
}

function writeEnvelope(storage: SignalLabStorage | null, envelope: PersistenceEnvelope): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SIGNAL_LAB_PERSISTENCE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function browserStorage(): SignalLabStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSignalLabPersistence(
  storage: SignalLabStorage | null = browserStorage(),
): SignalLabPersistence {
  return {
    getForecast(episodeId) {
      if (!nonEmptyText(episodeId)) return undefined;
      const forecast = readEnvelope(storage).envelope?.forecastsByEpisode[episodeId];
      return forecast ? freezeDeep(forecast) : undefined;
    },

    saveForecast(value) {
      const forecast = normalizeForecast(value);
      if (!forecast) return false;
      const envelope = envelopeForWrite(storage);
      if (!envelope) return false;
      const existing = envelope.forecastsByEpisode[forecast.episodeId];
      if (existing) return sameRecord(existing, forecast);
      if (Object.values(envelope.forecastsByEpisode)
        .some((item) => item.forecastId === forecast.forecastId)) {
        return false;
      }
      envelope.forecastsByEpisode[forecast.episodeId] = forecast;
      return writeEnvelope(storage, envelope);
    },

    getReview(forecastId) {
      if (!nonEmptyText(forecastId)) return undefined;
      const review = readEnvelope(storage).envelope?.reviewsByForecast[forecastId];
      return review ? freezeDeep(review) : undefined;
    },

    saveReview(value) {
      const review = normalizeReview(value);
      if (!review) return false;
      const envelope = envelopeForWrite(storage);
      if (!envelope) return false;
      const forecast = Object.values(envelope.forecastsByEpisode)
        .find((item) => item.forecastId === review.forecastId);
      const reveal = forecast ? envelope.revealsByEpisode[forecast.episodeId] : undefined;
      if (!forecast
        || forecast.episodeId !== review.outcome.episodeId
        || forecast.forecastAt !== review.outcome.forecastAt
        || reveal?.forecastId !== forecast.forecastId
        || Date.parse(review.reviewedAt) < Date.parse(reveal.revealedAt)) {
        return false;
      }
      const existing = envelope.reviewsByForecast[review.forecastId];
      if (existing) return sameRecord(existing, review);
      if (Object.values(envelope.reviewsByForecast)
        .some((item) => item.reviewId === review.reviewId)) {
        return false;
      }
      envelope.reviewsByForecast[review.forecastId] = review;
      return writeEnvelope(storage, envelope);
    },

    isOutcomeRevealed(episodeId) {
      if (!nonEmptyText(episodeId)) return false;
      const envelope = readEnvelope(storage).envelope;
      if (!envelope) return false;
      const reveal = envelope.revealsByEpisode[episodeId];
      return Boolean(reveal
        && envelope.forecastsByEpisode[episodeId]?.forecastId === reveal.forecastId);
    },

    markOutcomeRevealed(episodeId, forecastId, revealedAt = new Date().toISOString()) {
      if (!nonEmptyText(episodeId) || !nonEmptyText(forecastId) || !isoDate(revealedAt)) return false;
      const envelope = envelopeForWrite(storage);
      if (!envelope) return false;
      const forecast = envelope.forecastsByEpisode[episodeId];
      if (!forecast
        || forecast.forecastId !== forecastId
        || Date.parse(revealedAt) < Date.parse(forecast.sealedAt)) {
        return false;
      }
      const existing = envelope.revealsByEpisode[episodeId];
      if (existing) return existing.forecastId === forecastId;
      envelope.revealsByEpisode[episodeId] = { forecastId, revealedAt };
      return writeEnvelope(storage, envelope);
    },
  };
}
