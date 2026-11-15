import {
  AUTONOMOUS_LEARNING_HORIZONS,
  AUTONOMOUS_LEARNING_METHODOLOGY_VERSION,
  AUTONOMOUS_LEARNING_MINIMUM_SAMPLE_SIZE,
  AUTONOMOUS_LEARNING_SCHEMA_VERSION,
  AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION,
  type AutonomousLearningCase,
  type AutonomousLearningOutcome,
  type AutonomousLearningProjection,
  type InstrumentLearningSummary,
  type LearningAssetClass,
  type LearningCalibration,
  type LearningEvidenceSnapshot,
  type LearningHorizon,
  type LearningHorizonOutcome,
  type LearningPosture,
  type LearningPriceBar,
  type ProductBenchmarkTrackingState,
  type LearningSignalStatistics,
  type LearningTradingSession,
  type SimilarLearningCase,
} from './autonomous-learning-contract.ts';

const RISK_POSTURES = new Set<LearningPosture>(['RISK_REDUCE_CANDIDATE', 'AVOID_CANDIDATE']);
const OPPORTUNITY_POSTURES = new Set<LearningPosture>(['OPPORTUNITY_CANDIDATE']);

function epoch(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO timestamp`);
  return parsed;
}

function boundedProbability(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((nested) => deepFreeze(nested));
    Object.freeze(value);
  }
  return value;
}

function latestResolvedObservationAt(outcome: AutonomousLearningOutcome): string | undefined {
  return Object.values(outcome.horizons)
    .flatMap((horizon) => horizon?.observedAt ? [horizon.observedAt] : [])
    .sort()
    .at(-1);
}

export interface CreatePointInTimeCaseInput {
  caseId: string;
  instrumentId: string;
  symbol: string;
  assetClass: LearningAssetClass;
  eventType: string;
  eventAt: string;
  caseCreatedAt: string;
  pointInTimeCutoff: string;
  evidence: readonly LearningEvidenceSnapshot[];
  facts: readonly { text: string; knownAt: string }[];
  signalTags: readonly string[];
  systemPosture: LearningPosture;
  systemConfidence: number;
  systemProbabilities?: { adverse?: number; upside?: number };
  systemReasoningSummary: string;
  counterEvidence?: readonly string[];
  unknowns?: readonly string[];
  changeConditions?: readonly string[];
  horizons?: readonly LearningHorizon[];
  broadMarketComparatorSymbol?: string;
}

/** Runtime gate for durable cases; TypeScript types do not validate Redis JSON. */
export function isCurrentAutonomousLearningCase(value: unknown): value is AutonomousLearningCase {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<AutonomousLearningCase>;
  return candidate.schemaVersion === AUTONOMOUS_LEARNING_SCHEMA_VERSION
    && candidate.methodologyVersion === AUTONOMOUS_LEARNING_METHODOLOGY_VERSION
    && candidate.signalModelVersion === AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION;
}

/** Build the immutable initial record. Evidence learned after cutoff is excluded. */
export function createPointInTimeCase(input: CreatePointInTimeCaseInput): AutonomousLearningCase {
  const cutoffMs = epoch(input.pointInTimeCutoff, 'pointInTimeCutoff');
  if (epoch(input.eventAt, 'eventAt') > cutoffMs) throw new Error('eventAt must not be after pointInTimeCutoff');
  if (epoch(input.caseCreatedAt, 'caseCreatedAt') < cutoffMs) throw new Error('caseCreatedAt must not precede pointInTimeCutoff');
  const evidence = input.evidence.filter((item) => epoch(item.knownAt, 'evidence.knownAt') <= cutoffMs)
    .map((item) => {
      if (!/^[a-f0-9]{64}$/.test(item.snapshotHash)) throw new Error('evidence snapshotHash must be sha256');
      return { ...item, signalTags: uniqueSorted(item.signalTags) };
    });
  const facts = input.facts
    .filter((fact) => epoch(fact.knownAt, 'fact.knownAt') <= cutoffMs)
    .map((fact) => fact.text);
  const horizons = uniqueSorted((input.horizons ?? AUTONOMOUS_LEARNING_HORIZONS).map(String))
    .map(Number)
    .filter((value): value is LearningHorizon => AUTONOMOUS_LEARNING_HORIZONS.includes(value as LearningHorizon));
  if (horizons.length === 0) throw new Error('at least one supported outcome horizon is required');
  boundedProbability(input.systemConfidence, 'systemConfidence');
  if (input.systemProbabilities?.adverse !== undefined) boundedProbability(input.systemProbabilities.adverse, 'adverse probability');
  if (input.systemProbabilities?.upside !== undefined) boundedProbability(input.systemProbabilities.upside, 'upside probability');

  return deepFreeze({
    schemaVersion: AUTONOMOUS_LEARNING_SCHEMA_VERSION,
    caseId: input.caseId,
    instrumentId: input.instrumentId,
    symbol: input.symbol.trim().toUpperCase(),
    assetClass: input.assetClass,
    eventType: input.eventType,
    eventAt: input.eventAt,
    caseCreatedAt: input.caseCreatedAt,
    pointInTimeCutoff: input.pointInTimeCutoff,
    evidenceIds: evidence.map((item) => item.evidenceId),
    evidenceSnapshotHashes: evidence.map((item) => item.snapshotHash),
    evidence,
    facts: uniqueSorted(facts),
    // A signal is eligible only when the retained PIT evidence supports it.
    // This prevents a caller from leaking a future evidence tag into scoring.
    signalTags: uniqueSorted(evidence.flatMap((item) => item.signalTags)
      .filter((signal) => input.signalTags.includes(signal))),
    systemPosture: input.systemPosture,
    systemConfidence: input.systemConfidence,
    ...(input.systemProbabilities ? { systemProbabilities: { ...input.systemProbabilities } } : {}),
    systemReasoningSummary: input.systemReasoningSummary,
    counterEvidence: uniqueSorted(input.counterEvidence ?? []),
    unknowns: uniqueSorted(input.unknowns ?? []),
    changeConditions: uniqueSorted(input.changeConditions ?? []),
    outcomeDefinitions: [{
      kind: 'MARKET_PATH',
      horizons,
      ...(input.broadMarketComparatorSymbol
        ? { broadMarketComparatorSymbol: input.broadMarketComparatorSymbol }
        : {}),
      productBenchmarkTrackingState: input.assetClass === 'ETF' ? 'NOT_WIRED' : 'NOT_APPLICABLE',
    }],
    status: 'OPEN',
    methodologyVersion: AUTONOMOUS_LEARNING_METHODOLOGY_VERSION,
    signalModelVersion: AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION,
  });
}

function returnPercent(entry: number, exit: number): number {
  return round(((exit / entry) - 1) * 100);
}

function annualizedVolatility(path: readonly LearningPriceBar[]): number | undefined {
  if (path.length < 3) return undefined;
  const returns = path.slice(1).map((bar, index) => Math.log(bar.close / path[index]!.close));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return round(Math.sqrt(variance) * Math.sqrt(252));
}

export function resolveLearningOutcome(input: {
  learningCase: AutonomousLearningCase;
  existing?: AutonomousLearningOutcome;
  bars: readonly LearningPriceBar[];
  priceAdjustment?: 'SPLIT_AND_DIVIDEND';
  broadMarketBars?: readonly LearningPriceBar[];
  sessions: readonly LearningTradingSession[];
  evaluatedAt: string;
  followUpSignals?: readonly string[];
}): AutonomousLearningOutcome | null {
  const evaluatedMs = epoch(input.evaluatedAt, 'evaluatedAt');
  const sessions = input.sessions.filter((session) => session.isTradingDay)
    .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  const closeByDate = new Map(sessions.map((session) => [session.tradingDate, epoch(session.closeAt, 'session.closeAt')]));
  const bars = [...input.bars].filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  const cutoffMs = epoch(input.learningCase.pointInTimeCutoff, 'pointInTimeCutoff');
  const entry = bars.filter((bar) => (closeByDate.get(bar.tradingDate) ?? epoch(bar.observedAt, 'bar.observedAt')) <= cutoffMs).at(-1);
  if (!entry) return input.existing ?? null;
  const entrySessionIndex = sessions.findIndex((session) => session.tradingDate === entry.tradingDate);
  if (entrySessionIndex < 0) return input.existing ?? null;
  const barByDate = new Map(bars.map((bar) => [bar.tradingDate, bar]));
  const broadMarketByDate = new Map((input.broadMarketBars ?? []).map((bar) => [bar.tradingDate, bar]));
  const broadMarketEntry = broadMarketByDate.get(entry.tradingDate);
  const definitions = input.learningCase.outcomeDefinitions.flatMap((definition) => definition.horizons);
  const horizons = { ...(input.existing?.horizons ?? {}) };

  for (const horizon of definitions) {
    if (horizons[horizon] && (input.priceAdjustment !== 'SPLIT_AND_DIVIDEND' || horizons[horizon]?.priceAdjustment === input.priceAdjustment)) continue;
    const targetSession = sessions[entrySessionIndex + horizon];
    if (!targetSession || epoch(targetSession.closeAt, 'target close') > evaluatedMs) continue;
    const target = barByDate.get(targetSession.tradingDate);
    if (!target) continue;
    const expectedDates = sessions.slice(entrySessionIndex + 1, entrySessionIndex + horizon + 1)
      .map((session) => session.tradingDate);
    const path = expectedDates.flatMap((date) => barByDate.get(date) ? [barByDate.get(date)!] : []);
    const targetBroadMarket = broadMarketByDate.get(targetSession.tradingDate);
    const absoluteReturnPercent = returnPercent(entry.close, target.close);
    const broadMarketReturnPercent = broadMarketEntry && targetBroadMarket
      ? returnPercent(broadMarketEntry.close, targetBroadMarket.close)
      : undefined;
    const productBenchmarkTrackingState: ProductBenchmarkTrackingState = input.learningCase.assetClass === 'ETF'
      ? 'NOT_WIRED'
      : 'NOT_APPLICABLE';
    const complete = path.length === expectedDates.length;
    const volumes = path.filter((bar) => typeof bar.volume === 'number' && Number.isFinite(bar.volume));
    horizons[horizon] = {
      tradingDays: horizon,
      targetTradingDate: targetSession.tradingDate,
      observedAt: input.evaluatedAt,
      absoluteReturnPercent,
      ...(input.priceAdjustment ? { priceAdjustment: input.priceAdjustment } : {}),
      ...(broadMarketReturnPercent !== undefined ? {
        broadMarketReturnPercent,
        broadMarketRelativeReturnPercent: round(absoluteReturnPercent - broadMarketReturnPercent),
      } : {}),
      productBenchmarkTrackingState,
      ...(complete ? {
        maximumDrawdownPercent: round(Math.min(...path.map((bar) => ((bar.low / entry.close) - 1) * 100))),
        maximumFavorableExcursionPercent: round(Math.max(...path.map((bar) => ((bar.high / entry.close) - 1) * 100))),
        realizedVolatility: annualizedVolatility([entry, ...path]),
      } : {}),
      ...(typeof entry.volume === 'number' && entry.volume > 0 && volumes.length === path.length
        ? { volumeChangePercent: returnPercent(entry.volume, target.volume!) }
        : {}),
      pathCoverage: complete ? 'COMPLETE' : 'PARTIAL',
    };
  }

  const resolvedCount = definitions.filter((horizon) => horizons[horizon]).length;
  const status = resolvedCount === 0 ? 'OPEN' : resolvedCount === definitions.length ? 'RESOLVED' : 'PARTIALLY_RESOLVED';
  return {
    caseId: input.learningCase.caseId,
    entryTradingDate: entry.tradingDate,
    entryObservedAt: entry.observedAt,
    entryPrice: entry.close,
    horizons,
    observedFollowUpSignals: uniqueSorted([
      ...(input.existing?.observedFollowUpSignals ?? []),
      ...(input.followUpSignals ?? []),
    ]),
    lastEvaluatedAt: input.evaluatedAt,
    status,
  };
}

function forecastCorrect(posture: LearningPosture, value: number): boolean | null {
  if (RISK_POSTURES.has(posture)) return value < 0;
  if (OPPORTUNITY_POSTURES.has(posture)) return value > 0;
  return null;
}

export function aggregateLearningSignalStatistics(
  cases: readonly AutonomousLearningCase[],
  outcomes: Readonly<Record<string, AutonomousLearningOutcome>>,
  updatedAt: string,
  minimumSampleSize = AUTONOMOUS_LEARNING_MINIMUM_SAMPLE_SIZE,
): LearningSignalStatistics[] {
  const buckets = new Map<string, Array<{ learningCase: AutonomousLearningCase; outcome: LearningHorizonOutcome }>>();
  for (const learningCase of cases) {
    if (!isCurrentAutonomousLearningCase(learningCase)) continue;
    const outcome = outcomes[learningCase.caseId];
    if (!outcome) continue;
    for (const signal of learningCase.signalTags) {
      for (const horizon of AUTONOMOUS_LEARNING_HORIZONS) {
        const horizonOutcome = outcome.horizons[horizon];
        if (!horizonOutcome) continue;
        const key = `${learningCase.assetClass}\u0000${signal}\u0000${horizon}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push({ learningCase, outcome: horizonOutcome });
        buckets.set(key, bucket);
      }
    }
  }
  return [...buckets.entries()].map(([key, records]) => {
    const [assetClass, signal, horizonRaw] = key.split('\u0000') as [LearningAssetClass, string, string];
    const returns = records.map((record) => record.outcome.absoluteReturnPercent);
    const correctness = records.flatMap((record) => {
      const result = forecastCorrect(record.learningCase.systemPosture, record.outcome.absoluteReturnPercent);
      return result === null ? [] : [result];
    });
    const positiveOutcomeCount = correctness.filter(Boolean).length;
    const negativeOutcomeCount = correctness.length - positiveOutcomeCount;
    const brier = records.flatMap(({ learningCase, outcome }) => {
      const probability = learningCase.systemProbabilities?.adverse;
      return probability === undefined ? [] : [(probability - (outcome.absoluteReturnPercent < 0 ? 1 : 0)) ** 2];
    });
    const observedAccuracy = correctness.length ? positiveOutcomeCount / correctness.length : 0;
    const meanRawConfidence = records.reduce((sum, record) => sum + record.learningCase.systemConfidence, 0) / records.length;
    return {
      signal,
      assetClass,
      horizonTradingDays: Number(horizonRaw) as LearningHorizon,
      sampleCount: records.length,
      resolvedCount: records.length,
      forecastSampleCount: correctness.length,
      positiveOutcomeCount,
      negativeOutcomeCount,
      meanReturnPercent: round(returns.reduce((sum, value) => sum + value, 0) / returns.length),
      medianReturnPercent: round(median(returns)),
      hitRate: round(correctness.length ? observedAccuracy : 0),
      ...(brier.length ? { meanBrierScore: round(brier.reduce((sum, value) => sum + value, 0) / brier.length) } : {}),
      meanRawConfidence: round(meanRawConfidence),
      observedAccuracy: round(observedAccuracy),
      calibrationGap: round(observedAccuracy - meanRawConfidence),
      minimumSampleSize,
      // Mean-return observations still remain available below, but a public
      // hit-rate/calibration claim requires enough directionally scoreable
      // postures. INVESTIGATE/WATCH are not silently treated as misses.
      displayEligible: correctness.length >= minimumSampleSize,
      lastUpdatedAt: updatedAt,
      methodologyVersion: AUTONOMOUS_LEARNING_METHODOLOGY_VERSION,
    };
  }).sort((left, right) => left.signal.localeCompare(right.signal)
    || left.assetClass.localeCompare(right.assetClass)
    || left.horizonTradingDays - right.horizonTradingDays);
}

