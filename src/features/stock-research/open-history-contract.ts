import type { BarInterval, OHLCVBar } from '../../../shared/market-data/contracts.ts';
import type {
  EventEpisode,
  ForecastRecord,
  KnowledgeTime,
  MissingDataNotice,
  OutcomeHorizonTradingDays,
  OutcomePathCoverageStatus,
  SignalLabProvenance,
} from './signal-lab-contract.ts';

export const OPEN_HISTORY_SAMPLE_SCHEMA_VERSION = 'open-history-sample/v1' as const;
export const OPEN_HISTORY_DAILY_EXPANSION_SCHEMA_VERSION =
  'open-history-daily-expansion/v1' as const;
export const OPEN_HISTORY_DECISION_RULE_VERSION =
  'open-history-first-passage-up-5-down-3/v1' as const;
export const OPEN_OUTCOME_SCHEMA_VERSION = 'open-outcome/v1' as const;
export const OPEN_OUTCOME_DAILY_PATH_SELECTION_SCHEMA_VERSION =
  'open-outcome-daily-path-selection/v1' as const;

export interface OpenHistorySampleArtifact {
  schemaVersion: typeof OPEN_HISTORY_SAMPLE_SCHEMA_VERSION;
  generatedAt: string;
  sourceId: string;
  sourceUrl: string;
  sourceTermsUrl: string;
  sourceAttribution: string;
  sourceSha256: string;
  sourceByteCount: number;
  sourceTradingDate: string;
  sourceScope: string;
  retainedRawSource: false;
  selectedSymbols: string[];
  bars: OHLCVBar[];
  episodes: EventEpisode[];
  limitations: string[];
}

export type OpenHistorySelectionBasis = 'EVENT_FIRST' | 'PRICE_FIRST';

export type OpenHistoryLineageStatus =
  | 'EXACT_EVENT_TIME'
  | 'CURRENT_ASSOCIATION_ONLY'
  | 'MISSING'
  | 'AMBIGUOUS_CONFLICT';

export type OpenHistoryLineageBasis =
  | 'SOURCE_NATIVE_EVENT_TIME_SYMBOL'
  | 'OFFICIAL_EVENT_TIME_ISSUER_EVIDENCE'
  | 'CURRENT_ASSOCIATION'
  | 'NONE'
  | 'CONFLICTING_EVIDENCE';

export type OpenHistoryPriceStatus =
  | 'AVAILABLE'
  | 'REFERENCE_BAR_MISSING'
  | 'EVENT_WINDOW_UNALIGNED'
  | 'OUTCOME_WINDOW_INCOMPLETE';

export type OpenHistoryDistressStatus = 'DISTRESS' | 'NON_DISTRESS' | 'UNKNOWN';

export type OpenHistoryBarrierOrdering =
  | 'UPSIDE_FIRST'
  | 'DOWNSIDE_FIRST'
  | 'SAME_BAR'
  | 'NEITHER'
  | 'UNKNOWN';

export type OpenHistoryResolutionStatus =
  | 'CHANGED'
  | 'UNCHANGED'
  | 'DAILY_AMBIGUITY_RESOLVED'
  | 'UNKNOWN';

export type OpenHistoryPaidDataReason =
  | 'DAILY_REFERENCE_PRICE'
  | 'DAILY_OUTCOME_WINDOW'
  | 'POST_EVENT_REFERENCE_WINDOW'
  | 'INTRADAY_RESOLUTION';

export interface OpenHistoryExpansionBounds {
  maxSourceBytes: number;
  maxCandidates: number;
  maxEpisodes: number;
  maxIntradayComparisons: number;
}

export interface OpenHistoryExpansionPolicy {
  canonicalIngestSafety: 'GREEN_ONLY';
  retainedRawSource: false;
  selectionOrder: 'DETERMINISTIC_RULE_WITH_LEXICOGRAPHIC_TIEBREAK';
  decisionRuleVersion: typeof OPEN_HISTORY_DECISION_RULE_VERSION;
}

export interface OpenHistoryCohortDefinition {
  cohortId: string;
  selectionBasis: OpenHistorySelectionBasis;
  description: string;
  sourceIds: string[];
}

