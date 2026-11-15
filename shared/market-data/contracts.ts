/**
 * Runtime-neutral DATA-US market-data contracts.
 *
 * These records are build/operator artifacts. They are intentionally not wired
 * into the browser, Redis, production seeders, or the existing market APIs.
 */

export const DATA_US_INSTRUMENT_SCHEMA_VERSION = 'data-us-instrument-master/v1' as const;
export const DATA_US_CALENDAR_SCHEMA_VERSION = 'data-us-cash-calendar/v1' as const;
export const DATA_US_MANIFEST_SCHEMA_VERSION = 'data-us-foundation-manifest/v1' as const;
export const DATA_US_QUOTE_SCHEMA_VERSION = 'data-us-quote-snapshot/v1' as const;
export const DATA_US_BAR_SCHEMA_VERSION = 'data-us-ohlcv-bar/v1' as const;
export const DATA_US_FILING_EVENT_SCHEMA_VERSION = 'data-us-filing-event/v1' as const;
export const DATA_US_FUNDAMENTAL_FACT_SCHEMA_VERSION = 'data-us-fundamental-fact/v1' as const;
export const DATA_US_FUNDAMENTAL_SNAPSHOT_SCHEMA_VERSION = 'data-us-fundamental-snapshot/v1' as const;
export const DATA_US_CORPORATE_ACTION_SCHEMA_VERSION = 'data-us-corporate-action/v1' as const;

export const INSTRUMENT_CLASSIFICATIONS = [
  'COMMON_STOCK',
  'ORDINARY_SHARE',
  'ADR_ADS',
  'REIT',
  'BDC',
  'LP_MLP',
  'SPAC_COMMON',
  'ETF',
  'PREFERRED',
  'WARRANT',
  'RIGHT',
  'UNIT',
  'ETN_OR_STRUCTURED_ETP',
  'CLOSED_END_FUND',
  'MUTUAL_FUND',
  'OTC',
  'TEST_ISSUE',
  'UNKNOWN_REVIEW',
] as const;

export type InstrumentClassification = (typeof INSTRUMENT_CLASSIFICATIONS)[number];

export const INSTRUMENT_UNIVERSES = [
  'CORE_EQUITY',
  'SEPARATE_ETF',
  'DEFERRED',
  'EXCLUDED',
  'REVIEW',
] as const;

export type InstrumentUniverse = (typeof INSTRUMENT_UNIVERSES)[number];

export type DatasetLicenseClass =
  | 'PUBLIC_FACTS'
  | 'PUBLIC_DOWNLOAD_REVIEWED'
  | 'OPERATOR_ONLY'
  | 'REDISTRIBUTION_REVIEW_REQUIRED'
  | 'UNKNOWN';

export type DatasetRedistribution =
  | 'COMMIT_ALLOWED'
  | 'OPERATOR_ONLY'
  | 'REVIEW_REQUIRED'
  | 'UNKNOWN';

export interface MarketDataSourceProvenance {
  sourceId: string;
  provider: string;
  dataset: string;
  authorityRole: 'PRIMARY' | 'ASSOCIATION' | 'RECONCILIATION' | 'CROSS_CHECK';
  sourceUrl: string;
  fetchedAt: string;
  sourceFileTimestamp?: string;
  sourceFileTimezone?: string;
  checksum: string;
  schemaVersion: string;
  licenseClass: DatasetLicenseClass;
  redistribution: DatasetRedistribution;
}

export type ListingExchange =
  | 'NASDAQ'
  | 'NYSE'
  | 'NYSE_AMERICAN'
  | 'NYSE_ARCA'
  | 'CBOE_BZX'
  | 'IEX'
  | 'OTC';

export interface InstrumentSourceObservation {
  observationId: string;
  sourceId: string;
  sourceRecordKey: string;
  symbol: string;
  displayName: string;
  listingExchange?: ListingExchange;
  rawExchangeCode?: string;
  issuerCik?: string;
  etfFlag?: boolean;
  testIssueFlag?: boolean;
  financialStatus?: string;
  activeStatus: 'ACTIVE' | 'INACTIVE' | 'DELISTED' | 'UNKNOWN';
  rawFields: Readonly<Record<string, string>>;
  provenance: MarketDataSourceProvenance;
}

