/**
 * Holding-universe and sync-status shapes the shared screens read.
 *
 * The open-source package has no broker connection: it contains no order, execution, trade-ledger,
 * position-episode or behaviour types, no code that reads or stores them, and no account data.
 * Those exist only in the private deployment. The file keeps its name because the screens shared
 * byte-for-byte with that deployment import it by this path.
 */
export const TOSSINVEST_SCHEMA_VERSION = 'tossinvest-owner-portfolio/v1' as const;

export type TossDecimal = string;
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
