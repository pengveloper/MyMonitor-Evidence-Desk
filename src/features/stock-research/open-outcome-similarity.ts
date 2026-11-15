import type {
  OpenOutcomeContextPack,
  OpenOutcomeDailyPathContext,
  OpenOutcomeDailyPathHorizonContext,
  SimilarOutcomeStatistics,
} from './open-history-contract.ts';
import {
  contextKnownAt,
  type ReplayState,
} from './signal-lab-core.ts';
import type {
  EventEpisode,
  MissingDataNotice,
  OutcomeHorizonTradingDays,
  OutcomeLabel,
  TechnicalContext,
} from './signal-lab-contract.ts';

const DEFAULT_LIMIT = 20;
export const DEFAULT_OPEN_OUTCOME_MINIMUM_SAMPLE_SIZE = 10;

const TECHNICAL_FEATURE_KEYS = [
  'returnPercent',
  'gapPercent',
  'relativeVolume',
  'vwap',
  'distanceFromVwapPercent',
  'realizedVolatility',
  'atr',
  'emaSlope',
  'rsi',
  'macd',
  'macdSignal',
  'bollingerPosition',
  'distanceFromRecentHighPercent',
  'distanceFromRecentLowPercent',
  'volumeAcceleration',
  'priceAcceleration',
  'marketRelativeStrength',
  'sectorRelativeStrength',
] as const satisfies readonly (keyof TechnicalContext)[];

const PRICE_FEATURE_KEYS = [
  'gapPercent',
  'relativeVolume',
  'liquidityUsd',
  'spreadPercent',
] as const;

export interface OpenOutcomeFeatureContribution {
  feature: string;
  targetValue: number;
  candidateValue: number;
  normalizedDifference: number;
  squaredDistanceContribution: number;
}

export interface RankedOpenOutcomeEpisode {
  episode: EventEpisode;
  outcome: OutcomeLabel;
  similarity: number;
  matchedFeatureCount: number;
  featureContributions: readonly OpenOutcomeFeatureContribution[];
  featureDistance: number;
  marketRegimePenalty: number;
  missingContextPenalty: number;
}

export interface OpenOutcomeSimilarityEvaluation {
  ranked: RankedOpenOutcomeEpisode[];
  matchedEventFamily: string;
  eligibleSampleCount: number;
  excludedFamilyMismatch: number;
  excludedNoMatchedFeature: number;
}

type OpenOutcomeSimilarityDiagnostics = Pick<
  OpenOutcomeSimilarityEvaluation,
  'matchedEventFamily' | 'excludedFamilyMismatch' | 'excludedNoMatchedFeature'
>;

interface PreparedEpisode {
  episode: EventEpisode;
  pointInTimeCutoff: string;
  features: Readonly<Record<string, number>>;
  marketRegime?: string;
  missingContextCount: number;
}

function epoch(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function pointInTimeCutoff(episode: EventEpisode): string {
  const eventStartMs = epoch(episode.eventStart, 'episode.eventStart');
  const requested = episode.contextSnapshot.replayCutoffAt;
  if (!requested) return episode.eventStart;
  return epoch(requested, 'contextSnapshot.replayCutoffAt') <= eventStartMs
    ? requested
    : episode.eventStart;
}

function addFiniteFeature(features: Record<string, number>, key: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) features[key] = value;
}

/**
 * Extract only values from the episode's point-in-time context. Outcome fields,
 * future bars, later filings, and later market revisions are never read here.
 */
export function extractOpenOutcomeSimilarityFeatures(
  episode: EventEpisode,
): Readonly<Record<string, number>> {
  const cutoff = pointInTimeCutoff(episode);
  const context = contextKnownAt(episode.contextSnapshot, cutoff);
  const features: Record<string, number> = {};

  for (const key of PRICE_FEATURE_KEYS) {
    addFiniteFeature(features, `price.${key}`, context.price[key]);
  }
  const latestByInterval = new Map<TechnicalContext['inputInterval'], TechnicalContext>();
  for (const technical of context.technical) {
    const existing = latestByInterval.get(technical.inputInterval);
    if (!existing || epoch(technical.inputThrough, 'technical.inputThrough')
      > epoch(existing.inputThrough, 'technical.inputThrough')) {
      latestByInterval.set(technical.inputInterval, technical);
    }
  }
  for (const [interval, technical] of [...latestByInterval.entries()]
    .sort(([left], [right]) => left.localeCompare(right))) {
    for (const key of TECHNICAL_FEATURE_KEYS) {
      addFiniteFeature(features, `technical.${interval}.${key}`, technical[key]);
    }
  }
  return Object.freeze(features);
}

