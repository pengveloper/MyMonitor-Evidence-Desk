import {
  intelligenceTitle,
  type ExecutiveIntelligence,
  type IntelligenceChange,
  type IntelligenceChangeType,
  type IntelligenceChangeView,
  type IntelligenceStateSnapshot,
  type RankedIntelligence,
} from './executive-intelligence-model.ts';
import type { BriefingEntry } from './situation-synthesis-model.ts';

export const INTELLIGENCE_CHECKPOINT_VERSION = 1 as const;
export const INTELLIGENCE_CHECKPOINT_STORAGE_KEY = 'mymonitor:intelligence-checkpoint:v1';

export interface IntelligenceCheckpoint {
  version: typeof INTELLIGENCE_CHECKPOINT_VERSION;
  checkedAt: string;
  items: IntelligenceStateSnapshot[];
}

export interface IntelligenceCheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MAX_ITEMS = 200;
const SCORE_CHANGE_THRESHOLD = 12;

function exactTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function digest(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function evidenceFingerprint(item: RankedIntelligence): string {
  const evidence = item.supporting.flatMap((entry) => [entry.id, ...entry.evidenceRefs]).sort();
  return digest(JSON.stringify([evidence, item.entry.signals.slice().sort(), item.entry.summary]));
}

function snapshot(item: RankedIntelligence): IntelligenceStateSnapshot {
  return {
    id: item.entry.id,
    title: intelligenceTitle(item.entry).slice(0, 300),
    score: item.score,
    observedAt: item.entry.observedAt,
    confidence: item.confidence,
    status: 'OBSERVED',
    label: `관측됨 · 점수 ${item.score} · 신뢰 ${item.confidence}`,
    evidenceFingerprint: evidenceFingerprint(item),
  };
}

function excludedSnapshot(entry: BriefingEntry): IntelligenceStateSnapshot {
  const unavailable = entry.availability === 'UNAVAILABLE' || entry.availability === 'NO_DATA';
  return {
    id: entry.id,
    title: intelligenceTitle(entry).slice(0, 300),
    score: 0,
    observedAt: entry.observedAt,
    confidence: '낮음',
    status: unavailable ? 'SOURCE_UNAVAILABLE' : 'SOURCE_STALE',
    label: unavailable ? '출처 사용 불가 · 현재 관측되지 않음' : '업데이트 지연 · 현재 관측에서 제외',
    evidenceFingerprint: digest(JSON.stringify([entry.id, entry.freshness, entry.availability])),
  };
}

export function createIntelligenceCheckpoint(
  model: ExecutiveIntelligence,
  checkedAt = new Date().toISOString(),
): IntelligenceCheckpoint {
  if (!exactTimestamp(checkedAt)) throw new Error('intelligence checkpoint time is invalid');
  return {
    version: INTELLIGENCE_CHECKPOINT_VERSION,
    checkedAt,
    items: model.allRanked.slice(0, MAX_ITEMS).map(snapshot).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function validSnapshot(value: unknown): value is IntelligenceStateSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 2048
    && typeof item.title === 'string' && item.title.length <= 300
    && typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100
    && (item.observedAt === null || typeof item.observedAt === 'string')
    && ['낮음', '중간', '높음'].includes(String(item.confidence))
    && item.status === 'OBSERVED'
    && typeof item.label === 'string' && item.label.length <= 300
    && typeof item.evidenceFingerprint === 'string' && /^[a-f0-9]{16}$/.test(item.evidenceFingerprint);
}

export function readIntelligenceCheckpoint(storage: IntelligenceCheckpointStorage | null): IntelligenceCheckpoint | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(INTELLIGENCE_CHECKPOINT_STORAGE_KEY);
    if (!raw || raw.length > 256_000) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (record.version !== INTELLIGENCE_CHECKPOINT_VERSION || !exactTimestamp(record.checkedAt)
      || !Array.isArray(record.items) || record.items.length > MAX_ITEMS || !record.items.every(validSnapshot)) return null;
    const ids = new Set<string>();
    for (const item of record.items as IntelligenceStateSnapshot[]) {
      if (ids.has(item.id)) return null;
      ids.add(item.id);
    }
    return record as unknown as IntelligenceCheckpoint;
  } catch {
    return null;
  }
}

