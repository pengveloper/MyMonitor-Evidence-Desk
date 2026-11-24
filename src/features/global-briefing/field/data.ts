import type { BriefingEntry, BriefingSection, SituationSignal } from '../../product-recovery/situation-synthesis-model';
import type { OwnerDiscoveryRead } from '../../../../shared/owner-discovery-read-contract';
import type { OwnerUniverseEntry } from '../../../../shared/tossinvest-contract';
import type { ContextItem } from '../../../../shared/owner-universe-scan-contract';
import type { MarketBreadthObservation } from '../../product-recovery/market-regime';
import { eventCategory, type BriefingAnchor } from '../model';
import type { LearningRead } from '../../../../shared/autonomous-learning-status';

// Pure presentation joins over already-read state. Nothing here fetches, guesses
// a value, or turns a missing time into the screen time.

export type Severity = 'high' | 'watch' | 'normal';
export type Tone = 'fresh' | 'late' | 'closed' | 'muted' | 'down';
export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { high: '높음', watch: '주의', normal: '보통' };

export function severityOf(entry: BriefingEntry): Severity | null {
  const level = entry.importance?.level;
  return level === 'CRITICAL' || level === 'HIGH' ? 'high' : level === 'MEDIUM' ? 'watch' : level === 'LOW' ? 'normal' : null;
}

const KST = 'Asia/Seoul';
const dateOnly = (value?: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const parsed = (value?: string | Date | null): number | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (!value || dateOnly(value)) return null;
  const at = Date.parse(value); return Number.isFinite(at) ? at : null;
};
const kstParts = (at: number) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
  .formatToParts(new Date(at)).map(p => [p.type, p.value]));

