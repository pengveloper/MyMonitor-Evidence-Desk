export const AUTONOMOUS_LEARNING_SCHEMA_VERSION = 'autonomous-learning/v1' as const;
export const AUTONOMOUS_LEARNING_METHODOLOGY_VERSION = 'pit-outcomes/v1' as const;
export const AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION = 'auditable-signals/v2' as const;
export const AUTONOMOUS_LEARNING_HORIZONS = [1, 5, 20, 60] as const;
export const AUTONOMOUS_LEARNING_MINIMUM_SAMPLE_SIZE = 10;

export type LearningHorizon = (typeof AUTONOMOUS_LEARNING_HORIZONS)[number];
export type LearningAssetClass = 'EQUITY' | 'ETF';
export type LearningCaseStatus = 'OPEN' | 'PARTIALLY_RESOLVED' | 'RESOLVED' | 'INVALIDATED';
export type ProductBenchmarkTrackingState = 'NOT_WIRED' | 'NOT_APPLICABLE';
export type LearningPosture =
  | 'OPPORTUNITY_CANDIDATE'
  | 'WATCH'
  | 'INVESTIGATE'
  | 'WAIT_FOR_CONFIRMATION'
  | 'RISK_REDUCE_CANDIDATE'
  | 'AVOID_CANDIDATE'
  | 'NO_ACTION';

export interface LearningEvidenceSnapshot {
  evidenceId: string;
  snapshotHash: string;
  knownAt: string;
  source: string;
  summary: string;
  signalTags: string[];
}

export interface LearningOutcomeDefinition {
  kind: 'MARKET_PATH';
  horizons: LearningHorizon[];
  /** Broad risk baseline only; never the ETF's formal product benchmark. */
  broadMarketComparatorSymbol?: string;
  /** Actual product benchmark/tracking remains explicit even when unavailable. */
  productBenchmarkTrackingState: ProductBenchmarkTrackingState;
}

export interface AutonomousLearningCase {
  schemaVersion: typeof AUTONOMOUS_LEARNING_SCHEMA_VERSION;
  caseId: string;
  instrumentId: string;
  symbol: string;
  assetClass: LearningAssetClass;
  eventType: string;
  eventAt: string;
  caseCreatedAt: string;
  pointInTimeCutoff: string;
  evidenceIds: string[];
  evidenceSnapshotHashes: string[];
  evidence: LearningEvidenceSnapshot[];
  facts: string[];
  signalTags: string[];
  systemPosture: LearningPosture;
  systemConfidence: number;
  systemProbabilities?: { adverse?: number; upside?: number };
  systemReasoningSummary: string;
  counterEvidence: string[];
  unknowns: string[];
  changeConditions: string[];
  userJudgment?: string;
  userConfidence?: number;
  outcomeDefinitions: LearningOutcomeDefinition[];
  status: LearningCaseStatus;
  methodologyVersion: typeof AUTONOMOUS_LEARNING_METHODOLOGY_VERSION;
  signalModelVersion: typeof AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION;
}

export interface LearningHorizonOutcome {
  priceAdjustment?: 'SPLIT_AND_DIVIDEND';
  tradingDays: LearningHorizon;
  targetTradingDate: string;
  observedAt: string;
  absoluteReturnPercent: number;
  broadMarketReturnPercent?: number;
  broadMarketRelativeReturnPercent?: number;
  productBenchmarkTrackingState: ProductBenchmarkTrackingState;
  maximumDrawdownPercent?: number;
  maximumFavorableExcursionPercent?: number;
  realizedVolatility?: number;
  volumeChangePercent?: number;
  pathCoverage: 'COMPLETE' | 'PARTIAL';
}

export interface AutonomousLearningOutcome {
  caseId: string;
  entryTradingDate: string;
  entryObservedAt: string;
  entryPrice: number;
  horizons: Partial<Record<LearningHorizon, LearningHorizonOutcome>>;
  observedFollowUpSignals: string[];
  lastEvaluatedAt: string;
  status: Exclude<LearningCaseStatus, 'INVALIDATED'>;
}

export interface LearningSignalStatistics {
  signal: string;
  assetClass: LearningAssetClass;
  horizonTradingDays: LearningHorizon;
  sampleCount: number;
  resolvedCount: number;
  forecastSampleCount: number;
  positiveOutcomeCount: number;
  negativeOutcomeCount: number;
  meanReturnPercent: number;
  medianReturnPercent: number;
  hitRate: number;
  meanBrierScore?: number;
  meanRawConfidence: number;
  observedAccuracy: number;
  calibrationGap: number;
  minimumSampleSize: number;
  displayEligible: boolean;
  lastUpdatedAt: string;
  methodologyVersion: typeof AUTONOMOUS_LEARNING_METHODOLOGY_VERSION;
}

export interface SimilarLearningCase {
  caseId: string;
  symbol: string;
  eventType: string;
  eventAt: string;
  sharedSignals: string[];
  similarity: number;
  outcome?: LearningHorizonOutcome;
}

export interface LearningCalibration {
  rawConfidence: number;
  adjustedConfidence: number;
  observedAccuracy?: number;
  sampleCount: number;
  applied: boolean;
  minimumSampleSize: number;
}

export interface InstrumentLearningSummary {
  symbol: string;
  generatedAt: string;
  basisSignals: string[];
  similarCaseCount: number;
  similarCases: SimilarLearningCase[];
  strongestSignals: LearningSignalStatistics[];
  misleadingSignals: LearningSignalStatistics[];
  knownFailurePatterns: string[];
  calibration: LearningCalibration;
  lastOutcomeUpdate?: string;
}

/** Browser-safe owner projection. Access is still authenticated and private. */
export interface AutonomousLearningProjection {
  schemaVersion: typeof AUTONOMOUS_LEARNING_SCHEMA_VERSION;
  generatedAt: string;
  automatic: true;
  methodologyVersion: typeof AUTONOMOUS_LEARNING_METHODOLOGY_VERSION;
  signalModelVersion: typeof AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION;
  minimumSampleSize: number;
  caseCount: number;
  resolvedCaseCount: number;
  lastOutcomeUpdate?: string;
  globalLessons: string[];
  signalStatistics: LearningSignalStatistics[];
  bySymbol: Record<string, InstrumentLearningSummary>;
}

export interface AutonomousLearningCheckpoint {
  /** Legacy combined cursor retained for backward-compatible state reads. */
  instrumentCursor: number;
  /**
   * Persisted round-robin queues. The first entry is selected next; selected
   * entries rotate to the tail. Owner additions are reconciled to the front so
   * a pre-existing fallback cursor can never delay a new owner instrument.
   */
  ownerInstrumentRotation?: string[];
  fallbackInstrumentRotation?: string[];
  lastRunAt?: string;
  lastSuccessfulRunAt?: string;
  totalRuns: number;
  totalProviderRequests: number;
  lastDegradedSymbols?: string[];
}

export interface AutonomousLearningState {
  schemaVersion: typeof AUTONOMOUS_LEARNING_SCHEMA_VERSION;
  cases: AutonomousLearningCase[];
  outcomes: Record<string, AutonomousLearningOutcome>;
  checkpoint: AutonomousLearningCheckpoint;
}

export interface LearningPriceBar {
  tradingDate: string;
  observedAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LearningTradingSession {
  tradingDate: string;
  closeAt: string;
  isTradingDay: boolean;
}