export function markIntelligenceChecked(
  storage: IntelligenceCheckpointStorage | null,
  model: ExecutiveIntelligence,
  checkedAt = new Date().toISOString(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(INTELLIGENCE_CHECKPOINT_STORAGE_KEY, JSON.stringify(createIntelligenceCheckpoint(model, checkedAt)));
    return true;
  } catch {
    return false;
  }
}

function confidenceFor(type: IntelligenceChangeType, current: IntelligenceStateSnapshot | null): IntelligenceChange['confidence'] {
  if (type === 'NO_LONGER_OBSERVED') return 'LOW';
  if (current?.confidence === '높음') return 'HIGH';
  if (current?.confidence === '중간') return 'MEDIUM';
  return 'LOW';
}

function change(
  type: IntelligenceChangeType,
  previousState: IntelligenceStateSnapshot | null,
  currentState: IntelligenceStateSnapshot | null,
  changedAt: string,
): IntelligenceChange {
  return {
    id: currentState?.id ?? previousState!.id,
    type,
    previousState,
    currentState,
    changedAt,
    observedAt: currentState?.observedAt ?? previousState?.observedAt ?? null,
    confidence: confidenceFor(type, currentState),
  };
}

export function detectIntelligenceChanges(
  checkpoint: IntelligenceCheckpoint | null,
  model: ExecutiveIntelligence,
  detectedAt = new Date().toISOString(),
): IntelligenceChangeView {
  if (!checkpoint) return { state: 'FIRST_CHECK', items: [], topChanges: [] };
  const previous = new Map(checkpoint.items.map((item) => [item.id, item]));
  const current = model.allRanked.map(snapshot);
  const excluded = new Map(model.excluded.map((entry) => [entry.id, excludedSnapshot(entry)]));
  const items: IntelligenceChange[] = [];
  for (const currentState of current) {
    const previousState = previous.get(currentState.id) ?? null;
    previous.delete(currentState.id);
    if (!previousState) {
      items.push(change('NEW', null, currentState, detectedAt));
      continue;
    }
    const delta = currentState.score - previousState.score;
    const type: IntelligenceChangeType = delta >= SCORE_CHANGE_THRESHOLD ? 'ESCALATED'
      : delta <= -SCORE_CHANGE_THRESHOLD ? 'DE_ESCALATED'
        : currentState.observedAt !== previousState.observedAt
          || currentState.evidenceFingerprint !== previousState.evidenceFingerprint ? 'PERSISTENT' : 'UNCHANGED';
    items.push(change(type, previousState, currentState, detectedAt));
  }
  for (const previousState of previous.values()) {
    items.push(change('NO_LONGER_OBSERVED', previousState, excluded.get(previousState.id) ?? null, detectedAt));
  }
  const priority: Readonly<Record<IntelligenceChangeType, number>> = {
    ESCALATED: 0, NEW: 1, DE_ESCALATED: 2, PERSISTENT: 3, NO_LONGER_OBSERVED: 4, UNCHANGED: 5,
  };
  items.sort((left, right) => priority[left.type] - priority[right.type]
    || (right.currentState?.score ?? right.previousState?.score ?? 0) - (left.currentState?.score ?? left.previousState?.score ?? 0)
    || left.id.localeCompare(right.id));
  return {
    state: 'COMPARED',
    lastCheckedAt: checkpoint.checkedAt,
    items,
    topChanges: items.filter((item) => item.type !== 'UNCHANGED').slice(0, 5),
  };
}

export function intelligenceCheckpointView(
  storage: IntelligenceCheckpointStorage | null,
  model: ExecutiveIntelligence,
  detectedAt = new Date().toISOString(),
): IntelligenceChangeView {
  return detectIntelligenceChanges(readIntelligenceCheckpoint(storage), model, detectedAt);
}
