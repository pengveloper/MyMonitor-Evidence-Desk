/**
 * Provider-neutral market-data capability registry.
 *
 * This module is configuration only: it contains no credential lookup, network
 * client, or provider response shape. Server-side composition supplies the
 * credential-presence boolean and routers select capabilities rather than
 * branching on provider names.
 */

export const MARKET_DATA_CAPABILITIES = [
  'EOD',
  'INTRADAY',
  'LIVE',
  'FUNDAMENTALS',
  'CORPORATE_EVENTS',
  'FINANCIAL_NEWS',
  'SYMBOL_SEARCH',
  'SCREENER',
  'TICK_DATA',
] as const;

export type MarketDataCapability = (typeof MARKET_DATA_CAPABILITIES)[number];

export interface MarketDataCapabilityRegistration {
  capability: MarketDataCapability;
  /** Product/runtime switch. False means no production caller may use it. */
  enabled: boolean;
  /** Credential is present. This does not assert endpoint authorization. */
  configured: boolean;
  cachePolicy: {
    mode: 'DERIVED_REDIS' | 'CANONICAL_DURABLE' | 'ON_DEMAND' | 'DISABLED';
    ttlSeconds?: number;
    key?: string;
  };
  expectedFreshness: {
    cadence: 'MARKET_SESSION' | 'INTRADAY' | 'EVENT_DRIVEN' | 'ON_DEMAND';
    maxAgeMinutes?: number;
  };
  usageScope: readonly string[];
  provenance: {
    providerId: string;
    dataset: string;
    adapterBoundary: string;
    canonicalContract: string;
  };
  licenseUsageNotes: readonly string[];
  creditCost: {
    class: 'FIXED_HIGH' | 'VARIABLE' | 'DOCUMENTATION_REQUIRED';
    creditsPerRequest?: number;
    unit: string;
  };
  externalLlm: {
    raw: 'DENY';
    canonical: 'DENY_BY_DEFAULT';
    derived: 'SUMMARY_ONLY_REVIEW';
  };
}

export interface MarketDataProviderRegistration {
  providerId: string;
  displayName: string;
  credentialEnv: string;
  executionScope: 'SERVER_SIDE_ONLY';
  capabilities: Readonly<Record<MarketDataCapability, MarketDataCapabilityRegistration>>;
}

const EODHD_COMMON_LICENSE_NOTES = Object.freeze([
  'Server-side adapter use only; never expose the credential or raw payload in browser build inputs.',
  'Provider-plan access does not by itself prove redistribution rights; review the active license before a new serving scope.',
  'Keep provider-specific raw data separate from canonical records and derived MyMonitor intelligence.',
]);

const EXTERNAL_LLM_POLICY = Object.freeze({
  raw: 'DENY',
  canonical: 'DENY_BY_DEFAULT',
  derived: 'SUMMARY_ONLY_REVIEW',
} as const);

function disabledCachePolicy(): MarketDataCapabilityRegistration['cachePolicy'] {
  return { mode: 'DISABLED' };
}

/**
 * Build the EODHD registration without reading or retaining a secret. The
 * caller passes only whether the server-side credential is present.
 */
