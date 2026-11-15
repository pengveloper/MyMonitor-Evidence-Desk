import type { InstrumentLearningSummary } from './autonomous-learning-contract';

export type EvidenceState = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'NOT_WIRED';
export interface OwnerObservation {
  id: string;
  label: string;
  value: number | null;
  previous: number | null;
  unit: string;
  observedAt: string | null;
  source: string;
  url: string;
  state: EvidenceState;
  previousObservedAt?: string | null;
  publishedAt?: string | null;
  fetchedAt?: string | null;
  basis?: 'EOD' | 'DAILY_MACRO' | 'QUOTE';
  methodology?: string;
  universe?: string;
  sampleCount?: number | null;
  coveragePercent?: number | null;
  limitation?: string;
}
export interface OwnerEvent {
  id: string;
  title: string;
  titleKo: string | null;
  translation: 'PENDING' | 'SUCCESS' | 'FAILED' | 'POLICY_BLOCKED' | 'ORIGINAL_KO';
  publishedAt: string | null;
  sources: Array<{ url: string; name: string; primary: boolean }>;
  duplicateCount: number;
  kind: 'NEWS' | 'SEC' | 'CORPORATE_ACTION';
  form: string | null;
  excerpt?: string;
  tags: string[];
  scope?: 'DIRECT' | 'INDIRECT';
  relatedSymbol?: string;
  relationshipReason?: string;
  relationshipSource?: string;
  relationshipAsOf?: string;
  relationshipObservedAt?: string;
}
export interface OwnerPositionContext {
  actualHolding: boolean;
  recentlyTraded: boolean;
  assetClass: 'EQUITY' | 'ETF' | 'UNKNOWN';
  priority: number;
  state: string;
  observedAt: string | null;
  freshness: EvidenceState;
  quantity: string | null;
  averageCost: string | null;
  currency: string | null;
  unrealizedPnl: string | null;
  unrealizedPnlPercent: string | null;
  historyComplete: boolean;
}

export interface OwnerInstrumentProfile {
  state: EvidenceState;
  name: string | null;
  assetClass: 'EQUITY' | 'ETF' | 'UNKNOWN';
  exchange: string | null;
  sector: string | null;
  geography: string | null;
  underlying: string | null;
  leverageMultiple: number | null;
  leverageDirection: 'LONG' | 'INVERSE' | 'UNLEVERAGED' | 'UNKNOWN';
  dailyReset: boolean | null;
  monitorDimensions: string[];
  limitations: string[];
  sourceUrl?: string;
  observedAt?: string | null;
}

export interface OwnerPortfolioContext {
  state: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
  hasSoxlSoxsPair: boolean;
  currency: string | null;
  longSemiconductorLeveragedNotional: number | null;
  inverseSemiconductorLeveragedNotional: number | null;
  netDirectionalExposure: number | null;
  grossLeveragedExposure: number | null;
  offsetRatio: number | null;
  observations: string[];
}
export interface OwnerBehaviorContext {
  eligible: boolean;
  sampleCount: number;
  generatedAt: string | null;
  facts: string[];
  limitations: string[];
}
export interface OwnerJudgment {
  now: string;
  drivers: string[];
  counterevidence: string[];
  posture: 'WAIT_FOR_CONFIRMATION' | 'REVIEW_HOLD' | 'REVIEW_REDUCE';
  confidence: number;
  confidenceBasis: string;
  changeConditions: string[];
  nextChecks: string[];
  positionImplications: string[];
}
export interface OwnerIntelligenceEvidence {
  schemaVersion: 'owner-intelligence/v1';
  symbol: string;
  fingerprint: string;
  /** New bundle assembly completion; not request start, price observation, or a historical cutoff. */
  collectedAt: string;
  market: {
    analysisId: string;
    priceBasis?: 'EOD' | 'DELAYED' | 'REALTIME' | 'TIMESTAMPED' | 'UNKNOWN';
    delayedMinutes?: number | null;
    fetchedAt?: string | null;
    technicalObservedAt?: string | null;
    price: number | null;
    changePercent: number | null;
    currency: string;
    observedAt: string | null;
    provider: string;
    state: EvidenceState;
    session?: 'REGULAR' | 'PRE_MARKET' | 'AFTER_HOURS' | 'CLOSED' | 'UNKNOWN';
    intradayUsable?: boolean;
    timingLabel?: string;
    ma20: number | null;
    rsi: number | null;
    macd: number | null;
    support: number[];
    resistance: number[];
  };
  position: OwnerPositionContext;
  profile: OwnerInstrumentProfile;
  portfolio: OwnerPortfolioContext;
  events: OwnerEvent[];
  newsCoverage?: { state: EvidenceState; fetchedAt: string | null; latestPublishedAt: string | null; newEventCount: number; detail: string };
  secState: EvidenceState;
  macro: OwnerObservation[];
  learning: InstrumentLearningSummary | null;
  behavior: OwnerBehaviorContext;
  shortOptions: { state: EvidenceState; details: string[] };
  judgment: OwnerJudgment;
  dependencies: Record<string, string>;
}

export interface OwnerSignalStoryItem {
  id: string;
  label: string;
  detail: string;
  state: EvidenceState;
  value?: string;
  source?: string;
  observedAt?: string | null;
  url?: string;
  evidenceType?: 'DIRECT' | 'INDIRECT' | 'HYPOTHESIS';
  fetchedAt?: string | null;
  direction?: 'SUPPORTIVE' | 'COUNTER' | 'NEUTRAL' | 'UNKNOWN';
}

