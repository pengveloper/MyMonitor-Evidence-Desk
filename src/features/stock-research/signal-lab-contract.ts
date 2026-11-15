import type {
  BarInterval,
  MarketDataSession,
  OHLCVBar,
} from '../../../shared/market-data/contracts.ts';

export const SIGNAL_LAB_SCHEMA_VERSION = 'signal-lab-episode/v1' as const;
export const SIGNAL_LAB_FEATURE_VERSION = 'signal-lab-technical/v1' as const;
export const SIGNAL_LAB_SOCIAL_CLAIM_VERSION = 'signal-lab-social-claim/v1' as const;

export const SIGNAL_LAB_PRIMARY_INTERVALS = ['1m', '10m', '30m', '1h'] as const;
export const SIGNAL_LAB_RESEARCH_INTERVALS = ['5m', '15m', '2h'] as const;
export const OPEN_HISTORY_CONTEXT_INTERVALS = ['4h', '1d', '1w'] as const;
export type SignalLabInterval =
  | (typeof SIGNAL_LAB_PRIMARY_INTERVALS)[number]
  | (typeof SIGNAL_LAB_RESEARCH_INTERVALS)[number]
  | (typeof OPEN_HISTORY_CONTEXT_INTERVALS)[number];

type AssertCanonicalInterval<T extends BarInterval> = T;
export type CanonicalSignalLabInterval = AssertCanonicalInterval<SignalLabInterval>;

export type KnowledgeTime =
  | { precision: 'EXACT_TIME'; asKnownAt: string }
  | { precision: 'DATE_ONLY'; asKnownOn: string }
  | { precision: 'UNKNOWN' };

export interface SignalLabProvenance {
  sourceId: string;
  provider: string;
  dataset: string;
  sourceUrl?: string;
  sourceTimestamp?: string;
  fetchedAt: string;
  knowledgeTime: KnowledgeTime;
  licenseClass:
    | 'PUBLIC_FACTS'
    | 'PUBLIC_DOWNLOAD_REVIEWED'
    | 'OPERATOR_ONLY'
    | 'REDISTRIBUTION_REVIEW_REQUIRED'
    | 'UNKNOWN';
  redistribution: 'COMMIT_ALLOWED' | 'OPERATOR_ONLY' | 'REVIEW_REQUIRED' | 'UNKNOWN';
}

export type EpisodeCoverage = 'DAILY_ONLY' | 'INTRADAY_PARTIAL' | 'INTRADAY_FULL';

export interface MissingDataNotice {
  field: string;
  reason: 'NOT_AVAILABLE' | 'OUTSIDE_COVERAGE' | 'UNKNOWN_KNOWLEDGE_TIME' | 'CONFLICT';
  detail?: string;
}

export interface EventEpisode {
  schemaVersion: typeof SIGNAL_LAB_SCHEMA_VERSION;
  episodeId: string;
  instrumentId: string;
  tickerAtEventTime: string;
  eventStart: string;
  eventEnd?: string;
  detectionReason: string[];
  marketSession: MarketDataSession;
  provenance: SignalLabProvenance[];
  dataCoverage: EpisodeCoverage;
  missingData: MissingDataNotice[];
  contextSnapshot: ContextSnapshot;
  outcome?: OutcomeLabel;
}

export interface PriceContext {
  bars: Readonly<Partial<Record<SignalLabInterval, readonly OHLCVBar[]>>>;
  gapPercent?: number;
  sessionHigh?: number;
  sessionLow?: number;
  volume?: number;
  relativeVolume?: number;
  liquidityUsd?: number;
  spreadPercent?: number;
  unavailableFields: string[];
}

export interface TechnicalContext {
  featureVersion: typeof SIGNAL_LAB_FEATURE_VERSION;
  computedAt: string;
  inputInterval: SignalLabInterval;
  inputThrough: string;
  returnPercent?: number;
  gapPercent?: number;
  relativeVolume?: number;
  vwap?: number;
  distanceFromVwapPercent?: number;
  realizedVolatility?: number;
  atr?: number;
  emaSlope?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  bollingerPosition?: number;
  distanceFromRecentHighPercent?: number;
  distanceFromRecentLowPercent?: number;
  volumeAcceleration?: number;
  priceAcceleration?: number;
  marketRelativeStrength?: number;
  sectorRelativeStrength?: number;
  formulas: Readonly<Record<string, string>>;
  unavailableFields: string[];
}

export interface MarketContext {
  benchmarks: Readonly<Partial<Record<'SPY' | 'QQQ' | 'IWM', number>>>;
  sectorEtf?: { symbol: string; returnPercent?: number };
  breadth?: number;
  volatility?: number;
  rates?: number;
  dollar?: number;
  commodities?: Readonly<Record<string, number>>;
  regime?: string;
  provenance: SignalLabProvenance[];
  unavailableFields: string[];
}

export interface FilingContextItem {
  accessionNumber: string;
  form: string;
  acceptedAt?: string;
  filingDate: string;
  items: string[];
  offeringEvidence: string[];
  amendmentOf?: string;
  provenance: SignalLabProvenance;
}

