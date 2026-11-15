import type { GlobalRadarCard, RadarCardSection } from './global-radar-model.ts';

export const GLOBAL_RADAR_CHECKPOINT_VERSION = 1 as const;
export const GLOBAL_RADAR_CHECKPOINT_STORAGE_KEY = 'mymonitor:global-radar-checkpoint:v1';

export type GlobalRadarBaselineCategory = RadarCardSection;

/**
 * Minimal identity input for owner-relative comparison. `stableId` must be the
 * upstream/canonical item identity, never a rendered title or translated label.
 */
export interface GlobalRadarBaselineCandidate {
  stableId: string;
  category: GlobalRadarBaselineCategory;
  /**
   * MARKET/MACRO observations use the observation date as part of identity.
   * Fetch/capture time and formatted value are intentionally excluded, so a
   * transport refresh alone cannot become a new event.
   */
  observedAt?: string;
  /** Optional exact watchlist symbol used to keep otherwise-equal items isolated. */
  watchlistSymbol?: string;
}

export interface GlobalRadarCheckpointItem {
  category: GlobalRadarBaselineCategory;
  fingerprint: string;
  watchlistSymbol?: string;
}

export interface GlobalRadarCheckpoint {
  version: typeof GLOBAL_RADAR_CHECKPOINT_VERSION;
  checkedAt: string;
  items: GlobalRadarCheckpointItem[];
}

export interface GlobalRadarCheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type GlobalRadarCheckpointView =
  | {
    state: 'FIRST_CHECK';
    currentItems: GlobalRadarBaselineCandidate[];
    newItems: [];
    unchangedItems: [];
  }
  | {
    state: 'COMPARED';
    lastCheckedAt: string;
    currentItems: GlobalRadarBaselineCandidate[];
    newItems: GlobalRadarBaselineCandidate[];
    unchangedItems: GlobalRadarBaselineCandidate[];
  };

const CATEGORIES = new Set<GlobalRadarBaselineCategory>([
  'MARKET',
  'MACRO',
  'WORLD',
  'SEC',
  'WATCHLIST',
]);
const MAX_ITEMS = 500;

function exactTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function observationTime(value: string): boolean {
  if (exactTimestamp(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requiredText(value: string, field: string, maxLength: number): string {
  if (!value || value !== value.trim() || value.length > maxLength) {
    throw new Error(`${field} must be non-empty, trimmed text`);
  }
  return value;
}

function normalizedSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
    throw new Error('global radar watchlist symbol is invalid');
  }
  return symbol;
}

/** Stable non-cryptographic 128-bit digest used only as a compact local identity. */
function fingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  let third = 0x85ebca6b;
  let fourth = 0xc2b2ae35;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
    third = Math.imul(third ^ code, 0xc2b2ae35);
    fourth = Math.imul(fourth ^ code, 0x27d4eb2f);
  }
  return [first, second, third, fourth]
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

function normalizedCandidate(candidate: GlobalRadarBaselineCandidate): GlobalRadarBaselineCandidate {
  if (!CATEGORIES.has(candidate.category)) throw new Error('global radar baseline category is invalid');
  const stableId = requiredText(candidate.stableId, 'global radar stableId', 2048);
  if (candidate.observedAt !== undefined && !observationTime(candidate.observedAt)) {
    throw new Error('global radar observedAt is invalid');
  }
  const watchlistSymbol = candidate.watchlistSymbol === undefined
    ? undefined
    : normalizedSymbol(candidate.watchlistSymbol);
  return {
    stableId,
    category: candidate.category,
    ...(candidate.observedAt ? { observedAt: candidate.observedAt } : {}),
    ...(watchlistSymbol ? { watchlistSymbol } : {}),
  };
}

function checkpointItem(candidate: GlobalRadarBaselineCandidate): GlobalRadarCheckpointItem {
  const normalized = normalizedCandidate(candidate);
  const observationIdentity = normalized.category === 'MARKET' || normalized.category === 'MACRO'
    ? normalized.observedAt ?? 'OBSERVATION_TIME_UNAVAILABLE'
    : '';
  const identity = JSON.stringify([
    normalized.category,
    normalized.stableId,
    observationIdentity,
    normalized.watchlistSymbol ?? '',
  ]);
  return {
    category: normalized.category,
    fingerprint: fingerprint(identity),
    ...(normalized.watchlistSymbol ? { watchlistSymbol: normalized.watchlistSymbol } : {}),
  };
}

function itemKey(item: GlobalRadarCheckpointItem): string {
  return `${item.category}:${item.fingerprint}:${item.watchlistSymbol ?? ''}`;
}