function prepareEpisode(episode: EventEpisode): PreparedEpisode {
  const cutoff = pointInTimeCutoff(episode);
  const context = contextKnownAt(episode.contextSnapshot, cutoff);
  return {
    episode,
    pointInTimeCutoff: cutoff,
    features: extractOpenOutcomeSimilarityFeatures(episode),
    ...(context.market.regime ? { marketRegime: context.market.regime } : {}),
    missingContextCount: episode.missingData.length + context.missingData.length,
  };
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(0, Math.floor(limit));
}

/**
 * The first detection reason is the episode's selection/event family. Replay
 * targets use an exact suffix so they can be compared with earlier episodes
 * from the same family without weakening any other family boundary.
 */
export function canonicalOpenOutcomeEventFamily(episode: EventEpisode): string {
  return (episode.detectionReason[0] ?? '').replace(/_REPLAY_TARGET$/, '');
}

function rankCandidate(
  preparedTarget: PreparedEpisode,
  candidate: EventEpisode & { outcome: OutcomeLabel },
): RankedOpenOutcomeEpisode {
  const preparedCandidate = prepareEpisode(candidate);
  const featureContributions = Object.keys(preparedTarget.features)
    .filter((key) => Number.isFinite(preparedCandidate.features[key]))
    .sort()
    .map((feature): OpenOutcomeFeatureContribution => {
      const targetValue = preparedTarget.features[feature]!;
      const candidateValue = preparedCandidate.features[feature]!;
      const scale = Math.max(1, Math.abs(targetValue), Math.abs(candidateValue));
      const normalizedDifference = Math.abs(targetValue - candidateValue) / scale;
      return {
        feature,
        targetValue,
        candidateValue,
        normalizedDifference,
        squaredDistanceContribution: normalizedDifference ** 2,
      };
    });
  const featureDistance = featureContributions.length
    ? Math.sqrt(
      featureContributions.reduce((sum, item) => sum + item.squaredDistanceContribution, 0)
      / featureContributions.length,
    )
    : 1;
  const marketRegimePenalty = preparedTarget.marketRegime
    && preparedCandidate.marketRegime
    && preparedTarget.marketRegime !== preparedCandidate.marketRegime
    ? 0.15
    : 0;
  const missingContextPenalty = Math.min(0.35, preparedCandidate.missingContextCount * 0.025);
  return {
    episode: candidate,
    outcome: candidate.outcome,
    similarity: Math.max(
      0,
      Math.min(1, 1 - featureDistance - marketRegimePenalty - missingContextPenalty),
    ),
    matchedFeatureCount: featureContributions.length,
    featureContributions,
    featureDistance,
    marketRegimePenalty,
    missingContextPenalty,
  };
}

/**
 * Evaluate completed earlier episodes, then admit only same-family candidates
 * with at least one comparable point-in-time feature. Exclusion diagnostics are
 * counted only after the existing identity, coverage, PIT, and outcome guards.
 */
export function evaluateOpenOutcomeSimilarity(
  target: EventEpisode,
  candidates: readonly EventEpisode[],
  limit = DEFAULT_LIMIT,
): OpenOutcomeSimilarityEvaluation {
  const preparedTarget = prepareEpisode(target);
  const targetEventMs = epoch(target.eventStart, 'target.eventStart');
  const matchedEventFamily = canonicalOpenOutcomeEventFamily(target);
  const baselineCandidates = candidates.filter((candidate): candidate is EventEpisode & {
    outcome: OutcomeLabel;
  } => (
    candidate.episodeId !== target.episodeId
    && candidate.dataCoverage === target.dataCoverage
    && epoch(candidate.eventStart, 'candidate.eventStart') < targetEventMs
    && candidate.outcome !== undefined
  ));
  const eligible: RankedOpenOutcomeEpisode[] = [];
  let excludedFamilyMismatch = 0;
  let excludedNoMatchedFeature = 0;

  for (const candidate of baselineCandidates) {
    if (!matchedEventFamily
      || canonicalOpenOutcomeEventFamily(candidate) !== matchedEventFamily) {
      excludedFamilyMismatch += 1;
      continue;
    }
    const ranked = rankCandidate(preparedTarget, candidate);
    if (ranked.matchedFeatureCount < 1) {
      excludedNoMatchedFeature += 1;
      continue;
    }
    eligible.push(ranked);
  }

  const ranked = eligible
    .sort((left, right) => (
      right.similarity - left.similarity
      || right.matchedFeatureCount - left.matchedFeatureCount
      || left.episode.episodeId.localeCompare(right.episode.episodeId)
    ))
    .slice(0, boundedLimit(limit));

  return {
    ranked,
    matchedEventFamily,
    eligibleSampleCount: ranked.length,
    excludedFamilyMismatch,
    excludedNoMatchedFeature,
  };
}

