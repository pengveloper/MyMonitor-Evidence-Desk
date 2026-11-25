import { isQuakeRecord, type QuakeRecord } from './usgs.ts';

export const EVENTS_SCHEMA_VERSION = 'mymonitor-alpha-events/v1' as const;
/** FRESH: the last collection succeeded recently. STALE: stored values, but the last success is old or the last attempt failed. EMPTY: nothing stored yet. */
export type EventsState = 'FRESH' | 'STALE' | 'EMPTY';
export interface CollectAttempt { at: string; ok: boolean; error: string | null; received: number; added: number; updated: number; rejected: number }
export interface EventsRead {
  schemaVersion: typeof EVENTS_SCHEMA_VERSION;
  generatedAt: string;
  source: { id: 'USGS'; label: string; feedUrl: string; attribution: string };
  state: EventsState;
  lastSuccessAt: string | null;
  lastAttempt: CollectAttempt | null;
  staleAfterMinutes: number;
  autoCollectMinutes: number;
  events: QuakeRecord[];
}

export function eventsState(count: number, lastSuccessAt: string | null, lastAttemptOk: boolean | null, now: number, staleAfterMinutes: number): EventsState {
  if (!count) return 'EMPTY';
  const at = lastSuccessAt ? Date.parse(lastSuccessAt) : Number.NaN;
  return Number.isFinite(at) && now - at <= staleAfterMinutes * 60_000 && lastAttemptOk !== false ? 'FRESH' : 'STALE';
}

export function isEventsRead(value: unknown): value is EventsRead {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.schemaVersion === EVENTS_SCHEMA_VERSION && typeof v.generatedAt === 'string' && (v.state === 'FRESH' || v.state === 'STALE' || v.state === 'EMPTY')
    && Array.isArray(v.events) && v.events.every(isQuakeRecord);
}