export interface OpenHistoryAcquisitionReceipt {
  receiptId: string;
  sourceId: string;
  sourceUrl: string;
  termsUrl: string;
  sha256: string;
  byteCount: number;
  fetchedAt: string;
  retainedRawSource: false;
  scope: string;
}

/**
 * Candidate/audit records precede EventEpisode admission. This prevents a current
 * ticker association or missing price observation from being promoted to history.
 */
export interface OpenHistoryEventCandidate {
  candidateId: string;
  cohortId: string;
  selectionBasis: OpenHistorySelectionBasis;
  sourceId: string;
  eventKind: string;
  eventKnowledgeTime: KnowledgeTime;
  cik?: string;
  issuerName?: string;
  observedSymbol?: string;
  instrumentId?: string;
  tickerAtEventTime?: string;
  lineageStatus: OpenHistoryLineageStatus;
  lineageBasis: OpenHistoryLineageBasis;
  priceStatus: OpenHistoryPriceStatus;
  distressStatus: OpenHistoryDistressStatus;
  admittedEpisodeId?: string;
  rejectionReasons: string[];
  provenance: SignalLabProvenance[];
}

export interface OpenHistoryResolutionComparison {
  comparisonId: string;
  candidateId: string;
  cohortId: string;
  instrumentId: string;
  sourceId: string;
  windowStart: string;
  windowEnd: string;
  referencePrice: number;
  decisionRuleVersion: typeof OPEN_HISTORY_DECISION_RULE_VERSION;
  dailyOrdering: OpenHistoryBarrierOrdering;
  intradayOrdering: OpenHistoryBarrierOrdering;
  status: OpenHistoryResolutionStatus;
}

export interface OpenHistoryRateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface OpenHistoryCohortMetrics {
  cohortId: string;
  selectionBasis: OpenHistorySelectionBasis;
  candidateCount: number;
  admittedEpisodeCount: number;
  priceBlocked: OpenHistoryRateMetric;
  eventWindowUnaligned: OpenHistoryRateMetric;
  outcomeWindowIncomplete: OpenHistoryRateMetric;
  lineageBlocked: OpenHistoryRateMetric;
  lineageCounts: Record<OpenHistoryLineageStatus, number>;
  distressAdmission: OpenHistoryRateMetric;
  nonDistressAdmission: OpenHistoryRateMetric;
  distressAdmissionRateDelta: number | null;
}

export interface OpenHistoryResolutionMetrics {
  comparisonCount: number;
  comparableCount: number;
  changedCount: number;
  unchangedCount: number;
  dailyAmbiguityResolvedCount: number;
  unknownCount: number;
  decisionChanged: OpenHistoryRateMetric;
  decisionImpacted: OpenHistoryRateMetric;
}

export interface OpenHistoryDailyExpansionMetrics {
  candidateCount: number;
  admittedEpisodeCount: number;
  cohorts: OpenHistoryCohortMetrics[];
  intradayResolution: OpenHistoryResolutionMetrics;
}

export interface OpenHistoryPaidDataNeed {
  symbol: string;
  year: number;
  windowStart: string;
  windowEnd: string;
  intervals: BarInterval[];
  reasons: OpenHistoryPaidDataReason[];
  candidateIds: string[];
}

export interface OpenHistoryUnresolvedInstrumentNeed {
  needId: string;
  candidateIds: string[];
  sourceId: string;
  eventDate: string;
  cik?: string;
  observedName?: string;
  reason: string;
}

export interface OpenHistoryDailyExpansionArtifact {
  schemaVersion: typeof OPEN_HISTORY_DAILY_EXPANSION_SCHEMA_VERSION;
  generatedAt: string;
  bounds: OpenHistoryExpansionBounds;
  policy: OpenHistoryExpansionPolicy;
  cohorts: OpenHistoryCohortDefinition[];
  receipts: OpenHistoryAcquisitionReceipt[];
  candidates: OpenHistoryEventCandidate[];
  episodes: EventEpisode[];
  resolutionComparisons: OpenHistoryResolutionComparison[];
  metrics: OpenHistoryDailyExpansionMetrics;
  paidDataNeeds: OpenHistoryPaidDataNeed[];
  unresolvedInstrumentNeeds: OpenHistoryUnresolvedInstrumentNeed[];
  limitations: string[];
}

