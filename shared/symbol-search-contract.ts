/**
 * Provider-neutral symbol discovery contract shared by the Edge adapter and
 * the browser watchlist editor. Provider payloads must be reduced to this
 * shape before they cross the API boundary.
 */

export const SYMBOL_SEARCH_PROVIDERS = ['eodhd', 'finnhub', 'sec', 'catalog'] as const;
export type SymbolSearchProvider = (typeof SYMBOL_SEARCH_PROVIDERS)[number];

export const SYMBOL_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE', 'DELISTED', 'UNKNOWN'] as const;
export type SymbolActiveStatus = (typeof SYMBOL_ACTIVE_STATUSES)[number];

export const INSTRUMENT_TYPES = [
  'COMMON_STOCK',
  'ETF',
  'ADR',
  'FUND',
  'INDEX',
  'ETN',
  'PREFERRED',
  'UNKNOWN',
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

export const ASSET_CLASSES = ['EQUITY', 'ETF', 'FUND', 'INDEX', 'UNKNOWN'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export interface CanonicalSymbolSearchResult {
  /** Canonical ticker consumed by MyMonitor market and intelligence paths. */
  symbol: string;
  /** Ticker shown to the user; provider suffixes are intentionally omitted. */
  displaySymbol: string;
  /** Provider-native identifier used for future provider calls. */
  providerSymbol: string;
  name: string;
  /** Specific listing venue when verified; otherwise the provider's US code. */
  exchange: string;
  country: string;
  currency: string;
  instrumentType: InstrumentType;
  assetClass: AssetClass;
  isin?: string;
  /** Zero-padded SEC issuer CIK when the SEC registry resolves the ticker. */
  cik?: string;
  provider: SymbolSearchProvider;
  activeStatus: SymbolActiveStatus;
}

const PROVIDERS = new Set<string>(SYMBOL_SEARCH_PROVIDERS);
const ACTIVE_STATUSES = new Set<string>(SYMBOL_ACTIVE_STATUSES);
const INSTRUMENT_TYPE_VALUES = new Set<string>(INSTRUMENT_TYPES);
const ASSET_CLASS_VALUES = new Set<string>(ASSET_CLASSES);
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;
const PROVIDER_SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,19}$/;
const CIK_RE = /^\d{10}$/;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

function requiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

/**
 * Validate an API/cache/browser value before it becomes a selectable symbol.
 * Unknown fields are ignored so the contract can evolve additively.
 */
export function parseCanonicalSymbolSearchResult(value: unknown): CanonicalSymbolSearchResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const symbol = requiredText(candidate.symbol, 15)?.toUpperCase() ?? null;
  const displaySymbol = requiredText(candidate.displaySymbol, 15)?.toUpperCase() ?? null;
  const providerSymbol = requiredText(candidate.providerSymbol, 20)?.toUpperCase() ?? null;
  const name = requiredText(candidate.name, 200);
  const exchange = requiredText(candidate.exchange, 32)?.toUpperCase() ?? null;
  const country = requiredText(candidate.country, 64);
  const currency = requiredText(candidate.currency, 8)?.toUpperCase() ?? null;
  const instrumentType = requiredText(candidate.instrumentType, 64)?.toUpperCase() ?? null;
  const assetClass = requiredText(candidate.assetClass, 32)?.toUpperCase() ?? null;
  const provider = requiredText(candidate.provider, 16)?.toLowerCase() ?? null;
  const activeStatus = requiredText(candidate.activeStatus, 16)?.toUpperCase() ?? null;
  if (
    !symbol || !SYMBOL_RE.test(symbol)
    || !displaySymbol || !SYMBOL_RE.test(displaySymbol)
    || !providerSymbol || !PROVIDER_SYMBOL_RE.test(providerSymbol)
    || !name || !exchange || !country || !currency
    || !instrumentType || !INSTRUMENT_TYPE_VALUES.has(instrumentType)
    || !assetClass || !ASSET_CLASS_VALUES.has(assetClass)
    || !provider || !PROVIDERS.has(provider)
    || !activeStatus || !ACTIVE_STATUSES.has(activeStatus)
  ) return null;

  const isin = candidate.isin === undefined ? undefined : requiredText(candidate.isin, 12)?.toUpperCase();
  if (candidate.isin !== undefined && (!isin || !ISIN_RE.test(isin))) return null;
  const cik = candidate.cik === undefined ? undefined : requiredText(candidate.cik, 10);
  if (candidate.cik !== undefined && (!cik || !CIK_RE.test(cik))) return null;

  return {
    symbol,
    displaySymbol,
    providerSymbol,
    name,
    exchange,
    country,
    currency,
    instrumentType: instrumentType as InstrumentType,
    assetClass: assetClass as AssetClass,
    ...(isin ? { isin } : {}),
    ...(cik ? { cik } : {}),
    provider: provider as SymbolSearchProvider,
    activeStatus: activeStatus as SymbolActiveStatus,
  };
}

export function parseCanonicalSymbolSearchResults(value: unknown, limit = 12): CanonicalSymbolSearchResult[] {
  if (!Array.isArray(value)) return [];
  const out: CanonicalSymbolSearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const parsed = parseCanonicalSymbolSearchResult(raw);
    if (!parsed || seen.has(parsed.symbol)) continue;
    seen.add(parsed.symbol);
    out.push(parsed);
    if (out.length >= limit) break;
  }
  return out;
}