export function findSimilarLearningCases(
  target: Pick<AutonomousLearningCase,
    'schemaVersion' | 'methodologyVersion' | 'signalModelVersion'
    | 'caseId' | 'assetClass' | 'eventAt' | 'signalTags'>,
  cases: readonly AutonomousLearningCase[],
  outcomes: Readonly<Record<string, AutonomousLearningOutcome>>,
  limit = 20,
): SimilarLearningCase[] {
  if (!isCurrentAutonomousLearningCase(target)) return [];
  const targetSignals = new Set(target.signalTags);
  return cases.flatMap((candidate): SimilarLearningCase[] => {
    if (!isCurrentAutonomousLearningCase(candidate)
      || candidate.caseId === target.caseId || candidate.assetClass !== target.assetClass
      || candidate.eventAt >= target.eventAt || outcomes[candidate.caseId]?.status !== 'RESOLVED') return [];
    const sharedSignals = candidate.signalTags.filter((signal) => targetSignals.has(signal));
    if (sharedSignals.length === 0) return [];
    const union = new Set([...candidate.signalTags, ...target.signalTags]).size;
    return [{
      caseId: candidate.caseId,
      symbol: candidate.symbol,
      eventType: candidate.eventType,
      eventAt: candidate.eventAt,
      sharedSignals: uniqueSorted(sharedSignals),
      similarity: round(sharedSignals.length / union),
      outcome: outcomes[candidate.caseId]?.horizons[20]
        ?? outcomes[candidate.caseId]?.horizons[5]
        ?? outcomes[candidate.caseId]?.horizons[1],
    }];
  }).sort((left, right) => right.similarity - left.similarity || right.eventAt.localeCompare(left.eventAt))
    .slice(0, Math.max(0, Math.min(500, Math.floor(limit))));
}

