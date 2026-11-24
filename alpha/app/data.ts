import type { BriefingUpdate } from '../../src/features/global-briefing/model.ts';
import type { SourceState } from '../../src/features/global-briefing/field/data.ts';
import { isEventsRead, type EventsRead } from '../shared/events-contract.ts';
import { DEFAULT_USGS_FEED, USGS_FEED_URLS, isQuakeRecord, parseUsgsFeed, type QuakeRecord } from '../shared/usgs.ts';
import { briefingFromRecords } from './briefing.ts';
import { SYNTHETIC_SOURCE, syntheticExtra, syntheticQuakes } from './synthetic.ts';

// Data adapters. Each run shape reads its events through one of these and hands the same
// briefing shape to the same screen. No adapter here reads a key, an account or a private server.

export type DataMode = 'synthetic' | 'usgs' | 'server';
export type Tone = 'fresh' | 'late' | 'down' | 'muted';
export interface Loaded {
  mode: DataMode;
  update: BriefingUpdate;
  sources: SourceState[];
  /** One sentence for the status line: what is shown and how old it is. */
  notice: { tone: Tone; text: string };
  receivedAt: string | null;
}

const clock = (value: string | number) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
// Sources this run shape does not connect are declared as such, so the Sources screen says "not used here" instead of "nothing arrived".
const NOT_CONNECTED: SourceState[] = ['rss', 'acled_conflict', 'cyber_threats', 'ais', 'economic'].map(id => ({ id, status: 'disabled', lastUpdate: null }));
const usgsSource = (status: string, lastUpdate: string | null, itemCount: number, maxStaleMin: number): SourceState[] =>
  [{ id: 'usgs', name: 'USGS 지진', status, lastUpdate, itemCount, maxStaleMin }, ...NOT_CONNECTED];

export function loadSynthetic(now = Date.now()): Loaded {
  const extra = syntheticExtra(now), generatedAt = new Date(now).toISOString();
  return {
    mode: 'synthetic', receivedAt: null,
    update: briefingFromRecords({ records: syntheticQuakes(now), fresh: true, generatedAt, fetchedAt: generatedAt, extra: extra.evidence, extraAnchors: extra.anchors, scenario: true, sourceLabel: SYNTHETIC_SOURCE }),
    sources: [{ id: 'usgs', name: '가상 지진 자료', status: 'fresh', lastUpdate: generatedAt, itemCount: 3, maxStaleMin: 60 }, ...NOT_CONNECTED],
    notice: { tone: 'muted', text: '합성 자료 · 실제 사건이 아닙니다' },
  };
}

// ---- Public demo: the browser asks USGS directly. Nothing passes through a MyMonitor server. ----
const LAST_GOOD_KEY = 'mymonitor-alpha:usgs:last-good:v1';
export const DIRECT_STALE_MINUTES = 30;
interface LastGood { receivedAt: string; records: QuakeRecord[] }
function readLastGood(): LastGood | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_GOOD_KEY) ?? 'null') as LastGood | null;
    return value && typeof value.receivedAt === 'string' && Number.isFinite(Date.parse(value.receivedAt)) && Array.isArray(value.records) && value.records.every(isQuakeRecord) ? value : null;
  } catch { return null; }
}
function writeLastGood(value: LastGood): void { try { localStorage.setItem(LAST_GOOD_KEY, JSON.stringify(value)); } catch { /* storage is a convenience; the screen still shows what was just received */ } }