export function createEodhdProviderRegistration(
  credentialConfigured: boolean,
): MarketDataProviderRegistration {
  const common = {
    configured: credentialConfigured,
    externalLlm: EXTERNAL_LLM_POLICY,
  } as const;
  const capabilityEntries: Record<MarketDataCapability, MarketDataCapabilityRegistration> = {
    EOD: {
      ...common,
      capability: 'EOD',
      enabled: true,
      cachePolicy: {
        mode: 'DERIVED_REDIS',
        ttlSeconds: 2_592_000,
        key: 'market:breadth-history:v1',
      },
      expectedFreshness: { cadence: 'MARKET_SESSION', maxAgeMinutes: 2_880 },
      usageScope: ['P1_MARKET_BREADTH', 'P1_EOD_FOUNDATION'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'eod-bulk-last-day/extended',
        adapterBoundary: 'scripts/_market-breadth-eodhd.mjs',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: [
        ...EODHD_COMMON_LICENSE_NOTES,
        'The active breadth path publishes only derived percentages, coverage, methodology, and provenance.',
      ],
      creditCost: {
        class: 'FIXED_HIGH',
        creditsPerRequest: 100,
        unit: 'exchange_observation_date',
      },
    },
    INTRADAY: {
      ...common,
      capability: 'INTRADAY',
      enabled: false,
      cachePolicy: disabledCachePolicy(),
      expectedFreshness: { cadence: 'INTRADAY', maxAgeMinutes: 15 },
      usageScope: ['P6_CONCRETE_INTELLIGENCE_USE_CASE_ONLY'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'intraday',
        adapterBoundary: 'not_implemented',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: EODHD_COMMON_LICENSE_NOTES,
      creditCost: { class: 'DOCUMENTATION_REQUIRED', unit: 'request' },
    },
    LIVE: {
      ...common,
      capability: 'LIVE',
      enabled: true,
      cachePolicy: { mode: 'ON_DEMAND', ttlSeconds: 60 },
      expectedFreshness: { cadence: 'INTRADAY', maxAgeMinutes: 20 },
      usageScope: ['OWNER_PRIVATE_DELAYED_QUOTE'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'live',
        adapterBoundary: 'server/_shared/owner-eodhd.ts',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: EODHD_COMMON_LICENSE_NOTES,
      creditCost: { class: 'DOCUMENTATION_REQUIRED', unit: 'request_or_subscription' },
    },
    FUNDAMENTALS: {
      ...common,
      capability: 'FUNDAMENTALS',
      enabled: true,
      cachePolicy: { mode: 'ON_DEMAND', ttlSeconds: 86400 },
      expectedFreshness: { cadence: 'ON_DEMAND', maxAgeMinutes: 1_440 },
      usageScope: ['OWNER_AUTHENTICATED_PERSONAL_ONLY', 'P3_WATCHLIST_ACTIVE_STOCK_ON_DEMAND'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'fundamentals',
        adapterBoundary: 'server/_shared/owner-eodhd.ts',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: EODHD_COMMON_LICENSE_NOTES,
      creditCost: { class: 'VARIABLE', unit: 'instrument_request' },
    },
    CORPORATE_EVENTS: {
      ...common,
      capability: 'CORPORATE_EVENTS',
      enabled: true,
      cachePolicy: { mode: 'ON_DEMAND', ttlSeconds: 43200 },
      expectedFreshness: { cadence: 'EVENT_DRIVEN', maxAgeMinutes: 720 },
      usageScope: ['OWNER_AUTHENTICATED_PERSONAL_ONLY', 'OWNER_SPLITS_ONLY_OTHER_EVENTS_NOT_WIRED'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'calendar_and_corporate_actions',
        adapterBoundary: 'server/_shared/owner-eodhd.ts',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: EODHD_COMMON_LICENSE_NOTES,
      creditCost: { class: 'VARIABLE', unit: 'date_range_or_instrument_request' },
    },
    FINANCIAL_NEWS: {
      ...common,
      capability: 'FINANCIAL_NEWS',
      enabled: true,
      cachePolicy: { mode: 'ON_DEMAND', ttlSeconds: 900 },
      expectedFreshness: { cadence: 'EVENT_DRIVEN', maxAgeMinutes: 15 },
      usageScope: ['OWNER_AUTHENTICATED_PERSONAL_ONLY', 'P5_MARKET_LAYER_ONLY', 'NOT_WORLD_OR_GEOPOLITICS_NEWS_REPLACEMENT'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'financial_news_and_sentiment',
        adapterBoundary: 'server/_shared/owner-eodhd.ts',
        canonicalContract: 'shared/intelligence-bridge-contract.ts',
      },
      licenseUsageNotes: [
        ...EODHD_COMMON_LICENSE_NOTES,
        'Financial news is a bounded authenticated personal MARKET-layer input, not a replacement for WorldMonitor world/geopolitics news.',
      ],
      creditCost: { class: 'VARIABLE', unit: 'query_request' },
    },
    SYMBOL_SEARCH: {
      ...common,
      capability: 'SYMBOL_SEARCH',
      enabled: true,
      cachePolicy: { mode: 'ON_DEMAND', ttlSeconds: 600 },
      expectedFreshness: { cadence: 'ON_DEMAND', maxAgeMinutes: 10 },
      usageScope: ['WATCHLIST_ACTIVE_US_STOCK_DISCOVERY'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'search/active-us-stocks',
        adapterBoundary: 'api/symbol-search.ts',
        canonicalContract: 'shared/symbol-search-contract.ts',
      },
      licenseUsageNotes: [
        ...EODHD_COMMON_LICENSE_NOTES,
        'Only bounded canonical search metadata is returned; raw Search payloads remain server-side.',
      ],
      creditCost: { class: 'DOCUMENTATION_REQUIRED', unit: 'query_request' },
    },
    SCREENER: {
      ...common,
      capability: 'SCREENER',
      enabled: false,
      cachePolicy: disabledCachePolicy(),
      expectedFreshness: { cadence: 'ON_DEMAND' },
      usageScope: ['FUTURE_BOUNDED_DISCOVERY_ONLY'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'screener',
        adapterBoundary: 'not_implemented',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: EODHD_COMMON_LICENSE_NOTES,
      creditCost: { class: 'VARIABLE', unit: 'query_request' },
    },
    TICK_DATA: {
      ...common,
      capability: 'TICK_DATA',
      enabled: false,
      cachePolicy: disabledCachePolicy(),
      expectedFreshness: { cadence: 'INTRADAY', maxAgeMinutes: 1 },
      usageScope: ['P6_CONCRETE_INTELLIGENCE_USE_CASE_ONLY'],
      provenance: {
        providerId: 'eodhd',
        dataset: 'tick_data',
        adapterBoundary: 'not_implemented',
        canonicalContract: 'shared/market-data/contracts.ts',
      },
      licenseUsageNotes: EODHD_COMMON_LICENSE_NOTES,
      creditCost: { class: 'DOCUMENTATION_REQUIRED', unit: 'request_or_subscription' },
    },
  };

  return Object.freeze({
    providerId: 'eodhd',
    displayName: 'EODHD',
    credentialEnv: 'EODHD_API_TOKEN',
    executionScope: 'SERVER_SIDE_ONLY',
    capabilities: Object.freeze(capabilityEntries),
  });
}