export function calibrateLearningConfidence(
  rawConfidence: number,
  statistics: readonly LearningSignalStatistics[],
  minimumSampleSize = AUTONOMOUS_LEARNING_MINIMUM_SAMPLE_SIZE,
): LearningCalibration {
  boundedProbability(rawConfidence, 'rawConfidence');
  const eligible = statistics.filter((stat) => stat.displayEligible && stat.forecastSampleCount >= minimumSampleSize);
  // Signal buckets can contain the same resolved case at several horizons.
  // Report a conservative case-equivalent n instead of inflating n by adding
  // duplicated signal/horizon observations.
  const sampleCount = eligible.reduce((largest, stat) => Math.max(largest, stat.forecastSampleCount), 0);
  if (sampleCount === 0) return { rawConfidence, adjustedConfidence: rawConfidence, sampleCount: 0, applied: false, minimumSampleSize };
  const observationCount = eligible.reduce((sum, stat) => sum + stat.forecastSampleCount, 0);
  const observedAccuracy = eligible.reduce((sum, stat) => sum + stat.observedAccuracy * stat.forecastSampleCount, 0) / observationCount;
  return {
    rawConfidence,
    adjustedConfidence: round((rawConfidence + observedAccuracy) / 2),
    observedAccuracy: round(observedAccuracy),
    sampleCount,
    applied: true,
    minimumSampleSize,
  };
}

