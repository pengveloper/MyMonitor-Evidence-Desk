import type { BriefingEntry } from '../../src/features/product-recovery/situation-synthesis-model.ts';
import type { BriefingAnchor } from '../../src/features/global-briefing/model.ts';
import type { DataMode } from './data.ts';

// Saved records: a frozen copy of one event as it was shown, kept in this browser only.
// A record never updates itself; reopening it shows the copy, labelled with when it was saved.
const KEY = 'mymonitor-alpha:records:v1';
const MAX = 50;
export interface SavedRecord {
  id: string;
  savedAt: string;
  mode: DataMode;
  eventId: string;
  title: string;
  summary: string;
  observedAt: string | null;
  sourceLabel: string | null;
  sourceHref: string | null;
  facts: string[];
  whyImportant: string;
  uncertainty: string;
  nextCheck: string;
  latitude: number | null;
  longitude: number | null;
  receivedAt: string | null;
}
const isSaved = (v: unknown): v is SavedRecord => Boolean(v) && typeof v === 'object' && typeof (v as SavedRecord).id === 'string' && typeof (v as SavedRecord).savedAt === 'string'
  && typeof (v as SavedRecord).title === 'string' && typeof (v as SavedRecord).eventId === 'string' && Array.isArray((v as SavedRecord).facts);

/** null: the browser storage could not be read (private mode, blocked). An empty list means nothing saved. */
export function readRecords(storage: Pick<Storage, 'getItem'> = localStorage): SavedRecord[] | null {
  try { const value: unknown = JSON.parse(storage.getItem(KEY) ?? '[]'); return Array.isArray(value) ? value.filter(isSaved) : []; } catch { return null; }
}
export function recordFrom(entry: BriefingEntry, anchor: BriefingAnchor | undefined, mode: DataMode, receivedAt: string | null, now = Date.now()): SavedRecord {
  const href = (() => { try { const url = new URL(entry.source?.href ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; } })();
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, savedAt: new Date(now).toISOString(), mode, eventId: entry.id, title: entry.title, summary: entry.summary,
    observedAt: entry.observedAt, sourceLabel: entry.source?.label ?? null, sourceHref: href, facts: [...entry.details.mainChanges], whyImportant: entry.details.whyImportant,
    uncertainty: entry.details.uncertainty, nextCheck: entry.details.nextCheck?.label ?? '',
    latitude: Number.isFinite(anchor?.latitude) ? anchor!.latitude! : null, longitude: Number.isFinite(anchor?.longitude) ? anchor!.longitude! : null, receivedAt,
  };
}
/** Returns the new list, or null when the browser refused the write (the caller says so; nothing is pretended saved). */
export function saveRecord(record: SavedRecord, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SavedRecord[] | null {
  const current = readRecords(storage); if (current === null) return null;
  const next = [record, ...current].slice(0, MAX);
  try { storage.setItem(KEY, JSON.stringify(next)); return next; } catch { return null; }
}
export function deleteRecord(id: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SavedRecord[] | null {
  const current = readRecords(storage); if (current === null) return null;
  const next = current.filter(r => r.id !== id);
  try { storage.setItem(KEY, JSON.stringify(next)); return next; } catch { return null; }
}

const kst = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? `${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))} KST` : '미확인';
export const MODE_LABEL: Record<DataMode, string> = { synthetic: '합성 자료 (실제 사건 아님)', usgs: 'USGS 실제 자료 · 브라우저가 직접 받음', server: 'USGS 실제 자료 · 이 설치의 서버가 저장' };
export const savedAtLabel = (record: SavedRecord) => kst(record.savedAt);

export function recordMarkdown(record: SavedRecord): string {
  const lines = [
    `# ${record.title}`, '',
    `- 저장 시각: ${kst(record.savedAt)}`,
    `- 자료 종류: ${MODE_LABEL[record.mode]}`,
    `- 사건 시각: ${kst(record.observedAt)}`,
    `- 자료를 받은 시각: ${kst(record.receivedAt)}`,
    `- 출처: ${record.sourceLabel ?? '미확인'}${record.sourceHref ? ` (${record.sourceHref})` : ''}`,
    ...(record.latitude !== null && record.longitude !== null ? [`- 위치: 위도 ${record.latitude.toFixed(3)}, 경도 ${record.longitude.toFixed(3)}`] : []),
    '', '## 자료 요약', '', record.summary, '',
    ...(record.facts.length ? ['## 발표된 내용', '', ...record.facts.map(f => `- ${f}`), ''] : []),
    '## 왜 볼 만한가', '', record.whyImportant || '기록 없음', '',
    '## 아직 확인되지 않은 것', '', record.uncertainty || '기록 없음', '',
    ...(record.nextCheck ? ['## 다음 확인', '', record.nextCheck, ''] : []),
    '---', '', '이 문서는 저장한 시점의 사본입니다. 이후 자료가 바뀌어도 갱신되지 않습니다.', record.mode === 'synthetic' ? '합성 자료로 만든 기록이며 실제 사건이 아닙니다.' : '지진 자료 출처: U.S. Geological Survey (USGS).', '',
  ];
  return lines.join('\n');
}