/** `HH:MM` in KST, or null when the time is missing or only a date. */
export function clock(value?: string | Date | null): string | null {
  const at = parsed(value); if (at === null) return null;
  const p = kstParts(at); return `${p.hour}:${p.minute}`;
}
/** Day label relative to the screen clock: 오늘 / 어제 / M/D. Date-only values keep their own date. */
export function dayLabel(value: string | null | undefined, now: number): string | null {
  if (dateOnly(value)) { const [, m, d] = value!.split('-'); return `${Number(m)}/${Number(d)}`; }
  const at = parsed(value); if (at === null) return null;
  const day = (t: number) => { const p = kstParts(t); return `${p.year}-${p.month}-${p.day}`; };
  if (day(at) === day(now)) return '오늘';
  if (day(at) === day(now - 86_400_000)) return '어제';
  const p = kstParts(at); return `${Number(p.month)}/${Number(p.day)}`;
}
const WEEKDAY: Record<string, string> = { Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토', Sun: '일' };
/** Screen clock for the top bar: `11월 20일 금 · 08:40 KST`. */
export function screenClock(now: number): string {
  const p = kstParts(now); return `${Number(p.month)}월 ${Number(p.day)}일 ${WEEKDAY[p.weekday!] ?? ''} · ${p.hour}:${p.minute} KST`;
}
export function ago(ms: number): string {
  if (ms < 60_000) return '방금';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

/** Human freshness for a signal row. Never the raw status code. */
export function freshnessLabel(entry: BriefingEntry, anchor: BriefingAnchor | undefined, now: number): { text: string; tone: Tone } {
  if (entry.availability === 'UNAVAILABLE' || entry.availability === 'NO_DATA') return { text: '사용 불가', tone: 'down' };
  if (dateOnly(entry.observedAt)) return { text: entry.category === 'MARKET' || entry.category === 'MACRO' ? '장 마감 값' : '일별 값', tone: 'closed' };
  if (entry.freshness === 'STALE' || entry.availability === 'DELAYED') return { text: '갱신 지연', tone: 'late' };
  const fetched = parsed(anchor?.fetchedAt);
  if (entry.freshness === 'FRESH' && fetched !== null && fetched <= now) return { text: `${ago(now - fetched)} 확인`, tone: 'fresh' };
  if (entry.freshness === 'FRESH') return { text: '최근 관측', tone: 'fresh' };
  return { text: '확인 시각 미기록', tone: 'muted' };
}

export function regionLabel(entry: BriefingEntry): string {
  const category = eventCategory(entry);
  return entry.context?.region?.trim() || (category === '전체' ? '세계' : category);
}

/** Sort key: an exact time as is; a date-only daily value sits at the start of its date in KST (the day the list shows), so it never outranks timed reports of that day. */
export function eventTime(entry: BriefingEntry): number | null {
  if (dateOnly(entry.observedAt)) { const at = Date.parse(`${entry.observedAt}T00:00:00+09:00`); return Number.isFinite(at) ? at : null; }
  return parsed(entry.observedAt);
}
/** Newest first. Entries without a time keep their order at the end. */
export function newestFirst(entries: readonly BriefingEntry[]): BriefingEntry[] {
  return entries.map((entry, index) => ({ entry, index, at: eventTime(entry) }))
    .sort((a, b) => a.at === null && b.at === null ? a.index - b.index : a.at === null ? 1 : b.at === null ? -1 : b.at - a.at || a.index - b.index)
    .map(item => item.entry);
}
/** A short publisher name for a list row: the acronym in parentheses, or the part before " · ". The detail keeps the full label. */
export function shortSource(label?: string | null): string {
  const text = label?.trim(); if (!text) return '출처 미확인';
  const acronym = text.match(/\(([A-Z][A-Z0-9&.-]{1,9})\)/)?.[1];
  return acronym ?? text.split(' · ')[0]!.trim();
}
/** The current value of a daily market or macro entry with its own date, e.g. `11/19 값 28.44`. The summary only states the comparison. */
export function metricValueLine(entry: BriefingEntry): string | null {
  const value = entry.context?.metric?.value?.trim(); if (!value) return null;
  const day = dateOnly(entry.observedAt) ? entry.observedAt!.slice(5).split('-').map(Number).join('/') : null;
  return day ? `${day} 값 ${value}` : `현재 값 ${value}`;
}

/** Earthquakes below this magnitude without a high rating fold into one list row; the map still draws every one. */
export const QUAKE_FOLD_BELOW = 5.5;
export function isMinorQuake(entry: BriefingEntry): boolean {
  if (!entry.id.startsWith('world:earthquake:') || severityOf(entry) === 'high') return false;
  const magnitude = entry.context?.impact?.magnitude; return typeof magnitude === 'number' && magnitude < QUAKE_FOLD_BELOW;
}
export type ListItem = { kind: 'event'; entry: BriefingEntry } | { kind: 'quakes'; entries: BriefingEntry[] };
/** The list with minor earthquakes folded into one row where the newest of them sits. Two or more are needed to fold; open shows each in its own place after the row. */
export function foldMinorQuakes(entries: readonly BriefingEntry[], open = false): ListItem[] {
  const minor = entries.filter(isMinorQuake);
  if (minor.length < 2) return entries.map(entry => ({ kind: 'event', entry }));
  const items: ListItem[] = []; let placed = false;
  for (const entry of entries) {
    const folded = isMinorQuake(entry);
    if (folded && !placed) { items.push({ kind: 'quakes', entries: minor }); placed = true; }
    if (!folded || open) items.push({ kind: 'event', entry });
  }
  return items;
}

const MARKET_SIGNALS = new Set<SituationSignal>(['ENERGY_PRICE_UP', 'ENERGY_PRICE_DOWN', 'MARKET_DOWN', 'MARKET_UP', 'VOLATILITY_UP', 'VOLATILITY_DOWN', 'LONG_RATE_UP', 'GROWTH_PRESSURE', 'BREADTH_STRONG', 'BREADTH_WEAK', 'DEFENSIVE_RELATIVE_STRENGTH']);
export function marketLinked(entry: BriefingEntry): boolean {
  return entry.category === 'MARKET' || entry.category === 'MACRO' || Boolean(entry.context?.symbols?.length) || entry.signals.some(s => MARKET_SIGNALS.has(s));
}

// ---- Market strip -----------------------------------------------------------
export interface MarketCell { key: string; label: string; value: string | null; change: string | null; direction: 'up' | 'down' | 'flat' | null; status: string; tone: Tone; linked: boolean; meaning: string | null }
const CELLS = [
  { key: 'SEMIS', label: '필라델피아 반도체', items: ['SOX', 'ICESEMIT'], signals: [] as SituationSignal[], symbols: ['SOXL', 'SOXS', 'SMH', 'SOXX'], meaning: null },
  { key: 'VIX', label: 'VIX', items: ['VIX', 'VIXCLS'], signals: ['VOLATILITY_UP', 'VOLATILITY_DOWN'] as SituationSignal[], symbols: [], meaning: 'VIX 일별 종가 · 실시간 아님' },
  { key: 'OIL', label: 'WTI 원유', items: ['DCOILWTICO', 'WTI'], signals: ['ENERGY_PRICE_UP', 'ENERGY_PRICE_DOWN'] as SituationSignal[], symbols: [], meaning: 'WTI 현물 일별 참고가' },
  { key: 'RATE', label: '미국 10년 국채', items: ['DGS10'], signals: ['LONG_RATE_UP'] as SituationSignal[], symbols: [], meaning: '명목 금리 · 일별' },
] as const;
const contextItems = (discovery: OwnerDiscoveryRead | null): ContextItem[] => discovery?.scan.marketContext.groups.flatMap(g => g.items) ?? [];
const number = (value: number, unit: string) => {
  const digits = Math.abs(value) >= 1000 ? 1 : 2;
  const text = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return unit === '%' || unit === 'PERCENT' ? `${text}%` : unit === 'USD' ? `$${text}` : text;
};
function itemStatus(item: ContextItem): { status: string; tone: Tone } {
  const usable = ['AVAILABLE', 'FRESH'].includes(item.freshness);
  if (item.session === 'DAILY_MACRO' || item.session === 'DAILY_REFERENCE') {
    const d = item.observedAt && dateOnly(item.observedAt.slice(0, 10)) ? item.observedAt.slice(0, 10).split('-').slice(1).map(Number).join('/') : '날짜 미확인';
    return { status: `일별 값 · ${d}${usable ? '' : ' · 오래된 값'}`, tone: usable ? 'closed' : 'late' };
  }
  const at = clock(item.fetchedAt);
  return { status: at ? `${at} 확인${usable ? '' : ' · 오래된 값'}` : '수신 시각 미기록', tone: usable ? 'fresh' : 'late' };
}
export function marketCells(discovery: OwnerDiscoveryRead | null, selected: BriefingEntry | null): MarketCell[] {
  const items = contextItems(discovery);
  return CELLS.map(cell => {
    const item = cell.items.map(label => items.find(i => i.label === label && i.value !== null && Number.isFinite(i.value))).find(Boolean);
    const linked = Boolean(selected && (selected.signals.some(s => cell.signals.includes(s)) || selected.context?.symbols?.some(s => (cell.symbols as readonly string[]).includes(s))));
    if (!item) return { key: cell.key, label: cell.label, value: null, change: null, direction: null, status: discovery ? '미수신' : '시장 자료 읽는 중', tone: 'muted', linked, meaning: cell.meaning };
    const change = item.change !== null && Number.isFinite(item.change) ? item.change : null;
    const { status, tone } = itemStatus(item);
    return { key: cell.key, label: cell.label, value: number(item.value!, item.unit), linked, meaning: cell.meaning,
      change: change === null ? null : `${change > 0 ? '+' : ''}${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(change)}`,
      direction: change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat', status, tone };
  });
}

// ---- Research summary -------------------------------------------------------
export interface SummaryCell { label: string; value: string | null; change: string | null; direction: 'up' | 'down' | 'flat' | null; note: string; bar: number | null }
export function breadthOf(entries: readonly BriefingEntry[]): MarketBreadthObservation | null {
  return entries.map(e => e.context?.marketBreadth).find((b): b is MarketBreadthObservation => Boolean(b && Number.isFinite(b.windows?.['50d']?.percentage))) ?? null;
}
// Card IDs carry a section prefix (`market:SP500`); the series is the part after the last colon.
const metric = (entries: readonly BriefingEntry[], ids: string[]) => entries.find(e => e.context?.metric && ids.includes(e.context.metric.id.split(':').pop()!));
const pct = (value: number) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)}%`;
export function researchSummary(entries: readonly BriefingEntry[], discovery: OwnerDiscoveryRead | null): SummaryCell[] {
  const sp = metric(entries, ['SP500', 'GSPC', '^GSPC']);
  const spValue = sp?.context?.metric?.value ?? null, spChange = sp?.context?.metric?.changePercent;
  const vixItem = contextItems(discovery).find(i => (i.label === 'VIXCLS' || i.label === 'VIX') && i.value !== null && Number.isFinite(i.value));
  const vixEntry = metric(entries, ['VIXCLS', 'VIX']);
  const vixValue = vixItem ? number(vixItem.value!, vixItem.unit) : vixEntry?.context?.metric?.value ?? null;
  const breadth = breadthOf(entries);
  const w = breadth?.windows;
  const basket = discovery?.discovery.breadth;
  const dir = (n?: number | null) => n === undefined || n === null || !Number.isFinite(n) ? null : n > 0 ? 'up' as const : n < 0 ? 'down' as const : 'flat' as const;
  const signed = (n?: number | null, suffix = '%') => n === undefined || n === null || !Number.isFinite(n) ? null : `${n > 0 ? '+' : ''}${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n)}${suffix}`;
  return [
    { label: 'S&P 500', value: spValue, change: signed(spChange), direction: dir(spChange),
      note: sp ? (dateOnly(sp.observedAt) ? `장 마감 · ${sp.observedAt!.slice(5).replace('-', '/')}` : `${clock(sp.observedAt) ?? '시각 미기록'} 관측`) : '미수신 · 판정에 쓰지 않음', bar: null },
    { label: 'VIX', value: vixValue, change: vixItem ? signed(vixItem.change, '') : null, direction: vixItem ? dir(vixItem.change) : null,
      note: vixItem ? '일별 종가 · 실시간 아님' : vixEntry ? '일별 종가 · 실시간 아님' : '미수신 · 판정에 쓰지 않음', bar: null },
    // Only the selected context basket has advance counts; it is never presented as the full index.
    basket && basket.state === 'AVAILABLE' && basket.total > 0
      ? { label: '상승 종목 수 · 선택 표본', value: `${basket.advances}/${basket.total}`, change: null, direction: null,
        note: `반도체 표본 · 전체 지수 아님${basket.observationDate ? ` · ${basket.observationDate.slice(5).replace('-', '/')}` : ''}`, bar: Math.round(basket.advances / basket.total * 100) }
      : { label: '상승 종목 수', value: null, change: null, direction: null, note: '미수신 · 판정에 쓰지 않음', bar: null },
    { label: '50일선 위 종목', value: w ? pct(w['50d'].percentage) : null, change: null, direction: null,
      note: w ? `20일 ${pct(w['20d'].percentage)} · 200일 ${pct(w['200d'].percentage)} · ${breadth!.observationDate.slice(5).replace('-', '/')} 기준` : '미수신 · 판정에 쓰지 않음',
      bar: w ? Math.max(0, Math.min(100, w['50d'].percentage)) : null },
  ];
}

// ---- Sources ----------------------------------------------------------------
export interface SourceState { id: string; name?: string; status: string; lastUpdate: Date | string | null; itemCount?: number; maxStaleMin?: number | null }
export type GroupStatus = 'fresh' | 'closed' | 'late' | 'down' | 'none' | 'off';
export interface SourceGroup { key: string; label: string; status: GroupStatus; lastUpdate: number | null; maxStaleMin: number | null; members: Array<{ id: string; label: string; status: string; lastUpdate: number | null; itemCount: number }>; note: string;
  /** Set when the state comes from the briefing the server prepared, because this browser's tracker has no record for the group. */
  via?: 'briefing' }
/** The briefing already on screen, for groups the server collects (world news, FRED values) that this browser's own tracker never records. */
export interface BriefingHolding { entries: readonly BriefingEntry[]; anchors: Readonly<Record<string, BriefingAnchor>> }
export const GROUP_STATUS_LABEL: Readonly<Record<GroupStatus, string>> = { fresh: '정상', closed: '장 마감 값', late: '업데이트 지연', down: '사용 불가', none: '데이터 없음', off: '사용 안 함' };
const MEMBER_LABEL: Record<string, string> = {
  rss: '공개 RSS 뉴스', gdelt: 'GDELT 뉴스 분석', acled_conflict: 'ACLED 무력 충돌', ucdp_events: 'UCDP 분쟁 사건', ucdp: 'UCDP 분쟁 분류', acled: 'ACLED 시위·충돌',
  usgs: 'USGS 지진', firms: 'NASA 위성 화재', weather: '기상 경보', cyber_threats: '사이버 위협 지표', security_advisories: '보안 권고', ais: 'AIS 선박 위치',
  economic: 'FRED 경제 지표', oil: 'EIA 원유', bls: 'BLS 고용', bis: 'BIS 중앙은행',
};
const GROUPS = [
  { key: 'news', label: '세계 뉴스', ids: ['rss', 'gdelt'] },
  { key: 'security', label: '지정학·안보', ids: ['acled_conflict', 'ucdp_events', 'ucdp', 'acled'] },
  { key: 'hazard', label: '자연재해', ids: ['usgs', 'firms', 'weather'] },
  { key: 'threat', label: '위협 추이', ids: ['cyber_threats', 'security_advisories'] },
  { key: 'vessels', label: '선박 위치', ids: ['ais'] },
  { key: 'macro', label: '경제 지표', ids: ['economic', 'oil', 'bls', 'bis'] },
] as const;
function groupFrom(key: string, label: string, members: SourceGroup['members'], maxStaleMin: number | null, now: number): SourceGroup {
  const enabled = members.filter(m => m.status !== 'disabled');
  const has = (...s: string[]) => enabled.some(m => s.includes(m.status));
  // No registered source yet means nothing was read, not a source this deployment leaves off.
  const status: GroupStatus = !members.length ? 'none' : !enabled.length ? 'off'
    : enabled.every(m => m.status === 'fresh') ? 'fresh'
    : has('fresh', 'stale', 'very_stale') ? 'late'
    : has('error') ? 'down' : 'none';
  const times = members.map(m => m.lastUpdate).filter((t): t is number => t !== null);
  const lastUpdate = times.length ? Math.max(...times) : null;
  // A check today that brought nothing is said as such; only an older last record means nothing came in today.
  const lastDay = lastUpdate === null ? null : dayLabel(new Date(lastUpdate).toISOString(), now);
  const note = status === 'off' ? '이 배포에서 쓰지 않는 출처입니다.'
    : status === 'none' ? (lastUpdate === null ? '들어온 자료가 없습니다.' : lastDay === '오늘' ? `마지막 확인 ${clock(new Date(lastUpdate))} · 들어온 항목 없음` : `오늘 들어온 자료가 없습니다 · 마지막 자료 ${lastDay ?? ''} ${clock(new Date(lastUpdate))}`.replace(/\s+/g, ' '))
    : status === 'down' ? '최근 수신이 실패했습니다.' : status === 'late' ? '일부 또는 전체가 평소 갱신 간격을 넘겼습니다.' : '평소 간격 안에서 갱신되고 있습니다.';
  return { key, label, status, lastUpdate, maxStaleMin, members, note };
}
// Briefing entries that belong to a group, by the IDs the app gives them.
const FRED = /\bFRED\b|Federal Reserve Economic Data/i;
const BRIEFING_MEMBERS: Partial<Record<string, (entry: BriefingEntry) => boolean>> = {
  news: e => e.id.startsWith('world:') && !e.id.startsWith('world:earthquake:'),
  security: e => e.id.startsWith('geopolitics:'),
  hazard: e => e.id.startsWith('world:earthquake:'),
  macro: e => e.id.startsWith('macro:') || (e.id.startsWith('market:') && FRED.test(`${e.source?.id ?? ''} ${e.source?.label ?? ''}`)),
};
/** A group with no record in this browser's tracker, stated from what the briefing on screen holds for it. Otherwise unchanged. */
function withBriefing(group: SourceGroup, briefing: BriefingHolding | null): SourceGroup {
  const belongs = BRIEFING_MEMBERS[group.key];
  if (!briefing || !belongs || group.status === 'off' || group.status === 'down' || group.members.some(m => m.lastUpdate !== null)) return group;
  const held = briefing.entries.filter(belongs); if (!held.length) return group;
  // The time the item was fetched; otherwise its own exact time. A date-only daily value has no clock time to show.
  const times = held.map(e => parsed(briefing.anchors[e.id]?.fetchedAt) ?? parsed(e.observedAt)).filter((t): t is number => t !== null);
  const days = held.map(e => e.observedAt).filter((d): d is string => dateOnly(d)).sort();
  const newestDay = days.length ? days[days.length - 1]!.slice(5).split('-').map(Number).join('/') : null;
  // Same rule as the tracker: current only when every item is; one old value makes the group late, as the market cells say.
  const status: GroupStatus = held.every(e => e.freshness === 'FRESH') ? 'fresh' : 'late';
  const heldText = times.length ? `브리핑에 들어온 자료 ${held.length}건` : `브리핑에 들어온 일별 값 ${held.length}개${newestDay ? ` · 가장 최근 값 ${newestDay}` : ''}`;
  const note = `${heldText}${status === 'late' ? ' · 오래된 값 포함' : ''} · 출처별 수신 기록은 서버에 있어 여기서 세지 않습니다.`;
  return { ...group, status, lastUpdate: times.length ? Math.max(...times) : null, note, via: 'briefing' };
}
export function sourceGroups(sources: readonly SourceState[], discovery: OwnerDiscoveryRead | null, discoveryFailed: boolean, sections: readonly BriefingSection[],
  briefing: BriefingHolding | null = null, now: number = Date.now()): SourceGroup[] {
  const byId = new Map(sources.map(s => [s.id, s]));
  const groups = GROUPS.map(g => {
    const members = g.ids.flatMap(id => { const s = byId.get(id); return s ? [{ id, label: MEMBER_LABEL[id] ?? s.name ?? id, status: s.status, lastUpdate: parsed(s.lastUpdate), itemCount: s.itemCount ?? 0 }] : []; });
    const stale = g.ids.map(id => byId.get(id)?.maxStaleMin).find((n): n is number => typeof n === 'number' && n > 0) ?? null;
    return withBriefing(groupFrom(g.key, g.label, members, stale, now), briefing);
  });
  const sec = sections.find(s => s.category === 'COMPANY_SEC');
  const secStatus: GroupStatus = !sec ? 'none' : sec.availability === 'AVAILABLE' ? 'fresh' : sec.availability === 'DELAYED' || sec.availability === 'UPDATING' ? 'late' : sec.availability === 'UNAVAILABLE' ? 'down' : 'none';
  const secTimes = (sec?.entries ?? []).map(e => parsed(e.observedAt)).filter((t): t is number => t !== null);
  groups.push({ key: 'sec', label: '기업·SEC 공시', status: secStatus, lastUpdate: secTimes.length ? Math.max(...secTimes) : null, maxStaleMin: null,
    members: [], note: secStatus === 'fresh' ? `불러온 공시 ${sec!.entries.length}건` : secStatus === 'none' ? '불러온 공시가 없습니다.' : '공시 자료가 지연되거나 사용할 수 없습니다.' });
  const availability = Object.values(discovery?.discovery.quoteAvailability ?? {});
  const quoteStatus: GroupStatus = discoveryFailed ? 'down' : !discovery ? 'none'
    : availability.some(a => a.status === 'SESSION_OBSERVATION_AVAILABLE') ? 'fresh'
    : availability.length && availability.every(a => a.status === 'MARKET_CLOSED_LAST_KNOWN') ? 'closed'
    : availability.some(a => a.status === 'PROVIDER_STALE_WHILE_SESSION_ACTIVE' || a.status === 'MARKET_CLOSED_LAST_KNOWN') ? 'late' : 'none';
  const quoteTimes = (discovery?.scan.results ?? []).map(r => parsed(r.frozenInputs.quote?.evidence?.market?.fetchedAt)).filter((t): t is number => t !== null);
  groups.push({ key: 'quotes', label: '시세', status: quoteStatus, lastUpdate: quoteTimes.length ? Math.max(...quoteTimes) : null, maxStaleMin: 30, members: [],
    note: quoteStatus === 'fresh' ? '미국 장중 · 지연 시세(15~20분)' : quoteStatus === 'closed' ? '미국 장 마감 · 마지막 관측값' : quoteStatus === 'late' ? '거래 세션 중인데 관측이 기준보다 오래됐습니다.' : quoteStatus === 'down' ? '저장 시세를 읽지 못했습니다.' : '저장 시세가 없습니다.' });
  return groups;
}
/** `closed` is the newest value a closed market can have, so it counts as up to date. */
export const groupCurrent = (g: SourceGroup) => g.status === 'fresh' || g.status === 'closed';

// ---- Signals index ----------------------------------------------------------
export interface SignalsIndex { today: number; total: number; sources: number; linked: number; byHour: number[]; nowHour: number; byCategory: Array<{ label: string; count: number }> }
export function signalsIndex(entries: readonly BriefingEntry[], now: number): SignalsIndex {
  const today = (e: BriefingEntry) => dayLabel(e.observedAt, now) === '오늘';
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const e of entries) { const at = parsed(e.observedAt); if (at !== null && today(e)) byHour[Number(kstParts(at).hour)]! += 1; }
  const labels = ['지정학', '시장', '에너지', '물류·인프라', '자연재해'] as const;
  const byCategory = labels.map(label => ({ label: label as string, count: entries.filter(e => eventCategory(e) === label).length }));
  byCategory.push({ label: '기타', count: entries.filter(e => !(labels as readonly string[]).includes(eventCategory(e))).length });
  return { today: entries.filter(today).length, total: entries.length, sources: new Set(entries.map(e => e.source?.label).filter(Boolean)).size,
    linked: entries.filter(e => e.source?.href).length, byHour, nowHour: Number(kstParts(now).hour), byCategory };
}

// ---- Portfolio --------------------------------------------------------------
export interface HoldingRow { symbol: string; kind: string; size: string; change: string | null; direction: 'up' | 'down' | 'flat' | null; changeNote: string; events: BriefingEntry[] }
const SIZE: Record<string, string> = { HIGH: '큼', MEDIUM: '보통', LOW: '작음', NONE: '없음', UNKNOWN: '미확인' };
export function holdingRows(universe: readonly OwnerUniverseEntry[], entries: readonly BriefingEntry[], discovery: OwnerDiscoveryRead | null): HoldingRow[] {
  return universe.filter(e => e.actualHolding && e.positionState !== 'FLAT').map(holding => {
    const result = discovery?.scan.results.find(r => r.instrument.symbol === holding.symbol);
    const market = result?.frozenInputs.quote?.evidence?.market;
    const change = typeof market?.changePercent === 'number' && Number.isFinite(market.changePercent) ? market.changePercent : null;
    const fresh = result?.slots.find(s => s.key === 'quote')?.state === 'ELIGIBLE';
    return { symbol: holding.symbol, kind: holding.assetClass === 'ETF' ? 'ETF' : holding.assetClass === 'EQUITY' ? '주식' : '종류 미확인', size: SIZE[holding.positionSizeBucket] ?? '미확인',
      change: change === null ? null : `${change > 0 ? '+' : ''}${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(change)}%`,
      direction: change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      changeNote: change === null ? '시세 미수신' : fresh ? '지연 시세' : '마지막 관측 · 오래된 값',
      events: entries.filter(e => e.context?.symbols?.includes(holding.symbol)) };
  });
}

// ---- Learning status (Research) --------------------------------------------
/** undefined: not read yet. null: the read failed. */
export type LearningInput = LearningRead | null | undefined;
export interface LearningCell { label: string; value: string | null; note: string }
export interface LearningSimilar { when: string; what: string; shared: string; outcome: string }
export interface LearningView {
  state: 'loading' | 'failed' | 'empty' | 'ready';
  message: string;
  cells: LearningCell[];
  run: { text: string; tone: Tone } | null;
  symbol: { symbol: string; caseLine: string; similarLine: string; similar: LearningSimilar[]; calibration: string } | null;
  unknowns: string[];
}
const HORIZON_LABEL = (h: number) => `${h}일`;
const md = (value: string | null | undefined): string | null => {
  const at = parsed(value); if (at === null) return null;
  const p = kstParts(at); return `${Number(p.month)}/${Number(p.day)}`;
};
const EVENT_TYPE_KO: Record<string, string> = {
  LEVERAGED_ETF_DAILY_REGIME: '레버리지 ETF 일간 국면', 'Offering Evidence': '증자 공시', 'Preferred Conversion Evidence': '우선주 전환 공시',
  'Dilution Evidence': '희석 공시', 'ATM Facility': 'ATM 증자 한도', 'Shares Outstanding Change': '발행주식수 변동', 'Warrant Exercise Evidence': '워런트 행사 공시',
};
/** Stored event types are joined with ` + `; unknown parts keep their stored wording. */
export const learningEventType = (value: string) => value.split(' + ').map(part => EVENT_TYPE_KO[part.trim()] ?? part.trim()).join(' · ');
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

/**
 * What has been accumulated, what is confirmed, and what is still unknown. Counts come from the
 * stored tally; nothing is estimated, and a missing read never shows as zero.
 */
export function learningView(input: LearningInput, symbol: string | null, researchSymbols: readonly string[], now: number): LearningView {
  const blank = { cells: [], run: null, symbol: null, unknowns: [] };
  if (input === undefined) return { state: 'loading', message: '학습 기록을 읽고 있습니다.', ...blank };
  if (input === null) return { state: 'failed', message: '학습 기록을 읽지 못했습니다. 사례가 없다는 뜻이 아닙니다.', ...blank };
  const status = input.status;
  if (!status) return { state: 'empty', message: input.store === 'MISSING' ? '저장된 학습 기록이 아직 없습니다.' : '이 화면이 읽을 수 없는 형식의 학습 기록입니다. 사례 수를 표시하지 않습니다.', ...blank };
  if (status.caseCount === 0) return { state: 'empty', message: '축적된 사례가 아직 없습니다.', ...blank };
  const horizons = [1, 5, 20, 60] as const;
  const confirmed = horizons.map(h => status.confirmedByHorizon[h]);
  const lastSuccess = parsed(status.run.lastSuccessfulRunAt);
  const lateAfterMs = status.run.cadenceMinutes * 3 * 60_000;
  // The pill carries the judgement; the cell below carries the time it is based on.
  const run = lastSuccess === null ? { text: '성공 기록 없음', tone: 'down' as Tone }
    : now - lastSuccess > lateAfterMs ? { text: `주기 지연 · 마지막 성공 ${ago(now - lastSuccess)}`, tone: 'late' as Tone }
    : { text: '주기대로 갱신 중', tone: 'fresh' as Tone };
  const lastSuccessText = lastSuccess === null ? null : `${dayLabel(status.run.lastSuccessfulRunAt, now)} ${clock(status.run.lastSuccessfulRunAt)}`;
  const cells: LearningCell[] = [
    { label: '축적 사례', value: `${status.caseCount}건`, note: `${status.symbolCount}종목 · 최근 7일 +${status.createdWithinDays[7]}건 · 30일 +${status.createdWithinDays[30]}건` },
    { label: '사건 기간', value: md(status.firstEventAt) && md(status.lastEventAt) ? `${md(status.firstEventAt)} ~ ${md(status.lastEventAt)}` : null,
      note: md(status.firstCaseCreatedAt) ? `사건일 기준 · 기록은 ${md(status.firstCaseCreatedAt)}부터 쌓았습니다` : '기록 시작일 미확인' },
    { label: '결과 확정', value: confirmed.join(' · '), note: `${horizons.map(HORIZON_LABEL).join(' · ')} 뒤 결과가 확정된 사례 수 (거래일)` },
    { label: '마지막 성공한 학습 작업', value: lastSuccessText, note: `${status.run.cadenceMinutes}분 주기 · 실패 시각은 저장되지 않습니다` },
  ];
  const unknowns: string[] = [];
  const weakest = horizons.reduce((a, b) => status.confirmedByHorizon[b] < status.confirmedByHorizon[a] ? b : a);
  if (status.confirmedByHorizon[weakest] < status.caseCount) unknowns.push(`${HORIZON_LABEL(weakest)} 뒤 결과는 ${status.caseCount}건 중 ${status.confirmedByHorizon[weakest]}건만 확정됐습니다.`);
  if (status.statusCounts.OPEN > 0) unknowns.push(`아직 어떤 결과도 확정되지 않은 사례가 ${status.statusCounts.OPEN}건 있습니다.`);
  const partial = horizons.reduce((sum, h) => sum + status.partialByHorizon[h], 0);
  if (partial > 0) unknowns.push(`가격 경로가 일부만 관측된 결과 ${partial}건은 확정으로 세지 않았습니다.`);
  const known = new Set(status.symbols.map(row => row.symbol));
  const absent = researchSymbols.filter(s => !known.has(s));
  if (absent.length && !status.symbolsTruncated) unknowns.push(`축적된 사례가 없는 종목: ${absent.join(' · ')}`);
  if (status.run.degradedSymbolCount > 0) unknowns.push(`마지막 작업에서 ${status.run.degradedSymbolCount}종목은 자료가 부족해 건너뛰었습니다.`);
  if (!input.snapshot) unknowns.push('유사 사례와 보정 요약은 읽지 못했습니다.');
  let symbolView: LearningView['symbol'] = null;
  if (symbol) {
    const row = status.symbols.find(r => r.symbol === symbol);
    const summary = input.snapshot?.bySymbol[symbol] ?? null;
    const caseLine = row
      ? `사례 ${row.caseCount}건 · ${md(row.firstEventAt)} ~ ${md(row.lastEventAt)} · 결과 확정 ${horizons.map(h => `${HORIZON_LABEL(h)} ${row.confirmedByHorizon[h]}`).join(' · ')}`
      : '이 종목의 사례가 아직 없습니다.';
    const similar = (summary?.similarCases ?? []).slice(0, 3).map(c => ({
      when: md(c.eventAt) ?? '날짜 미확인', what: `${c.symbol} · ${learningEventType(c.eventType)}`,
      shared: `공통 신호 ${c.sharedSignals.length}개`,
      outcome: c.outcome && Number.isFinite(c.outcome.absoluteReturnPercent) ? `${HORIZON_LABEL(c.outcome.tradingDays)} 뒤 ${signed(c.outcome.absoluteReturnPercent)}` : '결과 미확정',
    }));
    const calibration = !summary ? '보정 요약 없음'
      : summary.calibration.applied ? `확신도 보정 적용 · ${Math.round(summary.calibration.rawConfidence * 100)}% → ${Math.round(summary.calibration.adjustedConfidence * 100)}% · 표본 ${summary.calibration.sampleCount}건`
      : `보정 미적용 · 표본 ${summary.calibration.sampleCount}건 (최소 ${summary.calibration.minimumSampleSize}건 필요)`;
    const similarLine = !summary ? '유사 사례 요약 없음' : summary.similarCaseCount === 0 ? '신호가 겹치는 과거 사례 없음' : `신호가 겹치는 과거 사례 ${summary.similarCaseCount}건`;
    symbolView = { symbol, caseLine, similarLine, similar, calibration };
  }
  return { state: 'ready', message: '', cells, run, symbol: symbolView, unknowns };
}
