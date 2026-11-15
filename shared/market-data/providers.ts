import type {
  AdjustmentMode,
  BarInterval,
  CorporateAction,
  CorporateActionType,
  FilingEvent,
  FilingForm,
  FundamentalFact,
  MarketDataDegradationEvidence,
  MarketDataResultStatus,
  MarketDataSession,
  OHLCVBar,
  PriceStatus,
  QuoteSnapshot,
} from './contracts.ts';

export interface MarketDataLookback {
  amount: number;
  unit: 'MINUTE' | 'DAY' | 'MONTH' | 'YEAR';
}

export type ExtendedHoursBoundary =
  | {
      basis: 'CANONICAL_STANDARD' | 'PROVIDER_DECLARED' | 'VENUE_DECLARED';
      start: string;
      end: string;
      source: string;
    }
  | {
      basis: 'UNKNOWN' | 'UNSUPPORTED';
      source?: string;
    };

export interface ExtendedHoursDayBoundaries {
  regularDay?: ExtendedHoursBoundary;
  earlyCloseDay?: ExtendedHoursBoundary;
}

export interface ExtendedHoursCapability {
  supported: boolean;
  timezone: 'America/New_York';
  preMarket?: ExtendedHoursDayBoundaries;
  afterHours?: ExtendedHoursDayBoundaries;
}

/**
 * Provider-declared facts used by routers. Callers choose capabilities, never
 * provider names, so provider selection and cost policy remain replaceable.
 */
export interface MarketDataProviderCapabilities {
  realtimeQuote: boolean;
  delayedQuote: boolean;
  endOfDayQuote: boolean;
  intradayBars: boolean;
  extendedHours: ExtendedHoursCapability;
  dailyBars: boolean;
  weeklyBars: boolean;
  adjustedBars: boolean;
  maxIntradayLookback?: MarketDataLookback;
  supportedIntervals: readonly BarInterval[];
  supportedAdjustments: readonly AdjustmentMode[];
  quotePriceStatuses: readonly PriceStatus[];
}

export interface MarketQuoteRequest {
  instrumentId?: string;
  symbol: string;
  providerSymbol?: string;
  asKnownAt: string;
}

export interface MarketBarRequest extends MarketQuoteRequest {
  interval: BarInterval;
  from: string;
  to: string;
  sessions: readonly Exclude<MarketDataSession, 'CLOSED' | 'UNKNOWN'>[];
  adjustmentMode: AdjustmentMode;
}

export interface MarketDataProviderResult<T> {
  status: MarketDataResultStatus;
  records: readonly T[];
  evidence: readonly MarketDataDegradationEvidence[];
  retryAfterMs?: number;
}

export interface MarketQuoteProvider {
  readonly providerId: string;
  readonly capabilities: MarketDataProviderCapabilities;
  getQuote(request: MarketQuoteRequest): Promise<MarketDataProviderResult<QuoteSnapshot>>;
}

export interface MarketBarProvider {
  readonly providerId: string;
  readonly capabilities: MarketDataProviderCapabilities;
  getBars(request: MarketBarRequest): Promise<MarketDataProviderResult<OHLCVBar>>;
}

export interface ResearchDataHistoricalCoverage {
  from?: string;
  to?: string;
}

export interface FundamentalDataProviderCapabilities {
  fundamentals: boolean;
  pointInTime: boolean;
  revisionHistory: boolean;
  supportedTaxonomies: readonly string[];
  historicalCoverage?: ResearchDataHistoricalCoverage;
  sourceTimestamps: boolean;
}

export interface FilingEventProviderCapabilities {
  filingEvents: boolean;
  supportedForms: readonly FilingForm[];
  acceptedTimestamps: boolean;
  amendmentReferences: boolean;
  itemCodes: boolean;
  historicalCoverage?: ResearchDataHistoricalCoverage;
}

export interface CorporateActionProviderCapabilities {
  corporateActions: boolean;
  supportedActionTypes: readonly CorporateActionType[];
  pointInTime: boolean;
  revisionHistory: boolean;
  sourceTimestamps: boolean;
  historicalCoverage?: ResearchDataHistoricalCoverage;
}

export interface FundamentalDataRequest {
  issuerCik: string;
  relatedInstrumentIds?: readonly string[];
  asKnownAt: string;
  fromPeriodEnd?: string;
  toPeriodEnd?: string;
}

export interface FilingEventRequest {
  issuerCik: string;
  relatedInstrumentIds?: readonly string[];
  asKnownAt: string;
  forms?: readonly FilingForm[];
  fromFilingDate?: string;
  toFilingDate?: string;
}

export interface CorporateActionRequest {
  instrumentId: string;
  issuerCik?: string;
  asKnownAt: string;
  actionTypes?: readonly CorporateActionType[];
  fromEffectiveDate?: string;
  toEffectiveDate?: string;
}

export interface ResearchDataProviderResult<T> {
  status: MarketDataResultStatus;
  records: readonly T[];
  evidence: readonly MarketDataDegradationEvidence[];
  retryAfterMs?: number;
}

export interface FundamentalDataProvider {
  readonly providerId: string;
  readonly capabilities: FundamentalDataProviderCapabilities;
  getFundamentalFacts(request: FundamentalDataRequest): Promise<ResearchDataProviderResult<FundamentalFact>>;
}

export interface FilingEventProvider {
  readonly providerId: string;
  readonly capabilities: FilingEventProviderCapabilities;
  getFilingEvents(request: FilingEventRequest): Promise<ResearchDataProviderResult<FilingEvent>>;
}

export interface CorporateActionProvider {
  readonly providerId: string;
  readonly capabilities: CorporateActionProviderCapabilities;
  getCorporateActions(request: CorporateActionRequest): Promise<ResearchDataProviderResult<CorporateAction>>;
}