function compactItems(candidates: readonly GlobalRadarBaselineCandidate[]): GlobalRadarCheckpointItem[] {
  if (candidates.length > MAX_ITEMS) throw new Error('global radar baseline contains too many items');
  const unique = new Map<string, GlobalRadarCheckpointItem>();
  for (const candidate of candidates) {
    const item = checkpointItem(candidate);
    unique.set(itemKey(item), item);
  }
  return [...unique.values()].sort((left, right) => itemKey(left).localeCompare(itemKey(right)));
}

function parseCheckpoint(raw: string | null): GlobalRadarCheckpoint | null {
  if (!raw || raw.length > 256_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== GLOBAL_RADAR_CHECKPOINT_VERSION
      || !exactTimestamp(record.checkedAt)
      || !Array.isArray(record.items)
      || record.items.length > MAX_ITEMS) return null;
    const seen = new Set<string>();
    const items: GlobalRadarCheckpointItem[] = [];
    for (const rawItem of record.items) {
      if (!rawItem || typeof rawItem !== 'object') return null;
      const item = rawItem as Record<string, unknown>;
      if (!CATEGORIES.has(item.category as GlobalRadarBaselineCategory)
        || typeof item.fingerprint !== 'string'
        || !/^[a-f0-9]{32}$/.test(item.fingerprint)) return null;
      let watchlistSymbol: string | undefined;
      if (item.watchlistSymbol !== undefined) {
        if (typeof item.watchlistSymbol !== 'string') return null;
        try {
          watchlistSymbol = normalizedSymbol(item.watchlistSymbol);
        } catch {
          return null;
        }
        if (watchlistSymbol !== item.watchlistSymbol) return null;
      }
      const entry: GlobalRadarCheckpointItem = {
        category: item.category as GlobalRadarBaselineCategory,
        fingerprint: item.fingerprint,
        ...(watchlistSymbol ? { watchlistSymbol } : {}),
      };
      const key = itemKey(entry);
      if (seen.has(key)) return null;
      seen.add(key);
      items.push(entry);
    }
    return {
      version: GLOBAL_RADAR_CHECKPOINT_VERSION,
      checkedAt: record.checkedAt,
      items: items.sort((left, right) => itemKey(left).localeCompare(itemKey(right))),
    };
  } catch {
    return null;
  }
}

export function readGlobalRadarCheckpoint(
  storage: GlobalRadarCheckpointStorage | null,
): GlobalRadarCheckpoint | null {
  if (!storage) return null;
  try {
    return parseCheckpoint(storage.getItem(GLOBAL_RADAR_CHECKPOINT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Persists the current identity set. The caller must invoke this only from the
 * owner's explicit "mark checked" action; reads and renders never write.
 */
export function markGlobalRadarChecked(
  storage: GlobalRadarCheckpointStorage | null,
  candidates: readonly GlobalRadarBaselineCandidate[],
  checkedAt = new Date().toISOString(),
): boolean {
  if (!storage || !exactTimestamp(checkedAt)) return false;
  try {
    const checkpoint: GlobalRadarCheckpoint = {
      version: GLOBAL_RADAR_CHECKPOINT_VERSION,
      checkedAt,
      items: compactItems(candidates),
    };
    storage.setItem(GLOBAL_RADAR_CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

/** Read-only comparison. Missing/invalid storage is a first check, never NEW. */
export function globalRadarCheckpointView(
  storage: GlobalRadarCheckpointStorage | null,
  candidates: readonly GlobalRadarBaselineCandidate[],
): GlobalRadarCheckpointView {
  const currentItems = candidates.map(normalizedCandidate);
  const checkpoint = readGlobalRadarCheckpoint(storage);
  if (!checkpoint) {
    return { state: 'FIRST_CHECK', currentItems, newItems: [], unchangedItems: [] };
  }
  const previous = new Set(checkpoint.items.map(itemKey));
  const newItems: GlobalRadarBaselineCandidate[] = [];
  const unchangedItems: GlobalRadarBaselineCandidate[] = [];
  for (const candidate of currentItems) {
    const item = checkpointItem(candidate);
    (previous.has(itemKey(item)) ? unchangedItems : newItems).push(candidate);
  }
  return {
    state: 'COMPARED',
    lastCheckedAt: checkpoint.checkedAt,
    currentItems,
    newItems,
    unchangedItems,
  };
}

/** Adapter for the existing Radar card contract; it deliberately excludes rendered content. */
export function globalRadarBaselineCandidateFromCard(card: GlobalRadarCard): GlobalRadarBaselineCandidate {
  const watchlistSymbol = card.section === 'WATCHLIST' ? card.symbols[0] : undefined;
  return {
    stableId: card.id,
    category: card.section,
    ...((card.section === 'MARKET' || card.section === 'MACRO') && card.observedAt
      ? { observedAt: card.observedAt }
      : {}),
    ...(watchlistSymbol ? { watchlistSymbol } : {}),
  };
}
