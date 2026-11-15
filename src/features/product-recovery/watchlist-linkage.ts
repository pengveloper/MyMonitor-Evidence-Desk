import type { OwnerUniverseEntry } from '../../../shared/tossinvest-contract';
import { STOCK_CATALOG } from '@/config/markets';
import {
  getCatalogSelection,
  getMarketWatchlistEntries,
  resolveEffectiveMarketWatchlist,
  type MarketSymbolMeta,
  type MarketWatchlistEntry,
} from '@/services/market-watchlist';
import { normalizeStockResearchSymbol, stockResearchUrl } from '@/features/stock-research/stock-research-route';
import { ENTITY_REGISTRY, type EntityEntry } from '../../../shared/entity-registry.js';

export type WatchlistMatchBasis =
  | 'EXPLICIT_SYMBOL'
  | 'EXPLICIT_ENTITY'
  | 'EXACT_TICKER'
  | 'WATCHLIST_NAME'
  | 'REGISTERED_COMPANY_ALIAS';

export interface WatchlistLinkCandidate {
  /** Headline or other bounded user-visible text. Summaries are not inferred automatically. */
  title?: string;
  /** Symbols explicitly supplied by an upstream contract. */
  symbols?: readonly string[];
  /** Entity identities explicitly supplied by the existing entity pipeline. */
  entityIds?: readonly string[];
}

export interface WatchlistStockLink {
  symbol: string;
  label: string;
  href: string;
  basis: WatchlistMatchBasis;
  matchedText: string;
}

export type WatchlistLinkageResult =
  | { state: 'EMPTY_WATCHLIST'; links: [] }
  | { state: 'NO_MATCH'; links: [] }
  | { state: 'MATCHED'; links: WatchlistStockLink[] };

const MATCH_PRIORITY: Record<WatchlistMatchBasis, number> = {
  EXPLICIT_SYMBOL: 0,
  EXPLICIT_ENTITY: 1,
  EXACT_TICKER: 2,
  WATCHLIST_NAME: 3,
  REGISTERED_COMPANY_ALIAS: 4,
};

