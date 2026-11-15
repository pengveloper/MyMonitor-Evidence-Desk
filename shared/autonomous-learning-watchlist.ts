import type { LearningAssetClass } from './autonomous-learning-contract.ts';
import type { OwnerUniverseProjection } from './tossinvest-contract.ts';

export const AUTONOMOUS_LEARNING_WATCHLIST_KEY = 'learning:owner-watchlist:v1';
export const AUTONOMOUS_LEARNING_STATE_KEY = 'learning:autonomous:state:v1';
export const AUTONOMOUS_LEARNING_PROJECTION_KEY = 'learning:autonomous:v1';
export const AUTONOMOUS_LEARNING_WATCHLIST_MAX_ENTRIES = 50;

export interface AutonomousLearningInstrument {
  symbol: string;
  name: string;
  instrumentId: string;
  assetClass: LearningAssetClass | 'UNKNOWN';
  instrumentType: 'COMMON_STOCK' | 'ETF' | 'UNKNOWN';
  providerSymbol?: string;
  cik?: string;
}

export interface AutonomousLearningWatchlistProjection {
  schemaVersion: 'autonomous-learning-watchlist/v1';
  capturedAt: string;
  catalogSelection: string[] | null;
  entries: AutonomousLearningInstrument[];
}

export function mergeOwnerUniverseInstruments(
  projection: AutonomousLearningWatchlistProjection | null,
  ownerUniverse: OwnerUniverseProjection | null,
  catalogEntries: Array<{ symbol?: string; name?: string; region?: string }>,
): AutonomousLearningInstrument[] {
  const manualBySymbol = new Map((projection?.entries ?? []).map((entry) => [entry.symbol, entry]));
  const catalogBySymbol = new Map(catalogEntries.flatMap((entry) => (
    entry.symbol ? [[entry.symbol, entry] as const] : []
  )));
  const merged = new Map<string, AutonomousLearningInstrument>();
  for (const entry of ownerUniverse?.entries ?? []) {
    if (entry.priority > 3) continue;
    const manual = manualBySymbol.get(entry.symbol);
    const catalog = catalogBySymbol.get(entry.symbol);
    const assetClass = entry.assetClass !== 'UNKNOWN'
      ? entry.assetClass
      : manual?.assetClass ?? 'UNKNOWN';
    merged.set(entry.symbol, {
      symbol: entry.symbol,
      name: manual?.name ?? catalog?.name ?? entry.symbol,
      instrumentId: `${assetClass}:${entry.symbol}`,
      assetClass,
      instrumentType: assetClass === 'ETF' ? 'ETF' : assetClass === 'EQUITY' ? 'COMMON_STOCK' : 'UNKNOWN',
      ...(manual?.providerSymbol ? { providerSymbol: manual.providerSymbol } : {}),
      ...(manual?.cik ? { cik: manual.cik } : {}),
    });
  }
  for (const manual of projection?.entries ?? []) {
    if (!merged.has(manual.symbol)) merged.set(manual.symbol, manual);
  }
  return [...merged.values()];
}

function parseArray(raw: unknown): unknown[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function symbol(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\.US$/i, '').toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(normalized) ? normalized : null;
}

export function projectAutonomousLearningWatchlist(
  data: unknown,
  capturedAt: string,
): AutonomousLearningWatchlistProjection | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const prefs = data as Record<string, unknown>;
  const rawEntries = parseArray(prefs['wm-market-watchlist-v1']);
  const rawSelection = parseArray(prefs['wm-market-catalog-selection-v1']);
  if (rawEntries === null && rawSelection === null) return null;
  const seen = new Set<string>();
  const entries: AutonomousLearningInstrument[] = [];
  for (const value of rawEntries ?? []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const normalized = symbol(item.symbol);
    if (!normalized || seen.has(normalized) || entries.length >= AUTONOMOUS_LEARNING_WATCHLIST_MAX_ENTRIES) continue;
    const instrumentType = String(item.instrumentType ?? '').toUpperCase().replace(/[ -]+/g, '_');
    const assetClass = String(item.assetClass ?? '').toUpperCase();
    const isEtf = instrumentType === 'ETF' || assetClass === 'ETF';
    if (!isEtf && instrumentType && !['COMMON_STOCK', 'ADR', 'PREFERRED'].includes(instrumentType)) continue;
    seen.add(normalized);
    entries.push({
      symbol: normalized,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : normalized,
      instrumentId: `${isEtf ? 'ETF' : 'EQUITY'}:${normalized}`,
      assetClass: isEtf ? 'ETF' : 'EQUITY',
      instrumentType: isEtf ? 'ETF' : 'COMMON_STOCK',
      ...(typeof item.providerSymbol === 'string' && item.providerSymbol.trim() ? { providerSymbol: item.providerSymbol.trim().toUpperCase() } : {}),
      ...(typeof item.cik === 'string' && /^\d{10}$/.test(item.cik) ? { cik: item.cik } : {}),
    });
  }
  const catalogSelection = [...new Set((rawSelection ?? []).flatMap((value) => symbol(value) ?? []))]
    .slice(0, AUTONOMOUS_LEARNING_WATCHLIST_MAX_ENTRIES);
  return {
    schemaVersion: 'autonomous-learning-watchlist/v1',
    capturedAt,
    catalogSelection: catalogSelection.length ? catalogSelection : null,
    entries,
  };
}