export function buildInstrumentLearningSummary(input: {
  target: AutonomousLearningCase;
  cases: readonly AutonomousLearningCase[];
  outcomes: Readonly<Record<string, AutonomousLearningOutcome>>;
  statistics: readonly LearningSignalStatistics[];
  generatedAt: string;
}): InstrumentLearningSummary {
  const relevant = input.statistics.filter((stat) => stat.assetClass === input.target.assetClass
    && input.target.signalTags.includes(stat.signal));
  const strongestSignals = relevant.filter((stat) => stat.displayEligible && stat.hitRate >= 0.6)
    .sort((left, right) => right.hitRate - left.hitRate || right.sampleCount - left.sampleCount).slice(0, 4);
  const misleadingSignals = relevant.filter((stat) => stat.displayEligible && stat.hitRate < 0.5)
    .sort((left, right) => left.hitRate - right.hitRate || right.sampleCount - left.sampleCount).slice(0, 4);
  const allSimilarCases = findSimilarLearningCases(input.target, input.cases, input.outcomes, input.cases.length);
  const lastOutcomeUpdate = Object.values(input.outcomes)
    .filter((outcome) => input.cases.find((candidate) => candidate.caseId === outcome.caseId)?.symbol === input.target.symbol)
    .flatMap((outcome) => latestResolvedObservationAt(outcome) ?? [])
    .sort()
    .at(-1);
  return {
    symbol: input.target.symbol,
    generatedAt: input.generatedAt,
    basisSignals: input.target.signalTags,
    similarCaseCount: allSimilarCases.length,
    similarCases: allSimilarCases.slice(0, 20),
    strongestSignals,
    misleadingSignals,
    knownFailurePatterns: misleadingSignals.map((stat) => `${stat.signal}: only ${(stat.hitRate * 100).toFixed(0)}% aligned at ${stat.horizonTradingDays}d (n=${stat.forecastSampleCount})`),
    calibration: calibrateLearningConfidence(input.target.systemConfidence, relevant),
    ...(lastOutcomeUpdate ? { lastOutcomeUpdate } : {}),
  };
}