/**
 * Rank completed earlier episodes using only event-time features. Candidate
 * outcomes are carried for retrospective statistics but never enter distance,
 * penalties, or ordering.
 */
export function rankOpenOutcomeEpisodes(
  target: EventEpisode,
  candidates: readonly EventEpisode[],
  limit = DEFAULT_LIMIT,
): RankedOpenOutcomeEpisode[] {
  return evaluateOpenOutcomeSimilarity(target, candidates, limit).ranked;
}

function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function horizonReturn(
  outcome: OutcomeLabel,
  horizon: OutcomeHorizonTradingDays,
): number | undefined {
  const structured = outcome.tradingDayOutcomes?.[horizon]?.absoluteReturnPercent;
  if (structured !== undefined && Number.isFinite(structured)) return structured;
  const legacy = outcome.returnsByTradingDays?.[horizon];
  if (legacy !== undefined && Number.isFinite(legacy)) return legacy;
  if (horizon === 1
    && outcome.nextTradingDayReturnPercent !== undefined
    && Number.isFinite(outcome.nextTradingDayReturnPercent)) {
    return outcome.nextTradingDayReturnPercent;
  }
  return undefined;
}

function horizonExcursion(
  outcome: OutcomeLabel,
  horizon: 5 | 20,
  kind: 'mfePercent' | 'maePercent',
): number | undefined {
  const structured = outcome.tradingDayOutcomes?.[horizon];
  if (!structured
    || structured.coverage !== 'COMPLETE'
    || structured.coverageStatus !== 'COMPLETE'
    || structured.usableSessionCount !== horizon
    || structured.expectedSessionCount !== horizon) {
    return undefined;
  }
  const value = structured[kind];
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function countEpisodeMissingData(episode: EventEpisode): number {
  const outcome = episode.outcome;
  return episode.missingData.length
    + episode.contextSnapshot.missingData.length
    + (outcome?.missingData.length ?? 0)
    + Object.values(outcome?.tradingDayOutcomes ?? {})
      .reduce((sum, item) => sum + (item?.missingData.length ?? 0), 0);
}

function metricWhenSufficient(
  values: readonly number[],
  minimumSampleSize: number,
  calculate: (values: readonly number[]) => number | undefined,
): number | undefined {
  return values.length >= minimumSampleSize ? calculate(values) : undefined;
}

/** Metrics remain hidden until their own usable sample reaches the threshold. */
export function summarizeOpenOutcomeEpisodes(
  episodes: readonly EventEpisode[],
  minimumSampleSize = DEFAULT_OPEN_OUTCOME_MINIMUM_SAMPLE_SIZE,
  diagnostics?: OpenOutcomeSimilarityDiagnostics,
): SimilarOutcomeStatistics {
  if (!Number.isInteger(minimumSampleSize) || minimumSampleSize <= 0) {
    throw new Error('minimumSampleSize must be a positive integer');
  }
  const outcomes = episodes.flatMap((episode) => episode.outcome ? [episode.outcome] : []);
  const nextDay = outcomes.flatMap((item) => {
    const value = horizonReturn(item, 1);
    return value === undefined ? [] : [value];
  });
  const fiveDay = outcomes.flatMap((item) => {
    const value = horizonReturn(item, 5);
    return value === undefined ? [] : [value];
  });
  const twentyDay = outcomes.flatMap((item) => {
    const value = horizonReturn(item, 20);
    return value === undefined ? [] : [value];
  });
  const fiveDayMfe = outcomes.flatMap((item) => {
    const value = horizonExcursion(item, 5, 'mfePercent');
    return value === undefined ? [] : [value];
  });
  const fiveDayMae = outcomes.flatMap((item) => {
    const value = horizonExcursion(item, 5, 'maePercent');
    return value === undefined ? [] : [value];
  });
  const twentyDayMfe = outcomes.flatMap((item) => {
    const value = horizonExcursion(item, 20, 'mfePercent');
    return value === undefined ? [] : [value];
  });
  const twentyDayMae = outcomes.flatMap((item) => {
    const value = horizonExcursion(item, 20, 'maePercent');
    return value === undefined ? [] : [value];
  });
  const eligibleSampleCount = outcomes.length;
  const sufficient = eligibleSampleCount >= minimumSampleSize;
  const nextDayPositivePercent = sufficient
    ? metricWhenSufficient(
      nextDay,
      minimumSampleSize,
      (values) => (values.filter((value) => value > 0).length / values.length) * 100,
    )
    : undefined;
  const result: SimilarOutcomeStatistics = {
    status: sufficient ? 'AVAILABLE' : 'INSUFFICIENT_SAMPLE',
    minimumSampleSize,
    sampleSize: episodes.length,
    outcomeSampleSize: outcomes.length,
    eligibleSampleCount,
    ...(diagnostics?.matchedEventFamily
      ? { matchedEventFamily: diagnostics.matchedEventFamily }
      : {}),
    excludedFamilyMismatch: diagnostics?.excludedFamilyMismatch ?? 0,
    excludedNoMatchedFeature: diagnostics?.excludedNoMatchedFeature ?? 0,
    usableSampleSize: {
      nextDayReturn: nextDay.length,
      fiveDayReturn: fiveDay.length,
      twentyDayReturn: twentyDay.length,
      fiveDayMfe: fiveDayMfe.length,
      fiveDayMae: fiveDayMae.length,
      twentyDayMfe: twentyDayMfe.length,
      twentyDayMae: twentyDayMae.length,
    },
    ...(nextDayPositivePercent !== undefined ? { nextDayPositivePercent } : {}),
    ...(sufficient && metricWhenSufficient(nextDay, minimumSampleSize, median) !== undefined
      ? { medianNextDayReturnPercent: metricWhenSufficient(nextDay, minimumSampleSize, median) }
      : {}),
    ...(sufficient && metricWhenSufficient(fiveDay, minimumSampleSize, median) !== undefined
      ? { median5DayReturnPercent: metricWhenSufficient(fiveDay, minimumSampleSize, median) }
      : {}),
    ...(sufficient && metricWhenSufficient(twentyDay, minimumSampleSize, median) !== undefined
      ? { median20DayReturnPercent: metricWhenSufficient(twentyDay, minimumSampleSize, median) }
      : {}),
    ...(sufficient && metricWhenSufficient(fiveDayMfe, minimumSampleSize, median) !== undefined
      ? { median5DayMfePercent: metricWhenSufficient(fiveDayMfe, minimumSampleSize, median) }
      : {}),
    ...(sufficient && metricWhenSufficient(fiveDayMae, minimumSampleSize, median) !== undefined
      ? { median5DayMaePercent: metricWhenSufficient(fiveDayMae, minimumSampleSize, median) }
      : {}),
    ...(sufficient && metricWhenSufficient(twentyDayMfe, minimumSampleSize, median) !== undefined
      ? { median20DayMfePercent: metricWhenSufficient(twentyDayMfe, minimumSampleSize, median) }
      : {}),
    ...(sufficient && metricWhenSufficient(twentyDayMae, minimumSampleSize, median) !== undefined
      ? { median20DayMaePercent: metricWhenSufficient(twentyDayMae, minimumSampleSize, median) }
      : {}),
    missingDataCount: episodes.reduce((sum, episode) => sum + countEpisodeMissingData(episode), 0),
  };
  return result;
}

function sanitizedEpisode(episode: EventEpisode): EventEpisode {
  const cutoff = pointInTimeCutoff(episode);
  return {
    ...episode,
    contextSnapshot: contextKnownAt(episode.contextSnapshot, cutoff),
  };
}

function combinedMissingData(
  target: EventEpisode,
  similarEpisodes: readonly EventEpisode[],
): MissingDataNotice[] {
  const notices: MissingDataNotice[] = [];
  const add = (prefix: string, items: readonly MissingDataNotice[]) => {
    for (const item of items) notices.push({ ...item, field: `${prefix}.${item.field}` });
  };
  const addEpisode = (prefix: string, episode: EventEpisode) => {
    add(prefix, episode.missingData);
    add(`${prefix}.context`, episode.contextSnapshot.missingData);
    if (episode.outcome) {
      add(`${prefix}.outcome`, episode.outcome.missingData);
      for (const [horizon, result] of Object.entries(episode.outcome.tradingDayOutcomes ?? {})) {
        if (result) add(`${prefix}.outcome.${horizon}d`, result.missingData);
      }
    }
  };
  addEpisode('target', target);
  for (const episode of similarEpisodes) addEpisode(`similar.${episode.episodeId}`, episode);
  const seen = new Set<string>();
  return notices.filter((item) => {
    const key = `${item.field}\u0000${item.reason}\u0000${item.detail ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dailyPathContext(episode: EventEpisode): OpenOutcomeDailyPathContext {
  const horizons: OpenOutcomeDailyPathContext['horizons'] = {};
  for (const horizon of [5, 20] as const) {
    const result = episode.outcome?.tradingDayOutcomes?.[horizon];
    if (!result
      || result.tradingDays !== horizon
      || !Number.isInteger(result.usableSessionCount)
      || result.usableSessionCount < 0
      || result.usableSessionCount > horizon
      || result.expectedSessionCount !== horizon) {
      continue;
    }
    const coherentCoverage = result.coverageStatus === 'COMPLETE'
      ? result.usableSessionCount === horizon
      : result.coverageStatus === 'PARTIAL'
        ? result.usableSessionCount > 0 && result.usableSessionCount < horizon
        : result.coverageStatus === 'INSUFFICIENT_SAMPLE'
          && result.usableSessionCount === 0;
    if (!coherentCoverage) continue;
    const completePath = result.coverageStatus === 'COMPLETE';
    const context = {
      tradingDays: horizon,
      ...(Number.isFinite(result.absoluteReturnPercent)
        ? { absoluteReturnPercent: result.absoluteReturnPercent }
        : {}),
      ...(completePath && Number.isFinite(result.mfePercent)
        ? { mfePercent: result.mfePercent }
        : {}),
      ...(completePath && Number.isFinite(result.maePercent)
        ? { maePercent: result.maePercent }
        : {}),
      usableSessionCount: result.usableSessionCount,
      expectedSessionCount: horizon,
      coverageStatus: result.coverageStatus,
    } satisfies OpenOutcomeDailyPathHorizonContext;
    horizons[horizon] = context;
  }
  return { episodeId: episode.episodeId, horizons };
}

export function buildOpenOutcomeContextPack(options: {
  target: EventEpisode;
  candidates: readonly EventEpisode[];
  replay: ReplayState;
  generatedAt?: string;
  limit?: number;
  minimumSampleSize?: number;
}): OpenOutcomeContextPack {
  if (!options.replay.revealed || !options.replay.forecast) {
    throw new Error('context pack requires a sealed forecast and revealed outcome');
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  epoch(generatedAt, 'generatedAt');
  const cutoff = pointInTimeCutoff(options.target);
  if (options.replay.episodeId !== options.target.episodeId
    || options.replay.cursorAt !== cutoff
    || options.replay.forecast.episodeId !== options.target.episodeId
    || options.replay.forecast.forecastAt !== cutoff) {
    throw new Error('context pack replay state does not match the target cutoff');
  }
  const evaluation = evaluateOpenOutcomeSimilarity(
    options.target,
    options.candidates,
    options.limit,
  );
  const target = sanitizedEpisode(options.target);
  const similarEpisodes = evaluation.ranked.map((item) => sanitizedEpisode(item.episode));
  return {
    schemaVersion: 'open-outcome-context/v1',
    generatedAt,
    sealedForecast: options.replay.forecast,
    target,
    similarEpisodes,
    similarStatistics: summarizeOpenOutcomeEpisodes(
      similarEpisodes,
      options.minimumSampleSize,
      evaluation,
    ),
    dailyPath: {
      target: dailyPathContext(target),
      similar: similarEpisodes.map(dailyPathContext),
    },
    ...(target.contextSnapshot.market.regime
      ? { marketRegime: target.contextSnapshot.market.regime }
      : {}),
    filingEvidence: target.contextSnapshot.filings,
    missingData: combinedMissingData(target, similarEpisodes),
    guardrails: {
      automatedTradingDecision: false,
      pointInTimeCutoff: cutoff,
      targetFutureExcludedFromSimilarity: true,
    },
  };
}
