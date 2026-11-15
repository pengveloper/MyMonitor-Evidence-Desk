/** Synthetic-only browser archive. No canonical/owner bundle is serialized. */
export const DEMO_BRIEFS_KEY = 'mymonitor:evidence-desk:demo:v1:briefs';
export interface DemoDocument {
  synthetic: true; id: string; title: string; content: string;
  observedAt: string | null; publishedAt: string | null; fetchedAt: string | null;
}
export interface DemoBrief {
  schemaVersion: 1; synthetic: true; id: string; savedAt: string; cutoffAt: string;
  eventId: string; title: string; summary: string; interpretation: string; uncertainty: string;
  languageLabel: string; conflicts: string[];
  nextLabel: string; nextReason: string; freshness: string; availability: string;
  observedAt: string | null; fetchedAt: string | null; evidenceIds: string[]; documents: DemoDocument[];
}
export type ArchiveResult = { ok: true; records: DemoBrief[] } | { ok: false; reason: 'BLOCKED' | 'CORRUPT' | 'QUOTA' | 'LIMIT' };
const MAX_BYTES = 200_000;
const text = (v: unknown, max = 8000): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const time = (v: unknown): v is string => text(v, 40) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const optionalTime = (v: unknown) => v === null || time(v);
function validDocument(v: unknown): v is DemoDocument {
  if (!v || typeof v !== 'object') return false;
  const d = v as DemoDocument;
  return d.synthetic === true && text(d.id, 200) && text(d.title, 500) && text(d.content) && optionalTime(d.observedAt) && optionalTime(d.publishedAt) && optionalTime(d.fetchedAt)
    && Object.keys(d).every(k => ['synthetic','id','title','content','observedAt','publishedAt','fetchedAt'].includes(k));
}
export function validDemoBrief(v: unknown): v is DemoBrief {
  if (!v || typeof v !== 'object') return false;
  const b = v as DemoBrief;
  return b.schemaVersion === 1 && b.synthetic === true && text(b.id, 200) && time(b.savedAt) && time(b.cutoffAt)
    && text(b.eventId, 200) && text(b.title, 500) && [b.summary,b.interpretation,b.uncertainty,b.nextLabel,b.nextReason,b.languageLabel].every(x => text(x))
    && ['FRESH','STALE','UNKNOWN'].includes(b.freshness) && ['AVAILABLE','UPDATING','DELAYED','UNAVAILABLE','NO_DATA'].includes(b.availability)
    && optionalTime(b.observedAt) && optionalTime(b.fetchedAt) && Array.isArray(b.evidenceIds) && b.evidenceIds.length <= 30 && b.evidenceIds.every(x => text(x, 200))
    && Array.isArray(b.conflicts) && b.conflicts.length <= 30 && b.conflicts.every(x => text(x, 200))
    && Array.isArray(b.documents) && b.documents.length <= 30 && b.documents.every(validDocument) && b.documents.every(d => b.evidenceIds.includes(d.id))
    && Object.keys(b).every(k => ['schemaVersion','synthetic','id','savedAt','cutoffAt','eventId','title','summary','interpretation','uncertainty','nextLabel','nextReason','languageLabel','conflicts','freshness','availability','observedAt','fetchedAt','evidenceIds','documents'].includes(k));
}
export function readDemoBriefs(storage: Pick<Storage, 'getItem'>): ArchiveResult {
  try {
    const raw = storage.getItem(DEMO_BRIEFS_KEY);
    if (raw === null) return { ok: true, records: [] };
    if (new TextEncoder().encode(raw).length > MAX_BYTES) return { ok: false, reason: 'CORRUPT' };
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > 20 || !data.every(validDemoBrief) || new Set(data.map(b => b.id)).size !== data.length) return { ok: false, reason: 'CORRUPT' };
    return { ok: true, records: data };
  } catch (error) { return { ok: false, reason: error instanceof SyntaxError ? 'CORRUPT' : 'BLOCKED' }; }
}
export function writeDemoBriefs(storage: Pick<Storage, 'setItem'>, records: DemoBrief[]): ArchiveResult {
  if (records.length > 20 || !records.every(validDemoBrief)) return { ok: false, reason: 'LIMIT' };
  const raw = JSON.stringify(records);
  if (new TextEncoder().encode(raw).length > MAX_BYTES) return { ok: false, reason: 'LIMIT' };
  try { storage.setItem(DEMO_BRIEFS_KEY, raw); return { ok: true, records: JSON.parse(raw) }; }
  catch (e) { return { ok: false, reason: e instanceof DOMException && e.name === 'QuotaExceededError' ? 'QUOTA' : 'BLOCKED' }; }
}
export function resetDemoBriefs(storage: Pick<Storage, 'removeItem'>): boolean {
  try { storage.removeItem(DEMO_BRIEFS_KEY); return true; } catch { return false; }
}
// Plain Markdown export deliberately carries no links. Text cannot create HTML,
// active Markdown links, or autolink an operating/private address.
const md = (value: string) => value.replace(/https?:\/\/\S+/gi, '[주소 제외]').replace(/[\\\x60*_{}\[\]()#+.!|<>]/g, '\\$&');
export function demoBriefMarkdown(b: DemoBrief): string {
  if (!validDemoBrief(b)) throw new Error('INVALID_DEMO_BRIEF');
  return ['# 가상 시나리오 · 저장 브리프', '저장 당시 합성 자료입니다. 실제 뉴스·계좌·과거 시장 재현이 아닙니다.',
    'schema version: 1', '선택 기준시각: ' + b.cutoffAt, '저장 시각: ' + b.savedAt,
    '## ' + md(b.title), '사건 ID: ' + md(b.eventId), '### 자료 요약', md(b.summary),
    '### 가능한 해석', md(b.interpretation), md(b.uncertainty), '표시 언어: ' + md(b.languageLabel || '별도 원문 표시 없음'), '상충 근거: ' + b.conflicts.map(md).join(' / '), '### 다음 확인', md(b.nextLabel), md(b.nextReason),
    '관측·보도: ' + (b.observedAt ?? '미확인'), '수집: ' + (b.fetchedAt ?? '미확인'), '상태: ' + b.freshness + ' / ' + b.availability,
    '## 근거', ...b.evidenceIds.map(id => '근거 ID: ' + md(id)),
    ...b.documents.flatMap(d => ['### 가상 자료 · ' + md(d.title), md(d.content), '근거 ID: ' + md(d.id), '관측: ' + (d.observedAt ?? '미확인'), '발표: ' + (d.publishedAt ?? '미확인'), '수집: ' + (d.fetchedAt ?? '미확인')]),
    '실제 과거 비교: NOT_CONNECTED', ''].join('\n\n');
}
