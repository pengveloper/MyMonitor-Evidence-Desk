export const TOSSINVEST_SCHEMA_VERSION = 'tossinvest-owner-portfolio/v1' as const;
export const TOSSINVEST_PROVIDER = 'TOSS_SECURITIES' as const;

export const TOSSINVEST_STORAGE_KEYS = Object.freeze({
  syncState: 'private:tossinvest:sync-state:v1',
  holdings: 'private:tossinvest:holdings:v1',
  ledger: 'private:tossinvest:trade-ledger:v1',
  positionEpisodes: 'private:tossinvest:position-episodes:v1',
  ownerBehavior: 'private:tossinvest:owner-behavior:v1',
  ownerUniverse: 'private:owner-universe:v1',
  health: 'private:tossinvest:health:v1',
  oauthToken: 'private:tossinvest:oauth-token:v1',
});

export type TossDecimal = string;
export type TossMarketCountry = 'KR' | 'US' | string;
export type TossProviderErrorCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'CONFIGURATION'
  | 'MALFORMED_RESPONSE'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'UNSAFE_ROUTE';

export interface TossRateLimitObservation {
  limit: number | null;
  remaining: number | null;
  resetAfterMs: number | null;
  retryAfterMs: number | null;
  observedAt: string;
}

export interface TossRequestMetric {
  route: '/oauth2/token' | '/api/v1/accounts' | '/api/v1/holdings' | '/api/v1/orders';
  method: 'GET' | 'POST';
  status: number | null;
  durationMs: number;
  attempt: number;
  outcome: 'OK' | 'ERROR' | 'TIMEOUT';
  rateLimit: TossRateLimitObservation | null;
}

export interface TossAccountSelection {
  state: 'ACTIVE' | 'NOT_CONFIGURED' | 'CONFIGURATION_REQUIRED';
  opaqueAccountRef: string | null;
  /** Runtime-only. Persisted schemas must never contain this value. */
  accountSeq: string | null;
  eligibleAccountCount: number;
}

export interface CanonicalOwnerHolding {
  provider: typeof TOSSINVEST_PROVIDER;
  opaqueAccountRef: string;
  symbol: string;
  marketCountry: TossMarketCountry | null;
  currency: string | null;
  quantity: TossDecimal | null;
  averageAcquisitionPrice: TossDecimal | null;
  currentPrice: TossDecimal | null;
  valuationAmount: TossDecimal | null;
  unrealizedPnlAmount: TossDecimal | null;
  unrealizedPnlPercent: TossDecimal | null;
  observedAt: string;
  fetchedAt: string;
  providerFreshness: 'LIVE_RESPONSE';
  providerFields: Readonly<Record<string, string | null>>;
}

export interface CanonicalHoldingsSnapshot {
  schemaVersion: typeof TOSSINVEST_SCHEMA_VERSION;
  provider: typeof TOSSINVEST_PROVIDER;
  opaqueAccountRef: string;
  observedAt: string;
  fetchedAt: string;
  holdings: CanonicalOwnerHolding[];
}

export type CanonicalOrderSide = 'BUY' | 'SELL' | 'UNKNOWN';