export interface OpenOutcomeCoverageMetric {
  horizonTradingDays: OutcomeHorizonTradingDays;
  absolute: OpenHistoryRateMetric;
  marketRelative: OpenHistoryRateMetric;
  sectorRelative: OpenHistoryRateMetric;
  mfeMae: OpenHistoryRateMetric;
}

export interface OpenOutcomeArtifact {
  schemaVersion: typeof OPEN_OUTCOME_SCHEMA_VERSION;
  generatedAt: string;
  sourceIds: string[];
  sourceReceipts: OpenHistoryAcquisitionReceipt[];
  episodes: EventEpisode[];
  coverage: OpenOutcomeCoverageMetric[];
  missingData: MissingDataNotice[];
  limitations: string[];
}

export interface OpenOutcomeDailyPathSelectionArtifact {
  schemaVersion: typeof OPEN_OUTCOME_DAILY_PATH_SELECTION_SCHEMA_VERSION;
  generatedAt: string;
  sourceArtifact: 'open-outcome/v1';
  selectionRule: 'FIXED_REPLAY_TARGET_PLUS_SHA256_EPISODE_ID_ASC';
  selectionRuleVersion: 'open-outcome-daily-path-selection/v1';
  outcomeFieldsExcludedFromSelection: true;
  targetSampleSize: number;
  selectedEpisodeIds: string[];
  selectedSymbols: string[];
  benchmarkSymbols: ['SPY'];
  referenceTradingDates: string[];
  expectedTradingDatesByReferenceDate: Record<string, string[]>;
  limitations: string[];
}

export interface SimilarOutcomeStatistics {
  status: 'AVAILABLE' | 'INSUFFICIENT_SAMPLE';
  minimumSampleSize: number;
  sampleSize: number;
  outcomeSampleSize: number;
  eligibleSampleCount: number;
  matchedEventFamily?: string;
  excludedFamilyMismatch: number;
  excludedNoMatchedFeature: number;
  usableSampleSize: {
    nextDayReturn: number;
    fiveDayReturn: number;
    twentyDayReturn: number;
    fiveDayMfe: number;
    fiveDayMae: number;
    twentyDayMfe: number;
    twentyDayMae: number;
  };
  nextDayPositivePercent?: number;
  medianNextDayReturnPercent?: number;
  median5DayReturnPercent?: number;
  median20DayReturnPercent?: number;
  median5DayMfePercent?: number;
  median5DayMaePercent?: number;
  median20DayMfePercent?: number;
  median20DayMaePercent?: number;
  missingDataCount: number;
}

export interface OpenOutcomeDailyPathHorizonContext {
  tradingDays: 5 | 20;
  absoluteReturnPercent?: number;
  mfePercent?: number;
  maePercent?: number;
  usableSessionCount: number;
  expectedSessionCount: 5 | 20;
  coverageStatus: OutcomePathCoverageStatus;
}

export interface OpenOutcomeDailyPathContext {
  episodeId: string;
  horizons: Partial<Record<5 | 20, OpenOutcomeDailyPathHorizonContext>>;
}

export interface OpenOutcomeContextPack {
  schemaVersion: 'open-outcome-context/v1';
  generatedAt: string;
  sealedForecast: ForecastRecord;
  target: EventEpisode;
  similarEpisodes: EventEpisode[];
  similarStatistics: SimilarOutcomeStatistics;
  dailyPath: {
    target: OpenOutcomeDailyPathContext;
    similar: OpenOutcomeDailyPathContext[];
  };
  marketRegime?: string;
  filingEvidence: EventEpisode['contextSnapshot']['filings'];
  missingData: MissingDataNotice[];
  guardrails: {
    automatedTradingDecision: false;
    pointInTimeCutoff: string;
    targetFutureExcludedFromSimilarity: true;
  };
}