export interface CorporateActionContextItem {
  actionId: string;
  type: 'DIVIDEND' | 'SPLIT' | 'REVERSE_SPLIT' | 'LISTING' | 'DELISTING'
    | 'SYMBOL_CHANGE' | 'MERGER_ACQUISITION' | 'OTHER_CONFIRMED';
  effectiveDate?: string;
  announcedAt?: string;
  details: string;
  provenance: SignalLabProvenance;
}

export type ShortMetricKind =
  | 'SHORT_INTEREST'
  | 'DAILY_SHORT_VOLUME'
  | 'SHORT_VOLUME_RATIO'
  | 'FAIL_TO_DELIVER'
  | 'THRESHOLD_LIST'
  | 'BORROW_FEE'
  | 'BORROW_AVAILABILITY';

interface KnownShortContextBase {
  status: 'KNOWN';
  observedOn: string;
  coverage: string;
  provenance: SignalLabProvenance;
}

export type ShortContextItem =
  | (KnownShortContextBase & {
    metric: 'SHORT_INTEREST';
    value: number;
    unit: 'SHARES' | 'PERCENT';
  })
  | (KnownShortContextBase & {
    metric: 'DAILY_SHORT_VOLUME';
    value: number;
    unit: 'SHARES';
  })
  | (KnownShortContextBase & {
    metric: 'SHORT_VOLUME_RATIO';
    value: number;
    unit: 'PERCENT';
  })
  | (KnownShortContextBase & {
    metric: 'FAIL_TO_DELIVER';
    value: number;
    unit: 'SHARES';
  })
  | (KnownShortContextBase & {
    metric: 'THRESHOLD_LIST';
    value: boolean;
    unit: 'BOOLEAN';
  })
  | (KnownShortContextBase & {
    metric: 'BORROW_FEE';
    value: number;
    unit: 'PERCENT' | 'BASIS_POINTS';
  })
  | (KnownShortContextBase & {
    metric: 'BORROW_AVAILABILITY';
    value: number;
    unit: 'SHARES';
  })
  | {
    metric: ShortMetricKind;
    status: 'UNKNOWN';
    value?: never;
    unit?: never;
    observedOn?: string;
    coverage?: string;
    provenance?: SignalLabProvenance;
  };

export interface WorldContextItem {
  eventId: string;
  category: 'WORLD_NEWS' | 'GEOPOLITICAL' | 'SANCTIONS' | 'CONFLICT'
    | 'ENERGY_SHOCK' | 'SUPPLY_CHAIN' | 'CYBER' | 'WEATHER_DISASTER';
  title: string;
  eventTime?: string;
  eventDate?: string;
  linkedThrough: string[];
  linkReason: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  provenance: SignalLabProvenance;
}

export type SocialClaimStatus =
  | 'UNVERIFIED'
  | 'PARTIALLY_SUPPORTED'
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'UNKNOWN';

export interface SocialClaim {
  schemaVersion: typeof SIGNAL_LAB_SOCIAL_CLAIM_VERSION;
  claimId: string;
  sourcePlatform: 'INSTAGRAM' | 'YOUTUBE' | 'REDDIT' | 'WEB' | 'MANUAL';
  sourceUrl?: string;
  capturedAt: string;
  author?: string;
  originalClaim: string;
  mentionedTickers: string[];
  claimedCatalyst?: string;
  claimedTimeframe?: string;
  evidenceProvided: string[];
  laterOfficialVerification: string[];
  contradictedEvidence: string[];
  status: SocialClaimStatus;
  statusKnowledgeTime: KnowledgeTime;
  verificationEvidenceKnowledgeTime?: KnowledgeTime;
  provenance: SignalLabProvenance;
}

export interface ContextSnapshot {
  snapshotId: string;
  episodeId: string;
  snapshotAt: string;
  replayCutoffAt?: string;
  price: PriceContext;
  technical: TechnicalContext[];
  market: MarketContext;
  filings: FilingContextItem[];
  corporateActions: CorporateActionContextItem[];
  short: ShortContextItem[];
  world: WorldContextItem[];
  socialClaims: SocialClaim[];
  missingData: MissingDataNotice[];
}

export const OUTCOME_HORIZONS = [5, 10, 15, 30, 60, 120] as const;
export type OutcomeHorizonMinutes = (typeof OUTCOME_HORIZONS)[number];
export const OUTCOME_TRADING_DAY_HORIZONS = [1, 5, 20] as const;
export type OutcomeHorizonTradingDays = (typeof OUTCOME_TRADING_DAY_HORIZONS)[number];
export const OUTCOME_BARRIERS = [-10, -5, -3, -1, 1, 3, 5, 10] as const;
export type OutcomeBarrierPercent = (typeof OUTCOME_BARRIERS)[number];

export interface BarrierOutcome {
  barrierPercent: OutcomeBarrierPercent;
  reached: boolean;
  reachedAt?: string;
  minutesToReach?: number;
  tradingDaysToReach?: number;
}

export interface RelativeReturnOutcome {
  benchmarkSymbol: string;
  benchmarkReturnPercent: number;
  relativeReturnPercent: number;
}