export interface ClassificationEvidence {
  observationId: string;
  classification: InstrumentClassification;
  confidence: 'EXPLICIT' | 'HIGH' | 'MEDIUM' | 'REVIEW';
  rationale: string;
  rawSecurityName: string;
}

export interface SourceConflictValue {
  sourceId: string;
  observationId: string;
  value: string;
}

export interface SourceConflictEvidence {
  code:
    | 'CURRENT_SYMBOL_CONFLICT'
    | 'EXCHANGE_CONFLICT'
    | 'CIK_CONFLICT'
      | 'CLASSIFICATION_CONFLICT'
      | 'SEC_ONLY_LISTING'
      | 'IDENTITY_COLLISION_CANDIDATE'
      | 'UNPROVEN_SYMBOL_LINEAGE'
      | 'LISTING_EPISODE_DISCONTINUITY'
      | 'UNPROVEN_ISSUER_ASSOCIATION';
  field: string;
  values: SourceConflictValue[];
  resolution: 'UNRESOLVED' | 'REVIEW_REQUIRED' | 'PRIMARY_SOURCE_SELECTED';
  rationale: string;
}

export interface SymbolAlias {
  symbol: string;
  exchange?: ListingExchange;
  provider?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  observedFrom?: string;
  observedTo?: string;
  basis: 'SOURCE_DATED' | 'PROSPECTIVE_SNAPSHOT' | 'CURRENT_STATE_ONLY';
  confidence: 'VERIFIED' | 'SUPPORTED' | 'REVIEW';
  sourceObservationIds: string[];
}

export interface InstrumentLineageEvidence {
  lineageId: string;
  continuityKind: 'SYMBOL_RENAME' | 'ISSUER_ASSOCIATION_ENRICHMENT';
  previousInstrumentId: string;
  fromSymbol: string;
  toSymbol: string;
  listingExchange: ListingExchange;
  issuerCik?: string;
  basis: 'SOURCE_DATED' | 'OPERATOR_CONFIRMED';
  observedAt: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceObservationIds: string[];
}