export function buildAutonomousLearningProjection(input: {
  cases: readonly AutonomousLearningCase[];
  outcomes: Readonly<Record<string, AutonomousLearningOutcome>>;
  generatedAt: string;
}): AutonomousLearningProjection {
  const cases = input.cases.filter(isCurrentAutonomousLearningCase);
  const caseIds = new Set(cases.map((learningCase) => learningCase.caseId));
  const outcomes = Object.fromEntries(
    Object.entries(input.outcomes).filter(([caseId]) => caseIds.has(caseId)),
  );
  const statistics = aggregateLearningSignalStatistics(cases, outcomes, input.generatedAt);
  const bySymbol: Record<string, InstrumentLearningSummary> = {};
  for (const learningCase of [...cases].sort((left, right) => left.eventAt.localeCompare(right.eventAt))) {
    bySymbol[learningCase.symbol] = buildInstrumentLearningSummary({
      target: learningCase, cases, outcomes, statistics, generatedAt: input.generatedAt,
    });
  }
  const eligible = statistics.filter((stat) => stat.displayEligible)
    .sort((left, right) => Math.abs(right.hitRate - 0.5) - Math.abs(left.hitRate - 0.5) || right.sampleCount - left.sampleCount);
  const globalLessons = eligible.slice(0, 5).map((stat) => (
    `${stat.signal}: ${stat.horizonTradingDays}d mean ${stat.meanReturnPercent.toFixed(2)}%, hit ${(stat.hitRate * 100).toFixed(0)}% (n=${stat.forecastSampleCount})`
  ));
  const lastOutcomeUpdate = Object.values(outcomes)
    .flatMap((outcome) => latestResolvedObservationAt(outcome) ?? [])
    .sort()
    .at(-1);
  return {
    schemaVersion: AUTONOMOUS_LEARNING_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    automatic: true,
    methodologyVersion: AUTONOMOUS_LEARNING_METHODOLOGY_VERSION,
    signalModelVersion: AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION,
    minimumSampleSize: AUTONOMOUS_LEARNING_MINIMUM_SAMPLE_SIZE,
    caseCount: cases.length,
    resolvedCaseCount: Object.values(outcomes).filter((outcome) => outcome.status === 'RESOLVED').length,
    ...(lastOutcomeUpdate ? { lastOutcomeUpdate } : {}),
    globalLessons,
    signalStatistics: statistics,
    bySymbol,
  };
}