function normalizeIdentity(raw: string): string | null {
  return normalizeStockResearchSymbol(raw);
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match a complete Unicode word/phrase, never a substring inside another word. */
function exactPhrase(text: string, phrase: string, caseSensitive = false): string | null {
  const candidate = phrase.trim();
  if (!candidate || candidate.replace(/[^\p{L}\p{N}]/gu, '').length < 3) return null;
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(${escapeRegex(candidate)})(?=$|[^\\p{L}\\p{N}])`,
    caseSensitive ? 'u' : 'iu',
  );
  return text.match(pattern)?.[1] ?? null;
}

function exactTicker(text: string, symbol: string): string | null {
  const marked = text.match(new RegExp(
    `(?:\\$|(?:NASDAQ|NYSE|AMEX|OTC)\\s*:\\s*)(${escapeRegex(symbol)})(?=$|[^A-Z0-9])`,
    'i',
  ))?.[1];
  if (marked) return marked;

  // Short, unmarked tickers such as V or AI are ordinary words too often to
  // establish an issuer relationship. Structured symbols still match above.
  const compactLength = symbol.replace(/[^A-Z0-9]/g, '').length;
  return compactLength >= 3 ? exactPhrase(text, symbol, true) : null;
}

function companyEntityForSymbol(symbol: string, entities: readonly EntityEntry[]): EntityEntry | undefined {
  return entities.find((entity) => entity.type === 'company' && normalizeIdentity(entity.id) === symbol);
}

function companyAliasMatch(text: string, entity: EntityEntry | undefined): string | null {
  if (!entity) return null;
  for (const phrase of [entity.name, ...entity.aliases]) {
    const normalizedAlias = normalizeIdentity(phrase);
    if (normalizedAlias === normalizeIdentity(entity.id)) continue;
    const matched = exactPhrase(text, phrase);
    if (matched) return matched;
  }
  return null;
}

function candidateIdentities(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).flatMap((value) => {
    const normalized = normalizeIdentity(value);
    return normalized ? [normalized] : [];
  }));
}

function linkableWatchlist(entries: readonly MarketWatchlistEntry[]): MarketWatchlistEntry[] {
  const seen = new Set<string>();
  const linkable: MarketWatchlistEntry[] = [];
  for (const entry of entries) {
    const symbol = normalizeIdentity(entry.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    linkable.push({ ...entry, symbol });
  }
  return linkable;
}

/**
 * Resolve only the owner's explicit catalog/custom selections. The seeded
 * market defaults are useful market context, but are not evidence that the
 * owner chose those issuers for their watchlist.
 */
export function resolveOwnerSelectedWatchlist(
  catalog: readonly MarketSymbolMeta[],
  catalogSelection: readonly string[] | null | undefined,
  customEntries: readonly MarketWatchlistEntry[] | null | undefined,
): MarketWatchlistEntry[] {
  const selected = resolveEffectiveMarketWatchlist(
    catalog,
    [],
    catalogSelection,
    customEntries,
  ).symbols;
  return linkableWatchlist(selected);
}

/** Private broker relevance takes precedence without persisting holdings into browser preferences. */
export function resolveOwnerRelevantWatchlist(
  manual: readonly MarketWatchlistEntry[],
  entries: readonly Pick<OwnerUniverseEntry, 'symbol' | 'actualHolding' | 'recentlyTraded' | 'priority'>[],
): MarketWatchlistEntry[] {
  const names = new Map(linkableWatchlist(manual).map(entry => [entry.symbol, entry]));
  const relevant = entries.filter(entry => entry.actualHolding || entry.recentlyTraded)
    .slice().sort((a, b) => Number(b.actualHolding) - Number(a.actualHolding) || a.priority - b.priority)
    .flatMap(entry => {
      const symbol = normalizeIdentity(entry.symbol);
      return symbol ? [{ ...names.get(symbol), symbol }] : [];
    });
  return linkableWatchlist([...relevant, ...manual]);
}

export function getOwnerSelectedWatchlist(): MarketWatchlistEntry[] {
  return resolveOwnerSelectedWatchlist(
    STOCK_CATALOG,
    getCatalogSelection(),
    getMarketWatchlistEntries(),
  );
}

/**
 * Link an item to explicitly selected stocks without keyword, related-entity,
 * sector, or sentiment inference. Output order follows the owner's watchlist.
 */
export function matchOwnerWatchlistLinks(
  candidate: WatchlistLinkCandidate,
  watchlistEntries: readonly MarketWatchlistEntry[],
  entities: readonly EntityEntry[] = ENTITY_REGISTRY,
): WatchlistLinkageResult {
  const watchlist = linkableWatchlist(watchlistEntries);
  if (watchlist.length === 0) return { state: 'EMPTY_WATCHLIST', links: [] };

  const explicitSymbols = candidateIdentities(candidate.symbols);
  const explicitEntities = candidateIdentities(candidate.entityIds);
  const title = candidate.title?.trim() ?? '';
  const links: WatchlistStockLink[] = [];

  for (const entry of watchlist) {
    const entity = companyEntityForSymbol(entry.symbol, entities);
    const matches: Array<{ basis: WatchlistMatchBasis; matchedText: string }> = [];

    if (explicitSymbols.has(entry.symbol)) {
      matches.push({ basis: 'EXPLICIT_SYMBOL', matchedText: entry.symbol });
    }
    if (explicitEntities.has(entry.symbol)) {
      matches.push({ basis: 'EXPLICIT_ENTITY', matchedText: entry.symbol });
    }
    if (title) {
      const ticker = exactTicker(title, entry.symbol);
      if (ticker) matches.push({ basis: 'EXACT_TICKER', matchedText: ticker });

      const watchlistName = entry.name ? exactPhrase(title, entry.name) : null;
      if (watchlistName) matches.push({ basis: 'WATCHLIST_NAME', matchedText: watchlistName });

      const registeredAlias = companyAliasMatch(title, entity);
      if (registeredAlias) {
        matches.push({ basis: 'REGISTERED_COMPANY_ALIAS', matchedText: registeredAlias });
      }
    }

    matches.sort((left, right) => MATCH_PRIORITY[left.basis] - MATCH_PRIORITY[right.basis]);
    const match = matches[0];
    if (!match) continue;
    links.push({
      symbol: entry.symbol,
      label: entry.display || entry.name || entry.symbol,
      href: stockResearchUrl(entry.symbol),
      basis: match.basis,
      matchedText: match.matchedText,
    });
  }

  return links.length > 0 ? { state: 'MATCHED', links } : { state: 'NO_MATCH', links: [] };
}