export interface OwnerSignalStoryEvent {
  id: string;
  headline: string;
  originalHeadline: string;
  translationState: 'TRANSLATED' | 'ORIGINAL_ONLY' | 'TRANSLATION_FAILED';
  publishedAt: string | null;
  firstSeenAt: string;
  sourceCount: number;
  primarySource: boolean;
  impactedOwnerSymbols: string[];
  freshness: EvidenceState;
  kind: OwnerEvent['kind'];
  form: string | null;
  tags: string[];
  links: Array<{ url: string; name: string; primary: boolean }>;
  scope?: OwnerEvent['scope'];
  relatedSymbol?: string;
  relationshipReason?: string;
  relationshipSource?: string;
  relationshipAsOf?: string;
  relationshipObservedAt?: string;
}

export interface OwnerSignalStory {
  schemaVersion: 'owner-signal-story/v1';
  symbol: string;
  generatedAt: string;
  evidenceFingerprint: string;
  status: 'CURRENT' | 'OUTDATED';
  assetClass: 'EQUITY' | 'ETF' | 'UNKNOWN';
  actualHolding: boolean;
  recentlyTraded: boolean;
  positionState: string;
  price: {
    value: number | null;
    changePercent: number | null;
    currency: string;
    observedAt: string | null;
    fetchedAt: string | null;
    freshness: EvidenceState;
    delayedMinutes: number | null;
    delayed: boolean;
    source: string;
    basis?: OwnerIntelligenceEvidence['market']['priceBasis'];
    session?: OwnerIntelligenceEvidence['market']['session'];
    intradayUsable?: boolean;
    timingLabel?: string;
  };
  headline: string;
  oneLineReason: string;
  topDrivers: OwnerSignalStoryItem[];
  counterSignals: OwnerSignalStoryItem[];
  changeConditions: OwnerSignalStoryItem[];
  nextChecks: OwnerSignalStoryItem[];
  marketRegime: OwnerSignalStoryItem[];
  macroChannels: OwnerSignalStoryItem[];
  companyOrEtfSpecific: OwnerSignalStoryItem[];
  newsEventClusters: OwnerSignalStoryEvent[];
  newsCoverage?: OwnerIntelligenceEvidence['newsCoverage'];
  horizons?: { currentSession: string; scenario: string; longerContext: string };
  primarySources: Array<{ url: string; name: string; publishedAt: string | null }>;
  learningSummary: {
    similarCaseCount: number;
    horizons: Array<{ tradingDays: number; n: number; up: number; down: number; unresolved: number }>;
    comparableConditions: string[];
    importantDifferences: string[];
    calibrationApplied: boolean;
    calibrationSampleCount: number;
  };
  ownerBehaviorSummary: OwnerBehaviorContext;
  positionSummary: string[];
  portfolio: OwnerPortfolioContext;
  profile: OwnerInstrumentProfile;
  posture: OwnerJudgment['posture'];
  evidenceCoverage: { available: number; total: number; label: string };
  unknowns: string[];
  notWired: string[];
}

export interface OwnerStoryChanges {
  changedCount: number;
  postureChanged: boolean;
  previousPosture: OwnerJudgment['posture'] | null;
  currentPosture: OwnerJudgment['posture'];
  items: string[];
}
export interface OwnerIntelligenceBrief {
  revalidationWarnings?: string[];
  fingerprint: string;
  generatedAt: string;
  summary: string;
  drivers: string[];
  counterevidence: string[];
  changeConditions: string[];
  nextChecks: string[];
  mostImportantChange?: string;
  whyMoving?: string[];
  strongestPositive?: string[];
  currentPosture?: string;
  coverageAndUncertainty?: string[];
  positionRiskOpportunity?: string[];
  similarCases?: string[];
  ownerBehaviorPattern?: string[];
  dataGaps?: string[];
  evidenceBundleId?: string;
  materialFingerprint?: string;
  validUntil?: string;
  telemetry?: OwnerLlmTelemetry;
}
export interface OwnerLlmTelemetry {
  provider: 'openai';
  requestModel: string;
  responseModel: string | null;
  modelSetting: 'OPENAI_NEWS_MODEL';
  promptVersion: string;
  stage: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  costBasis: 'DOCUMENTED_RATE' | 'CONFIGURED_RATE' | 'UNPRICED';
  outcome: 'SUCCESS' | 'NOT_CONFIGURED' | 'BUDGET_LIMITED' | 'BUDGET_UNAVAILABLE' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE';
  fallback: 'NONE' | 'RULE_BASED';
  attemptedAt: string;
  httpStatus?: number;
  errorCategory?: 'AUTHENTICATION' | 'AUTHORIZATION' | 'RATE_LIMIT' | 'MODEL_OR_REQUEST' | 'UPSTREAM' | 'NETWORK' | 'INVALID_RESPONSE';
}
export interface OwnerShortSummary {
  status: 'READY' | 'PENDING' | 'UNAVAILABLE' | 'BUDGET_LIMITED' | 'FAILED';
  text: string;
  generatedAt: string | null;
  evidenceBundleId: string;
  materialFingerprint: string;
  validUntil: string | null;
  refreshNeeded: boolean;
  refreshReason: string | null;
  horizon: 'ONE_TO_FIVE_SESSIONS';
  telemetry?: OwnerLlmTelemetry;
  retryAfter?: string;
}
export interface OwnerIntelligenceResponse {
  evidence: OwnerIntelligenceEvidence | null;
  story: OwnerSignalStory | null;
  changes: OwnerStoryChanges | null;
  brief: OwnerIntelligenceBrief | null;
  briefState: 'CURRENT' | 'OUTDATED' | 'NOT_ANALYZED' | 'UNAVAILABLE';
  error?: string;
  shortSummary?: OwnerShortSummary | null;
}