/**
 * Quality of the ordered daily path used for an excursion metric.
 * COMPLETE means every explicitly expected exchange session in sessions 1..N
 * is present and usable. PARTIAL never authorizes MFE/MAE calculation, and
 * INSUFFICIENT_SAMPLE means no usable session exists in that horizon.
 */
export type OutcomePathCoverageStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'INSUFFICIENT_SAMPLE';

export interface TradingDayOutcome {
  tradingDays: OutcomeHorizonTradingDays;
  absoluteReturnPercent?: number;
  marketRelative?: RelativeReturnOutcome;
  sectorRelative?: RelativeReturnOutcome;
  mfePercent?: number;
  maePercent?: number;
  usableSessionCount: number;
  expectedSessionCount: OutcomeHorizonTradingDays;
  coverageStatus: OutcomePathCoverageStatus;
  /** Backward-compatible horizon coverage alias retained for v1 consumers. */
  coverage: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  missingData: MissingDataNotice[];
}

export interface OutcomeLabel {
  episodeId: string;
  forecastAt: string;
  labeledAt: string;
  returnsByMinutes: Partial<Record<OutcomeHorizonMinutes, number>>;
  returnsByTradingDays?: Partial<Record<OutcomeHorizonTradingDays, number>>;
  tradingDayOutcomes?: Partial<Record<OutcomeHorizonTradingDays, TradingDayOutcome>>;
  regularCloseReturnPercent?: number;
  nextTradingDayReturnPercent?: number;
  mfePercent?: number;
  maePercent?: number;
  barriers: BarrierOutcome[];
  barrierOrdering: 'UPSIDE_FIRST' | 'DOWNSIDE_FIRST' | 'SAME_BAR' | 'NEITHER' | 'UNKNOWN';
  barrierOrderingStatus?: 'ORDERED' | 'SAME_BAR_UNKNOWN_ORDER' | 'INCOMPLETE_WINDOW';
  barrierPair: { upsidePercent: 5; downsidePercent: -3 };
  coverage: EpisodeCoverage;
  missingData: MissingDataNotice[];
}

export const FORECAST_DECISIONS = ['BUY', 'WAIT', 'WATCH', 'REJECT'] as const;
export type ForecastDecision = (typeof FORECAST_DECISIONS)[number];

export type ForecastMetric =
  | 'ABSOLUTE_RETURN'
  | 'MARKET_RELATIVE_RETURN'
  | 'SECTOR_RELATIVE_RETURN';

export interface ForecastPrediction {
  horizon: { unit: 'MINUTES'; value: number }
    | { unit: 'TRADING_DAYS'; value: OutcomeHorizonTradingDays };
  metric: ForecastMetric;
  operator: 'AT_LEAST' | 'AT_MOST';
  thresholdPercent: number;
  probabilityPercent: number;
}

export interface ForecastRecord {
  forecastId: string;
  episodeId: string;
  forecastAt: string;
  predictionHorizonMinutes: number;
  question: string;
  probability?: number;
  expectedUpsidePercent?: number;
  expectedDownsidePercent?: number;
  bullishEvidence: readonly string[];
  bearishEvidence: readonly string[];
  missingInformation: readonly string[];
  notes?: string;
  abstain: boolean;
  modelVersion: string;
  promptVersion: string;
  similarEpisodeCount: number;
  sealedAt: string;
  decision?: ForecastDecision;
  confidencePercent?: number;
  thesis?: string;
  invalidation?: string;
  prediction?: ForecastPrediction;
}

export type ReviewErrorClass =
  | 'DATA_ERROR'
  | 'TIME_LEAK'
  | 'CATALYST_MISREAD'
  | 'MARKET_REGIME_ERROR'
  | 'TECHNICAL_OVERFIT'
  | 'SOCIAL_FALSE_CLAIM'
  | 'EXECUTION_ERROR'
  | 'PSYCHOLOGY_ERROR'
  | 'UNKNOWN';

export const REVIEW_PATH_ASSESSMENTS = [
  'PATH_ACCEPTABLE',
  'DIRECTION_RIGHT_DRAWDOWN_INTOLERABLE',
  'DIRECTION_WRONG_EARLY_MFE_OPPORTUNITY',
  'STOP_TOO_TIGHT',
  'TARGET_BELOW_REALIZED_MFE',
  'INDETERMINATE',
] as const;
export type ReviewPathAssessment = (typeof REVIEW_PATH_ASSESSMENTS)[number];

export interface ReviewRecord {
  reviewId: string;
  forecastId: string;
  reviewedAt: string;
  outcome: OutcomeLabel;
  errorClasses: ReviewErrorClass[];
  notes: string;
  proposedHypotheses: string[];
  humanApprovedFeatureVersion?: string;
  pathAssessment?: ReviewPathAssessment;
  verdict?: 'GOOD_DECISION_BAD_OUTCOME'
    | 'BAD_DECISION_GOOD_OUTCOME'
    | 'GOOD_DECISION_GOOD_OUTCOME'
    | 'BAD_DECISION_BAD_OUTCOME'
    | 'INDETERMINATE';
}
