import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isQuakeRecord, type QuakeRecord } from '../shared/usgs.ts';
import type { CollectAttempt } from '../shared/events-contract.ts';

// The store is one JSON file in the data directory. It is written whole through a temporary
// file and a rename, so a crash leaves either the old file or the new one.
export const STORE_SCHEMA_VERSION = 'mymonitor-alpha-store/v1';
export const RETENTION_DAYS = 30;
export const MAX_EVENTS = 5_000;
const MAX_ATTEMPTS = 50;

export interface StoreState {
  schemaVersion: string;
  feedUrl: string | null;
  lastSuccessAt: string | null;
  attempts: CollectAttempt[];
  events: Record<string, QuakeRecord>;
}
export const emptyState = (): StoreState => ({ schemaVersion: STORE_SCHEMA_VERSION, feedUrl: null, lastSuccessAt: null, attempts: [], events: {} });

export function readStore(dataDir: string): StoreState {
  let text: string;
  try { text = readFileSync(join(dataDir, 'events.json'), 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    throw error;
  }
  const value = JSON.parse(text) as Partial<StoreState>;
  // A store this build does not understand is an error, not an empty store: the file is left untouched.
  if (value.schemaVersion !== STORE_SCHEMA_VERSION || !value.events || typeof value.events !== 'object') throw new Error('STORE_UNSUPPORTED');
  const events = Object.fromEntries(Object.entries(value.events).filter(([, record]) => isQuakeRecord(record)));
  return { schemaVersion: STORE_SCHEMA_VERSION, feedUrl: typeof value.feedUrl === 'string' ? value.feedUrl : null,
    lastSuccessAt: typeof value.lastSuccessAt === 'string' ? value.lastSuccessAt : null, attempts: Array.isArray(value.attempts) ? value.attempts.slice(0, MAX_ATTEMPTS) : [], events };
}

export function writeStore(dataDir: string, state: StoreState): void {
  mkdirSync(dataDir, { recursive: true });
  const target = join(dataDir, 'events.json'), temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
}

/** Merges one successful collection. Older events stay until the retention window passes. */
export function mergeRecords(state: StoreState, records: readonly QuakeRecord[], rejected: number, feedUrl: string, now: number): { state: StoreState; attempt: CollectAttempt } {
  const events = { ...state.events }; let added = 0, updated = 0;
  for (const record of records) {
    const previous = events[record.id];
    if (!previous) added += 1; else if (JSON.stringify(previous) !== JSON.stringify(record)) updated += 1;
    events[record.id] = record;
  }
  const cutoff = now - RETENTION_DAYS * 86_400_000;
  const kept = Object.values(events).filter(record => record.occurredAt >= cutoff).sort((a, b) => b.occurredAt - a.occurredAt).slice(0, MAX_EVENTS);
  const at = new Date(now).toISOString();
  const attempt: CollectAttempt = { at, ok: true, error: null, received: records.length, added, updated, rejected };
  return { attempt, state: { schemaVersion: STORE_SCHEMA_VERSION, feedUrl, lastSuccessAt: at, attempts: [attempt, ...state.attempts].slice(0, MAX_ATTEMPTS), events: Object.fromEntries(kept.map(record => [record.id, record])) } };
}

/** Records a failed collection. Stored events and the last success time are kept as they are. */
export function recordFailure(state: StoreState, error: string, now: number): { state: StoreState; attempt: CollectAttempt } {
  const attempt: CollectAttempt = { at: new Date(now).toISOString(), ok: false, error, received: 0, added: 0, updated: 0, rejected: 0 };
  return { attempt, state: { ...state, attempts: [attempt, ...state.attempts].slice(0, MAX_ATTEMPTS) } };
}