export interface InstrumentMasterRecord {
  instrumentId: string;
  identityCandidate: string;
  identityGeneration: number;
  identityStatus:
    | 'PROVISIONAL_SYMBOL_BOUND'
    | 'PROVISIONAL_WITH_PRIOR_STATE'
    | 'PROVISIONAL_WITH_LINEAGE'
    | 'PROVISIONAL_NEW_EPISODE'
    | 'COLLISION_REVIEW';
  currentSymbol: string;
  displayName: string;
  assetType: 'EQUITY' | 'ETF' | 'FUND' | 'STRUCTURED_PRODUCT' | 'OTHER' | 'UNKNOWN';
  instrumentClass: InstrumentClassification;
  issuerCik?: string;
  listingExchange?: ListingExchange;
  verifiedMic?: string;
  currency: string;
  country: string;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'DELISTED' | 'REVIEW';
  universe: InstrumentUniverse;
  tags: Array<'SPAC' | 'SHELL'>;
  aliases: SymbolAlias[];
  classificationEvidence: ClassificationEvidence[];
  sourceObservationIds: string[];
  sourceProvenance: MarketDataSourceProvenance[];
  conflicts: SourceConflictEvidence[];
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface InstrumentReconciliationSummary {
  totalObservations: number;
  duplicateObservations: number;
  reconciledInstruments: number;
  coreEquities: number;
  etfs: number;
  deferred: number;
  excluded: number;
  unknownReview: number;
  instrumentsWithConflicts: number;
  sourceConflicts: number;
  duplicateOrCollisionCandidates: number;
}

export interface InstrumentMasterArtifact {
  schemaVersion: typeof DATA_US_INSTRUMENT_SCHEMA_VERSION;
  generatedAt: string;
  observations: InstrumentSourceObservation[];
  lineageEvidence: InstrumentLineageEvidence[];
  records: InstrumentMasterRecord[];
  summary: InstrumentReconciliationSummary;
}

export type TradingSessionStatus = 'REGULAR' | 'EARLY_CLOSE' | 'CLOSED';

export interface CalendarConflictEvidence {
  tradingDate: string;
  primaryStatus: TradingSessionStatus;
  crossCheckStatus: TradingSessionStatus;
  primaryEarlyClose?: string;
  crossCheckEarlyClose?: string;
  resolution: 'PRIMARY_AUTHORITY_SELECTED';
  primarySourceId: string;
  crossCheckSourceId: string;
}

export interface TradingSession {
  tradingDate: string;
  timezone: 'America/New_York';
  sessionStatus: TradingSessionStatus;
  regularOpen: '09:30';
  regularClose: '16:00';
  earlyClose?: string;
  openUtc?: string;
  closeUtc?: string;
  provenance: MarketDataSourceProvenance[];
  checkedAt: string;
  sourceVersion: string;
  conflicts: CalendarConflictEvidence[];
}

export interface CalendarExceptionFact {
  tradingDate: string;
  sessionStatus: 'CLOSED' | 'EARLY_CLOSE';
  earlyClose?: string;
}

export interface CalendarSourceFacts {
  schemaVersion: 'data-us-calendar-source-facts/v1';
  timezone: 'America/New_York';
  coverageFrom: string;
  coverageTo: string;
  checkedAt: string;
  sourceVersion: string;
  provenance: MarketDataSourceProvenance;
  exceptions: CalendarExceptionFact[];
}

export interface CashEquitiesCalendarArtifact {
  schemaVersion: typeof DATA_US_CALENDAR_SCHEMA_VERSION;
  generatedAt: string;
  timezone: 'America/New_York';
  coverageFrom: string;
  coverageTo: string;
  primarySourceId: string;
  crossCheckSourceId: string;
  sessions: TradingSession[];
  conflictCount: number;
}

export const MARKET_DATA_RESULT_STATUSES = [
  'OK',
  'STALE',
  'PARTIAL',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'INVALID_SYMBOL',
  'NO_DATA',
  'UNSUPPORTED',
  'UNKNOWN',
] as const;

export type MarketDataResultStatus = (typeof MARKET_DATA_RESULT_STATUSES)[number];

export const MARKET_DATA_SESSIONS = [
  'PRE_MARKET',
  'REGULAR',
  'AFTER_HOURS',
  'CLOSED',
  'UNKNOWN',
] as const;

export type MarketDataSession = (typeof MARKET_DATA_SESSIONS)[number];

export type MarketState = MarketDataSession | 'HALTED';

export const PRICE_STATUSES = [
  'REALTIME',
  'DELAYED',
  'END_OF_DAY',
  'INDICATIVE',
  'UNKNOWN',
] as const;

export type PriceStatus = (typeof PRICE_STATUSES)[number];

export const MARKET_DATA_QUALITIES = ['GOOD', 'DEGRADED', 'REVIEW', 'UNKNOWN'] as const;

export type MarketDataQuality = (typeof MARKET_DATA_QUALITIES)[number];

export const REVISION_STATUSES = [
  'AS_PUBLISHED',
  'CORRECTED',
  'LATEST_ONLY',
  'UNKNOWN',
] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export interface MarketDataDegradationEvidence {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt?: string;
  providerStatus?: string;
}

export interface MarketDataObservationProvenance {
  provider: string;
  source: string;
  providerSymbol: string;
  sourceTimestamp?: string;
  fetchedAt: string;
  asKnownAt: string;
  derivation:
    | 'PROVIDER_NATIVE'
    | 'EXISTING_QUOTE_COMPATIBILITY'
    | 'DERIVED_INTRADAY_AGGREGATION';
  revisionStatus: RevisionStatus;
  degradationEvidence: MarketDataDegradationEvidence[];
}

export type QuoteUnavailableField =
  | 'instrumentId'
  | 'currency'
  | 'last'
  | 'bid'
  | 'ask'
  | 'bidSize'
  | 'askSize'
  | 'open'
  | 'high'
  | 'low'
  | 'previousClose'
  | 'volume'
  | 'change'
  | 'changePercent'
  | 'sourceTimestamp';

export interface QuoteSnapshot {
  schemaVersion: typeof DATA_US_QUOTE_SCHEMA_VERSION;
  instrumentId?: string;
  symbol: string;
  providerSymbol: string;
  currency?: string;
  last?: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  volume?: number;
  change?: number;
  changePercent?: number;
  marketState: MarketState;
  session: MarketDataSession;
  priceStatus: PriceStatus;
  status: MarketDataResultStatus;
  quality: MarketDataQuality;
  sourceTimestamp?: string;
  fetchedAt: string;
  asKnownAt: string;
  provider: string;
  source: string;
  provenance: MarketDataObservationProvenance;
  unavailableFields: QuoteUnavailableField[];
}

export const BAR_INTERVALS = [
  '1m',
  '5m',
  '10m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '1w',
] as const;

export type BarInterval = (typeof BAR_INTERVALS)[number];

export const INTRADAY_AGGREGATION_INTERVALS = [
  '5m',
  '10m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
] as const;

export type IntradayAggregationInterval =
  (typeof INTRADAY_AGGREGATION_INTERVALS)[number];

export const ADJUSTMENT_MODES = [
  'RAW',
  'SPLIT_ADJUSTED',
  'TOTAL_RETURN_ADJUSTED',
  'UNKNOWN',
] as const;

export type AdjustmentMode = (typeof ADJUSTMENT_MODES)[number];

export const BAR_COMPLETENESS_STATUSES = [
  'COMPLETE',
  'PARTIAL',
  'SPARSE',
  'UNKNOWN',
] as const;

export type BarCompleteness = (typeof BAR_COMPLETENESS_STATUSES)[number];

export const BAR_INTERRUPTION_STATUSES = [
  'NONE',
  'DATA_GAP',
  'HALT_CONFIRMED',
  'UNKNOWN',
] as const;

export type BarInterruptionStatus = (typeof BAR_INTERRUPTION_STATUSES)[number];

export type BarUnavailableField =
  | 'instrumentId'
  | 'volume'
  | 'tradeCount'
  | 'vwap'
  | 'sourceTimestamp';

export interface BarAggregationEvidence {
  inputBarCount: number;
  uniqueInputBarCount: number;
  exactDuplicateCount: number;
  orderingPolicy: 'SORT_BY_START_TIME';
  bucketAnchor: string;
  sourceInterval: '1m';
}

export interface OHLCVBar {
  schemaVersion: typeof DATA_US_BAR_SCHEMA_VERSION;
  instrumentId?: string;
  symbol: string;
  providerSymbol: string;
  interval: BarInterval;
  startTime: string;
  endTime: string;
  timezone: 'America/New_York';
  session: MarketDataSession;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tradeCount?: number;
  vwap?: number;
  sourceTimestamp?: string;
  fetchedAt: string;
  asKnownAt: string;
  provider: string;
  source: string;
  adjustmentMode: AdjustmentMode;
  completeness: BarCompleteness;
  expectedBarCount: number;
  observedBarCount: number;
  interruptionStatus: BarInterruptionStatus;
  status: MarketDataResultStatus;
  quality: MarketDataQuality;
  revisionStatus: RevisionStatus;
  provenance: MarketDataObservationProvenance;
  unavailableFields: BarUnavailableField[];
  aggregationEvidence?: BarAggregationEvidence;
}

export const FILING_FORMS = [
  '10-K',
  '10-K/A',
  '10-Q',
  '10-Q/A',
  '8-K',
  '8-K/A',
  '6-K',
  '20-F',
  '20-F/A',
  'OTHER',
  'UNKNOWN',
] as const;

export type FilingForm = (typeof FILING_FORMS)[number];

export const FUNDAMENTAL_REVISION_STATUSES = [
  'ORIGINAL',
  'AMENDED',
  'RESTATED',
  'CORRECTED',
  'UNKNOWN',
] as const;

export type FundamentalRevisionStatus = (typeof FUNDAMENTAL_REVISION_STATUSES)[number];

export const RESEARCH_DATA_QUALITIES = [
  'GOOD',
  'DEGRADED',
  'REVIEW',
  'CONFLICT',
  'UNRESOLVED',
  'UNKNOWN',
] as const;

export type ResearchDataQuality = (typeof RESEARCH_DATA_QUALITIES)[number];

export type ResearchAvailabilityBasis =
  | 'SEC_ACCEPTANCE'
  | 'SOURCE_PUBLICATION'
  | 'PROVIDER_DECLARED'
  | 'DERIVED_FROM_INPUTS'
  | 'UNRESOLVED';

/**
 * Provenance for immutable filing, fundamental, and corporate-action records.
 * `asKnownAt` is optional because a source row without defensible publication
 * or acceptance evidence must remain unusable to point-in-time selectors.
 */
export interface ResearchDataProvenance {
  provider: string;
  source: string;
  dataset: string;
  sourceUrl?: string;
  sourceTimestamp?: string;
  fetchedAt: string;
  asKnownAt?: string;
  availabilityBasis: ResearchAvailabilityBasis;
  derivation:
    | 'SEC_SUBMISSIONS_NORMALIZATION'
    | 'SEC_COMPANYFACTS_NORMALIZATION'
    | 'PROVIDER_NATIVE'
    | 'SYNTHETIC_NORMALIZATION'
    | 'DERIVED';
  sourceChecksum?: string;
  licenseClass: DatasetLicenseClass;
  redistribution: DatasetRedistribution;
  degradationEvidence: MarketDataDegradationEvidence[];
}

export interface ResearchConflictEvidence {
  code:
    | 'CONFLICTING_DUPLICATE'
    | 'CANONICAL_MAPPING_CONFLICT'
    | 'INCOMPATIBLE_UNITS'
    | 'MISSING_FILING_METADATA'
    | 'DATE_ORDER_REVIEW'
    | 'SOURCE_DISAGREEMENT'
    | 'UNRESOLVED_REVISION_TARGET'
    | 'UNRESOLVED_KNOWLEDGE_TIME';
  field: string;
  recordIds: string[];
  values: string[];
  resolution: 'UNRESOLVED' | 'DETERMINISTIC_PRECEDENCE' | 'REVIEW_REQUIRED';
  rationale: string;
}

export interface FilingEvent {
  schemaVersion: typeof DATA_US_FILING_EVENT_SCHEMA_VERSION;
  filingId: string;
  issuerCik: string;
  relatedInstrumentIds: string[];
  accessionNumber: string;
  form: FilingForm;
  rawForm: string;
  filingDate: string;
  acceptedAt?: string;
  reportPeriod?: string;
  primaryDocument?: string;
  filingUrl: string;
  isAmendment: boolean;
  amendmentTargetAccessionNumber?: string;
  amendmentTargetBasis?: 'SOURCE_DECLARED';
  itemCodes: string[];
  sourceTimestamp?: string;
  fetchedAt: string;
  asKnownAt?: string;
  revisionStatus: FundamentalRevisionStatus;
  status: MarketDataResultStatus;
  quality: ResearchDataQuality;
  conflicts: ResearchConflictEvidence[];
  provenance: ResearchDataProvenance;
}

export const CANONICAL_FUNDAMENTAL_METRICS = [
  'REVENUE',
  'OPERATING_INCOME',
  'NET_INCOME',
  'EPS_BASIC',
  'EPS_DILUTED',
  'ASSETS',
  'LIABILITIES',
  'EQUITY',
  'CASH_AND_CASH_EQUIVALENTS',
  'DEBT',
  'OPERATING_CASH_FLOW',
  'CAPITAL_EXPENDITURES',
  'FREE_CASH_FLOW',
  'SHARES_OUTSTANDING',
  'WEIGHTED_AVERAGE_SHARES_BASIC',
  'WEIGHTED_AVERAGE_SHARES_DILUTED',
  'GROSS_MARGIN',
  'OPERATING_MARGIN',
  'NET_MARGIN',
  'UNMAPPED',
] as const;

export type CanonicalFundamentalMetric = (typeof CANONICAL_FUNDAMENTAL_METRICS)[number];

export type FundamentalPeriodType = 'INSTANT' | 'DURATION';

export interface FundamentalDerivationEvidence {
  kind: 'REPORTED' | 'DERIVED';
  inputFactIds: string[];
  calculation?: string;
}

export interface FundamentalFact {
  schemaVersion: typeof DATA_US_FUNDAMENTAL_FACT_SCHEMA_VERSION;
  factId: string;
  issuerCik: string;
  relatedInstrumentIds: string[];
  canonicalMetric: CanonicalFundamentalMetric;
  mappingPriority?: number;
  taxonomy: string;
  taxonomyConcept: string;
  rawLabel?: string;
  rawContext?: string;
  value: number;
  unit: string;
  periodType: FundamentalPeriodType;
  periodStart?: string;
  periodEnd: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  form: FilingForm;
  rawForm: string;
  accessionNumber: string;
  filedAt: string;
  acceptedAt?: string;
  asKnownAt?: string;
  revisionStatus: FundamentalRevisionStatus;
  supersedesFactIds: string[];
  derivation: FundamentalDerivationEvidence;
  status: MarketDataResultStatus;
  quality: ResearchDataQuality;
  conflicts: ResearchConflictEvidence[];
  provenance: ResearchDataProvenance;
}

export interface FundamentalSnapshotSelection {
  canonicalMetric: Exclude<CanonicalFundamentalMetric, 'UNMAPPED'>;
  factId: string;
  value: number;
  unit: string;
  periodType: FundamentalPeriodType;
  periodStart?: string;
  periodEnd: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  accessionNumber: string;
  revisionStatus: FundamentalRevisionStatus;
  factAsKnownAt: string;
  selectionEvidence: string[];
}

export interface FundamentalSnapshot {
  schemaVersion: typeof DATA_US_FUNDAMENTAL_SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  issuerCik: string;
  relatedInstrumentIds: string[];
  asKnownAt: string;
  selectedFacts: FundamentalSnapshotSelection[];
  missingMetrics: Array<Exclude<CanonicalFundamentalMetric, 'UNMAPPED'>>;
  unmappedFactIds: string[];
  unresolvedKnowledgeFactIds: string[];
  conflicts: ResearchConflictEvidence[];
  revisionStatuses: FundamentalRevisionStatus[];
  derivations: FundamentalDerivationEvidence[];
}

export const CORPORATE_ACTION_TYPES = [
  'CASH_DIVIDEND',
  'STOCK_DIVIDEND',
  'STOCK_SPLIT',
  'REVERSE_SPLIT',
  'SYMBOL_CHANGE',
  'MERGER',
  'ACQUISITION',
  'SPINOFF',
  'DELISTING',
  'LISTING',
  'OTHER',
  'UNKNOWN',
] as const;

export type CorporateActionType = (typeof CORPORATE_ACTION_TYPES)[number];

export const CORPORATE_ACTION_STATUSES = [
  'ANNOUNCED',
  'CONFIRMED',
  'CORRECTED',
  'CANCELLED',
  'UNKNOWN',
] as const;

export type CorporateActionStatus = (typeof CORPORATE_ACTION_STATUSES)[number];

export const CORPORATE_ACTION_KNOWLEDGE_TIME_PRECISIONS = [
  'EXACT_TIMESTAMP',
  'DATE_ONLY',
  'UNKNOWN',
] as const;

/** Precision of the source evidence used to establish corporate-action knowledge time. */
export type CorporateActionKnowledgeTimePrecision =
  (typeof CORPORATE_ACTION_KNOWLEDGE_TIME_PRECISIONS)[number];

export const CORPORATE_ACTION_EFFECTIVE_TIME_PRECISIONS = [
  'EXACT_TIMESTAMP',
  'DATE_ONLY',
  'UNKNOWN',
] as const;

/** Precision of the action's effective time, independent of when it became known. */
export type CorporateActionEffectiveTimePrecision =
  (typeof CORPORATE_ACTION_EFFECTIVE_TIME_PRECISIONS)[number];

/**
 * Share conversion terms. `fromQuantity` is the pre-action share quantity and
 * `toQuantity` is the post-action share quantity. A future share multiplier is
 * therefore `toQuantity / fromQuantity`; this is not a price multiplier.
 */
export interface CorporateActionSplitRatio {
  fromQuantity: number;
  toQuantity: number;
}

export interface CorporateActionIdentityContinuity {
  disposition: 'CONTINUE_INSTRUMENT' | 'NEW_INSTRUMENT' | 'UNRESOLVED';
  lineageEvidenceIds: string[];
}

export interface CorporateAction {
  schemaVersion: typeof DATA_US_CORPORATE_ACTION_SCHEMA_VERSION;
  actionId: string;
  sourceActionId: string;
  instrumentId: string;
  issuerCik?: string;
  actionType: CorporateActionType;
  rawActionType: string;
  announcementDate?: string;
  exDate?: string;
  recordDate?: string;
  payableDate?: string;
  /** Calendar date reported by the source. It must not be rendered as midnight UTC. */
  effectiveDate?: string;
  /** Exact UTC instant, present only when the source supplied exact time evidence. */
  effectiveAt?: string;
  effectiveTimePrecision?: CorporateActionEffectiveTimePrecision;
  /** Original local wall-clock and IANA zone when an exact instant was normalized from them. */
  effectiveLocalDateTime?: string;
  effectiveTimeZone?: string;
  splitRatio?: CorporateActionSplitRatio;
  cashAmount?: number;
  currency?: string;
  oldSymbol?: string;
  newSymbol?: string;
  relatedInstrumentIds: string[];
  status: CorporateActionStatus;
  supersedesActionIds: string[];
  identityContinuity?: CorporateActionIdentityContinuity;
  barAdjustmentTreatment:
    | 'SPLIT_LEDGER_CANDIDATE'
    | 'CASH_DISTRIBUTION_EVIDENCE'
    | 'NO_AUTOMATIC_ADJUSTMENT'
    | 'UNKNOWN';
  sourceTimestamp?: string;
  fetchedAt: string;
  /** Defined only when `knowledgeTimePrecision` is `EXACT_TIMESTAMP`. */
  asKnownAt?: string;
  knowledgeTimePrecision: CorporateActionKnowledgeTimePrecision;
  quality: ResearchDataQuality;
  conflicts: ResearchConflictEvidence[];
  provenance: ResearchDataProvenance;
}

export interface ArtifactManifestEntry {
  path: string;
  checksum: string;
  records: number;
}

export interface DataUsFoundationSourceEntry extends MarketDataSourceProvenance {
  observationCount: number;
  parserStatus: 'ACCEPTED';
}

export interface DataUsFoundationManifest {
  schemaVersion: typeof DATA_US_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  generatorVersion: string;
  sourceCommit?: string;
  lineageEvidenceChecksum?: string;
  distributionPolicy: 'COMMIT_ALLOWED' | 'OPERATOR_ONLY_DO_NOT_COMMIT';
  sources: DataUsFoundationSourceEntry[];
  outputs: ArtifactManifestEntry[];
  counts: InstrumentReconciliationSummary & {
    calendarSessions: number;
    calendarConflicts: number;
  };
}