export async function loadUsgsDirect(fetcher: typeof fetch = fetch, now = Date.now()): Promise<Loaded> {
  const generatedAt = new Date(now).toISOString();
  let failure = '';
  try {
    const response = await fetcher(USGS_FEED_URLS[DEFAULT_USGS_FEED], { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseUsgsFeed(await response.json());
    writeLastGood({ receivedAt: generatedAt, records: parsed.records });
    if (!parsed.records.length) return { mode: 'usgs', receivedAt: generatedAt, update: briefingFromRecords({ records: [], fresh: true, generatedAt, fetchedAt: generatedAt }),
      sources: usgsSource('fresh', generatedAt, 0, DIRECT_STALE_MINUTES), notice: { tone: 'muted', text: `USGS 실제 자료 · ${clock(now)} 수신 · 최근 7일 규모 4.5 이상 지진이 없습니다` } };
    return { mode: 'usgs', receivedAt: generatedAt, update: briefingFromRecords({ records: parsed.records, fresh: true, generatedAt, fetchedAt: generatedAt }),
      sources: usgsSource('fresh', generatedAt, parsed.records.length, DIRECT_STALE_MINUTES),
      notice: { tone: 'fresh', text: `USGS 실제 자료 · ${clock(now)} 수신 · 최근 7일 규모 4.5 이상 ${parsed.records.length}건${parsed.rejected ? ` · 형식이 맞지 않아 제외 ${parsed.rejected}건` : ''}` } };
  } catch (error) { failure = error instanceof Error && /^HTTP \d+$/.test(error.message) ? error.message : error instanceof Error && error.message === 'USGS_FEED_MALFORMED' ? '응답 형식이 예상과 다름' : '연결 실패 또는 시간 초과'; }
  const stored = readLastGood();
  if (stored) return { mode: 'usgs', receivedAt: stored.receivedAt, update: briefingFromRecords({ records: stored.records, fresh: false, generatedAt, fetchedAt: stored.receivedAt }),
    sources: usgsSource('stale', stored.receivedAt, stored.records.length, DIRECT_STALE_MINUTES),
    notice: { tone: 'late', text: `USGS에서 새로 받지 못했습니다 (${failure}) · 이 브라우저에 남아 있는 ${clock(stored.receivedAt)} 수신 값을 보여 줍니다` } };
  return { mode: 'usgs', receivedAt: null, update: briefingFromRecords({ records: [], fresh: false, generatedAt, fetchedAt: null }),
    sources: usgsSource('error', null, 0, DIRECT_STALE_MINUTES), notice: { tone: 'down', text: `USGS에서 받지 못했습니다 (${failure}) · 저장된 값도 없어 사건을 표시하지 않습니다` } };
}

// ---- Community: this install's own server collected and stored the events. ----
export function loadedFromServer(read: EventsRead, now = Date.now()): Loaded {
  const generatedAt = new Date(now).toISOString(), count = read.events.length;
  const failed = read.lastAttempt && !read.lastAttempt.ok ? ` · 마지막 수집 실패 (${read.lastAttempt.error ?? '사유 미기록'})` : '';
  const cadence = read.autoCollectMinutes > 0 ? `자동 수집 ${read.autoCollectMinutes}분 간격` : '자동 수집 꺼짐';
  const notice = read.state === 'EMPTY' ? { tone: (failed ? 'down' : 'muted') as Tone, text: `이 서버에 저장된 사건이 아직 없습니다${failed} · ${cadence} · '지금 수집'을 눌러 USGS에서 받아 오세요` }
    : read.state === 'FRESH' ? { tone: 'fresh' as Tone, text: `이 서버가 저장한 USGS 실제 자료 ${count}건 · 마지막 수집 ${clock(read.lastSuccessAt!)} · ${cadence}` }
    : { tone: 'late' as Tone, text: `이 서버가 저장한 USGS 자료 ${count}건 · 마지막 성공 ${read.lastSuccessAt ? clock(read.lastSuccessAt) : '기록 없음'}${failed || ` · ${read.staleAfterMinutes}분이 지나 오래된 값으로 표시합니다`} · ${cadence}` };
  return { mode: 'server', receivedAt: read.lastSuccessAt, notice,
    update: briefingFromRecords({ records: read.events, fresh: read.state === 'FRESH', generatedAt, fetchedAt: read.lastSuccessAt }),
    sources: usgsSource(read.state === 'FRESH' ? 'fresh' : read.state === 'STALE' ? 'stale' : read.lastAttempt && !read.lastAttempt.ok ? 'error' : 'stale', read.lastSuccessAt, count, read.staleAfterMinutes) };
}
export async function loadServer(fetcher: typeof fetch = fetch, now = Date.now()): Promise<Loaded> {
  try {
    const response = await fetcher('/api/events', { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    const body: unknown = response.ok ? await response.json() : null;
    if (isEventsRead(body)) return loadedFromServer(body, now);
  } catch { /* reported below */ }
  const generatedAt = new Date(now).toISOString();
  return { mode: 'server', receivedAt: null, update: briefingFromRecords({ records: [], fresh: false, generatedAt, fetchedAt: null }), sources: usgsSource('error', null, 0, 60),
    notice: { tone: 'down', text: '이 서버의 저장 자료를 읽지 못했습니다. 사건이 없다는 뜻이 아닙니다.' } };
}
/** Asks this install's server to collect now. The server decides whether it may (rate limit, token). */
export async function requestCollect(fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetcher('/api/collect', { method: 'POST', signal: AbortSignal.timeout(30_000) });
    const body = await response.json().catch(() => ({})) as { error?: string; attempt?: { ok: boolean; error: string | null; added: number; updated: number; received: number } };
    if (response.ok && body.attempt?.ok) return { ok: true, message: `USGS에서 ${body.attempt.received}건을 받았습니다 · 새 사건 ${body.attempt.added}건 · 갱신 ${body.attempt.updated}건` };
    if (response.status === 429) return { ok: false, message: '방금 수집했습니다. 잠시 뒤에 다시 시도하세요.' };
    if (response.status === 401 || response.status === 403) return { ok: false, message: '이 서버는 화면에서의 수집 요청을 받지 않도록 설정돼 있습니다. 서버에서 수집 명령을 실행하세요.' };
    return { ok: false, message: `수집에 실패했습니다 (${body.attempt?.error ?? body.error ?? `HTTP ${response.status}`}). 저장된 값은 그대로입니다.` };
  } catch { return { ok: false, message: '서버에 연결하지 못했습니다. 저장된 값은 그대로입니다.' }; }
}
