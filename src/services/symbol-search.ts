/**
 * Client for /api/symbol-search — the watchlist editor's typeahead source.
 *
 * Cancels the in-flight request when a newer query supersedes it, so the
 * dropdown never flashes a stale result set after the user keeps typing.
 */

import { STOCK_CATALOG } from '@/config/markets';
import type { MarketWatchlistEntry } from '@/services/market-watchlist';
import {
  parseCanonicalSymbolSearchResults,
  type CanonicalSymbolSearchResult,
} from '../../shared/symbol-search-contract';

export type SymbolSearchResult = CanonicalSymbolSearchResult;

let _inflight: AbortController | null = null;

/**
 * Search stocks by ticker or company name. An empty query or superseded
 * request returns []; a remote failure falls back to the curated US catalog.
 */
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Supersede any in-flight search — the user has typed more since.
  _inflight?.abort();
  const controller = new AbortController();
  _inflight = controller;

  try {
    const res = await fetch(`/api/symbol-search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return localCatalogResults(q);
    const data = (await res.json()) as { results?: unknown };
    return mergeResults(parseCanonicalSymbolSearchResults(data.results), localCatalogResults(q), q);
  } catch (err) {
    // AbortError = superseded by a newer query; everything else = transient
    // failure. Either way the dropdown just shows nothing.
    void err;
    return controller.signal.aborted ? [] : localCatalogResults(q);
  } finally {
    if (_inflight === controller) _inflight = null;
  }
}

/** A resolved search result is directly usable as a watchlist entry. */
export function toWatchlistEntry(r: SymbolSearchResult): MarketWatchlistEntry {
  return {
    symbol: r.symbol,
    name: r.name,
    display: r.displaySymbol,
    displaySymbol: r.displaySymbol,
    providerSymbol: r.providerSymbol,
    exchange: r.exchange,
    country: r.country,
    currency: r.currency,
    instrumentType: r.instrumentType,
    assetClass: r.assetClass,
    ...(r.isin ? { isin: r.isin } : {}),
    ...(r.cik ? { cik: r.cik } : {}),
    provider: r.provider,
    activeStatus: r.activeStatus,
  };
}

function queryTicker(query: string): string {
  return query.trim().toUpperCase().replace(/\.US$/, '');
}

function localCatalogResults(query: string): SymbolSearchResult[] {
  const needle = queryTicker(query).toLowerCase();
  if (!needle) return [];
  return STOCK_CATALOG
    .filter((entry) => entry.region === 'us' && !entry.symbol.startsWith('^'))
    .filter((entry) => [entry.symbol, entry.display, entry.name]
      .some((value) => value.toLowerCase().includes(needle)))
    .slice(0, 12)
    .map((entry) => ({
      symbol: entry.symbol.toUpperCase(),
      displaySymbol: entry.display.toUpperCase(),
      providerSymbol: entry.symbol.toUpperCase(),
      name: entry.name,
      exchange: 'US',
      country: 'USA',
      currency: 'USD',
      instrumentType: 'COMMON_STOCK',
      assetClass: 'EQUITY',
      provider: 'catalog',
      activeStatus: 'UNKNOWN',
    }));
}

function mergeResults(
  remote: SymbolSearchResult[],
  local: SymbolSearchResult[],
  query: string,
): SymbolSearchResult[] {
  const exact = queryTicker(query);
  const seen = new Set<string>();
  return [...remote, ...local]
    .filter((result) => {
      if (seen.has(result.symbol)) return false;
      seen.add(result.symbol);
      return true;
    })
    .map((result, index) => ({ result, index, exact: result.symbol === exact ? 0 : 1 }))
    .sort((a, b) => a.exact - b.exact || a.index - b.index)
    .slice(0, 12)
    .map(({ result }) => result);
}