export interface CanonicalBrokerOrder {
  provider: typeof TOSSINVEST_PROVIDER;
  opaqueAccountRef: string;
  providerOrderId: string;
  symbol: string;
  side: CanonicalOrderSide;
  orderedAt: string;
  status: string;
  orderedQuantity: TossDecimal | null;
  orderedPrice: TossDecimal | null;
  orderAmount: TossDecimal | null;
  filledQuantity: TossDecimal | null;
  averageFilledPrice: TossDecimal | null;
  filledAmount: TossDecimal | null;
  commission: TossDecimal | null;
  tax: TossDecimal | null;
  filledAt: string | null;
  canceledAt: string | null;
  settlementDate: string | null;
  currency: string | null;
  providerFields: Readonly<Record<string, string | null>>;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CanonicalExecution {
  provider: typeof TOSSINVEST_PROVIDER;
  opaqueAccountRef: string;
  executionId: string;
  providerOrderId: string;
  aggregation: 'PROVIDER_ORDER_AGGREGATE';
  symbol: string;
  side: CanonicalOrderSide;
  quantity: TossDecimal;
  price: TossDecimal | null;
  amount: TossDecimal | null;
  commission: TossDecimal | null;
  tax: TossDecimal | null;
  executedAt: string | null;
  settlementDate: string | null;
  currency: string | null;
  dataQuality: 'COMPLETE' | 'INCOMPLETE';
  limitations: string[];
  lastSeenAt: string;
}

export interface CanonicalTradeLedger {
  schemaVersion: typeof TOSSINVEST_SCHEMA_VERSION;
  provider: typeof TOSSINVEST_PROVIDER;
  opaqueAccountRef: string;
  updatedAt: string;
  orders: CanonicalBrokerOrder[];
  executions: CanonicalExecution[];
}

export type PositionDirection = 'LONG' | 'SHORT';
export type PositionEventKind = 'ENTRY' | 'ADDITION' | 'REDUCTION' | 'EXIT' | 'DIRECTION_SWITCH';

export interface PositionEpisodeEvent {
  kind: PositionEventKind;
  executionId: string;
  occurredAt: string;
  quantity: TossDecimal;
  price: TossDecimal | null;
}

export interface CanonicalPositionEpisode {
  episodeId: string;
  symbol: string;
  currency: string | null;
  direction: PositionDirection;
  openedAt: string;
  closedAt: string | null;
  entryPrice: TossDecimal | null;
  peakAbsoluteQuantity: TossDecimal;
  endingQuantity: TossDecimal;
  holdingDurationMs: number | null;
  grossRealizedPnl: TossDecimal | null;
  fees: TossDecimal;
  taxes: TossDecimal;
  netRealizedPnl: TossDecimal | null;
  additionCount: number;
  partialExitCount: number;
  directionSwitch: boolean;
  dataQuality: 'COMPLETE_EXECUTION_BASIS' | 'INSUFFICIENT_HISTORY' | 'MISSING_EXECUTION_PRICE';
  limitations: string[];
  events: PositionEpisodeEvent[];
}

export interface PositionEpisodeLedger {
  schemaVersion: typeof TOSSINVEST_SCHEMA_VERSION;
  generatedAt: string;
  excludedExecutionCount: number;
  limitations: string[];
  episodes: CanonicalPositionEpisode[];
}

export interface TossBackfillCheckpoint {
  state: 'NOT_STARTED' | 'BACKFILLING' | 'CURRENT' | 'DEGRADED';
  from: string | null;
  to: string | null;
  nextCursor: string | null;
  pagesCommitted: number;
  uniqueOrders: number;
  startedAt: string | null;
  lastPageCommittedAt: string | null;
  completedAt: string | null;
}

export interface TossIncrementalCheckpoint {
  state: 'WAITING_FOR_BACKFILL' | 'IDLE' | 'SYNCING' | 'DEGRADED';
  overlapDays: number;
  windowFrom: string | null;
  windowTo: string | null;
  nextCursor: string | null;
  latestOrderedAt: string | null;
  lastPageCommittedAt: string | null;
  lastCompletedAt: string | null;
}

export interface TossProviderSyncState {
  schemaVersion: typeof TOSSINVEST_SCHEMA_VERSION;
  provider: typeof TOSSINVEST_PROVIDER;
  opaqueAccountRef: string | null;
  accountState: TossAccountSelection['state'];
  backfill: TossBackfillCheckpoint;
  incremental: TossIncrementalCheckpoint;
  lastSuccessfulHoldingsSyncAt: string | null;
  lastProviderErrorCategory: TossProviderErrorCategory | null;
  updatedAt: string;
}

export type OwnerUniverseReason =
  | 'ACTUAL_HOLDING'
  | 'RECENTLY_TRADED'
  | 'MANUAL_WATCHLIST'
  | 'FALLBACK_UNIVERSE';

export interface OwnerUniverseEntry {
  symbol: string;
  priority: 1 | 2 | 3 | 4;
  reasons: OwnerUniverseReason[];
  assetClass: 'EQUITY' | 'ETF' | 'UNKNOWN';
  actualHolding: boolean;
  recentlyTraded: boolean;
  positionState: 'OPEN' | 'FLAT' | 'UNKNOWN';
  entryTimestamp: string | null;
  entryPrice: TossDecimal | null;
  positionSizeBucket: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  realizedOutcome: TossDecimal | null;
  systemDecisionAtTrade: 'NOT_AVAILABLE';
}

export interface OwnerUniverseProjection {
  schemaVersion: 'owner-universe/v1';
  generatedAt: string;
  recentTradeWindowDays: number;
  entries: OwnerUniverseEntry[];
}

export interface OwnerBehaviorAggregates {
  schemaVersion: 'owner-behavior/v1';
  generatedAt: string;
  basis: {
    orderCount: number;
    executionCount: number;
    completeClosedEpisodeCount: number;
  };
  tradeFrequencyPer30Days: number | null;
  turnoverByCurrency: Record<string, TossDecimal>;
  averageHoldingDurationMs: number | null;
  medianHoldingDurationMs: number | null;
  averageEntryNotionalByCurrency: Record<string, TossDecimal>;
  addToPositionCount: number;
  partialExitCount: number;
  reentryCount: number;
  directionSwitchCount: number;
  directionSwitchFrequency: number | null;
  cancelRatio: number | null;
  replaceRatio: number | null;
  wins: number | null;
  losses: number | null;
  realizedExpectancyByCurrency: Record<string, TossDecimal>;
  profitFactorByCurrency: Record<string, TossDecimal | null>;
  mae: null;
  mfe: null;
  postExitDrift: null;
  benchmarkRelativeOutcome: null;
  soxlSoxsSwitchCount: number;
  lossFollowedByReentryCount: number;
  winnerAverageHoldingDurationMs: number | null;
  loserAverageHoldingDurationMs: number | null;
  dataQuality: {
    defensibleRealizedEpisodeCount: number;
    excludedEpisodeCount: number;
    marketHistoryAvailable: false;
    limitations: string[];
  };
}

export interface DecisionJournalEntry {
  schemaVersion: 'owner-decision-journal/v1';
  journalId: string;
  tradeOrPositionRef: string;
  systemPosture: string | null;
  systemConfidence: number | null;
  confirmedEvidence: string[];
  counterevidence: string[];
  marketRegime: string | null;
  macroContext: string[];
  tickerContext: string[];
  ownerExposure: OwnerUniverseReason[];
  decisionVersion: string | null;
  timestamp: string;
  systemDecisionAtTrade: 'CAPTURED' | 'NOT_AVAILABLE';
  userRationale: string | null;
}

export interface OutcomeAttribution {
  schemaVersion: 'owner-outcome-attribution/v1';
  fact: string;
  concurrentSignals: string[];
  candidateChannels: string[];
  attributionConfidence: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  causalClaim: null;
}

export interface TossOwnerHealthProjection {
  schemaVersion: typeof TOSSINVEST_SCHEMA_VERSION;
  account: 'ACTIVE' | 'NOT_CONFIGURED' | 'CONFIGURATION_REQUIRED' | 'DEGRADED';
  holdings: 'UNKNOWN' | 'FRESH' | 'LATE' | 'STALE';
  orderHistory: 'NOT_CONFIGURED' | 'BACKFILLING' | 'CURRENT' | 'DEGRADED';
  lastSuccessfulSync: string | null;
  lastProviderErrorCategory: TossProviderErrorCategory | null;
  backfillProgress: {
    pagesCommitted: number;
    uniqueOrders: number;
    complete: boolean;
  };
  requestMetrics: {
    requests: number;
    retries: number;
    rateLimited: number;
    lastRateLimit: TossRateLimitObservation | null;
  };
}

/** Explicitly minimized payload that is safe to serialize into an AI prompt. */
export interface OwnerLearningAiContext {
  schemaVersion: 'owner-learning-ai-context/v1';
  symbols: Array<{
    symbol: string;
    actualHolding: boolean;
    recentTrade: boolean;
    ownerExposurePriority: number;
    ownerExposureReasons: OwnerUniverseReason[];
    positionState: OwnerUniverseEntry['positionState'];
    entryTimestamp: string | null;
    entryPrice: TossDecimal | null;
    positionSizeBucket: OwnerUniverseEntry['positionSizeBucket'];
    realizedOutcome: TossDecimal | null;
    systemDecisionAtTrade: 'NOT_AVAILABLE';
  }>;
  behavior: Omit<
    OwnerBehaviorAggregates,
    'turnoverByCurrency' | 'averageEntryNotionalByCurrency' | 'realizedExpectancyByCurrency'
  >;
}
