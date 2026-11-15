import { apiFetch } from './api-fetch';
import { fetchOwnerContext, fetchOwnerIntelligence } from './owner-context';
import {
  getCatalogSelection,
  getMarketWatchlistEntries,
  MARKET_CATALOG_SELECTION_STORAGE_KEY,
  MARKET_WATCHLIST_EVENT,
  MARKET_WATCHLIST_STORAGE_KEY,
} from './market-watchlist';
import {
  AUTONOMOUS_LEARNING_METHODOLOGY_VERSION,
  AUTONOMOUS_LEARNING_SCHEMA_VERSION,
  AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION,
  type AutonomousLearningProjection,
} from '../../shared/autonomous-learning-contract.ts';

function isSnapshot(value: unknown): value is AutonomousLearningProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<AutonomousLearningProjection>;
  return snapshot.schemaVersion === AUTONOMOUS_LEARNING_SCHEMA_VERSION
    && snapshot.automatic === true
    && snapshot.methodologyVersion === AUTONOMOUS_LEARNING_METHODOLOGY_VERSION
    && snapshot.signalModelVersion === AUTONOMOUS_LEARNING_SIGNAL_MODEL_VERSION
    && typeof snapshot.generatedAt === 'string'
    && typeof snapshot.caseCount === 'number'
    && Array.isArray(snapshot.signalStatistics)
    && Boolean(snapshot.bySymbol && typeof snapshot.bySymbol === 'object');
}

const profiledThisSession = new Set<string>();

export async function fetchAutonomousLearningSnapshot(): Promise<AutonomousLearningProjection | null> {
  const body = await fetchOwnerContext();
  const value = body.snapshot;
  return isSnapshot(value) ? value : null;
}

export async function fetchInstrumentLearning(symbol: string) {
  const snapshot = await fetchAutonomousLearningSnapshot();
  return snapshot?.bySymbol[symbol.trim().toUpperCase()] ?? null;
}

export async function syncAutonomousLearningWatchlist(): Promise<void> {
  // A blocked storage read is not evidence that the owner cleared a watchlist.
  // Skip the mirror instead of replacing the last durable projection with an
  // empty/default selection in privacy-hardened browser contexts.
  try { localStorage.getItem(MARKET_WATCHLIST_STORAGE_KEY); }
  catch { return; }
  const entries = getMarketWatchlistEntries();
  const response = await apiFetch('/api/autonomous-learning', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        [MARKET_WATCHLIST_STORAGE_KEY]: JSON.stringify(entries),
        [MARKET_CATALOG_SELECTION_STORAGE_KEY]: JSON.stringify(getCatalogSelection() ?? []),
      },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok && response.status !== 401 && response.status !== 503) {
    throw new Error(`autonomous learning watchlist sync: ${response.status}`);
  }
  if (response.ok) {
    // A symbol addition starts a bounded, cheap profile immediately. Refresh
    // composes canonical metadata, price, SEC, events and monitor dimensions;
    // it never invokes Deep Analysis. Event translation is bounded and cached
    // per deduplicated cluster so Korean-first cards are ready on first use.
    for (const entry of entries.filter(value => !profiledThisSession.has(value.symbol)).slice(0, 2)) {
      try {
        await fetchOwnerIntelligence(entry.symbol, 'refresh');
        profiledThisSession.add(entry.symbol);
      }
      catch { /* The durable mirror remains valid; the next session retries profiling. */ }
    }
  }
}

/**
 * Start automatic owner-watchlist mirroring after the signed wm-session is
 * ready. This is independent of Manual Replay and does not require a click.
 */
export function startAutonomousLearningWatchlistSync(): () => void {
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  const schedule = (): void => {
    if (stopped || inFlight) return;
    inFlight = syncAutonomousLearningWatchlist()
      .catch(() => undefined)
      .finally(() => { inFlight = null; });
  };
  const onWatchlist = (): void => schedule();
  const onOnline = (): void => schedule();
  window.addEventListener(MARKET_WATCHLIST_EVENT, onWatchlist);
  window.addEventListener('online', onOnline);
  schedule();
  return () => {
    stopped = true;
    window.removeEventListener(MARKET_WATCHLIST_EVENT, onWatchlist);
    window.removeEventListener('online', onOnline);
  };
}
