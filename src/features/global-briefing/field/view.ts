import type { OwnerDiscoveryRead } from '../../../../shared/owner-discovery-read-contract';
import type { OwnerUniverseEntry } from '../../../../shared/tossinvest-contract';
import type { LearningRead } from '../../../../shared/autonomous-learning-status';
import type { BriefingEntry } from '../../product-recovery/situation-synthesis-model';
import { eventCategory, eventCoordinates, sourceHref, visibleEvents, type BriefingUpdate } from '../model';
import { briefingPresentation, briefingSearchText, type BriefingSearchItem } from '../presentation';
import { mapPoint, worldMap } from '../world-map';
import { blockerText, candidateLabel, FACTOR_LABELS, FACTOR_STATE_LABELS } from '../../owner-discovery/result-labels';
import {
  clock, dayLabel, foldMinorQuakes, freshnessLabel, groupCurrent, GROUP_STATUS_LABEL, holdingRows, isMinorQuake, learningView, marketCells, marketLinked, metricValueLine, newestFirst, QUAKE_FOLD_BELOW, regionLabel, researchSummary,
  screenClock, SEVERITY_LABEL, severityOf, shortSource, signalsIndex, sourceGroups, breadthOf, type LearningInput, type SourceGroup, type SourceState,
} from './data';
import type { BriefingOptions } from '../surface';
import './field.css';

type Section = 'Atlas' | 'Signals' | 'Research' | 'Portfolio' | 'Sources' | 'Tools';
type Filter = 'all' | 'high' | 'market';
// The namespace stays inside createElementNS: it is a standards reference, not a data source.
const svgNode = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] => document.createElementNS('http://www.w3.org/2000/svg', tag);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node;
}
function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
}
const ICONS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  atlas: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  signals: 'M3 12h4l3-7 4 14 3-7h4',
  research: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3',
  portfolio: 'M12 3a9 9 0 1 0 9 9h-9V3Zm3 0a6 6 0 0 1 6 6h-6V3Z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5m0-8h.01',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
};
function icon(name: string): SVGSVGElement {
  const svg = svgNode('svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('gf-icon');
  const path = svgNode('path'); path.setAttribute('d', ICONS[name]!); svg.append(path); return svg;
}
function dot(kind: string | null, hollow = false): HTMLSpanElement { const d = el('span', '', `gf-dot${hollow ? ' gf-dot-hollow' : ''}`); if (kind) d.dataset.kind = kind; d.setAttribute('aria-hidden', 'true'); return d; }
function pill(text: string, tone: string, className = ''): HTMLSpanElement { const p = el('span', '', `gf-pill ${className}`.trim()); p.dataset.tone = tone; p.append(dot(tone), el('span', text)); return p; }
function tag(text: string, kind: string | null): HTMLSpanElement { const t = el('span', '', 'gf-tag'); t.append(dot(kind), el('span', text)); return t; }
const toneOf = (status: string) => status === 'fresh' ? 'fresh' : status === 'closed' ? 'closed' : status === 'late' ? 'late' : status === 'down' ? 'down' : 'muted';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A clicked map-layer item, as the app shell describes it (`mymonitor:map-item-select`). Rendered as text only. */
interface MapItem { kindLabel: string; title: string; facts: Array<[string, string]>; latitude: number | null; longitude: number | null; sourceUrl: string | null; related: Array<{ title: string; url: string | null }> }
function readMapItem(value: unknown): MapItem | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => typeof x === 'string' && x.trim() ? x.trim() : null;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const title = text(v.title); if (!title) return null;
  const facts = Array.isArray(v.facts) ? v.facts.flatMap(f => Array.isArray(f) && text(f[0]) && text(f[1]) ? [[text(f[0])!, text(f[1])!] as [string, string]] : []) : [];
  const related = Array.isArray(v.related) ? v.related.flatMap(r => r && typeof r === 'object' && text((r as Record<string, unknown>).title) ? [{ title: text((r as Record<string, unknown>).title)!, url: sourceHref(text((r as Record<string, unknown>).url) ?? undefined) }] : []) : [];
  return { kindLabel: text(v.kindLabel) ?? '지도 항목', title, facts, latitude: num(v.latitude), longitude: num(v.longitude), sourceUrl: sourceHref(text(v.sourceUrl) ?? undefined), related };
}
const OPEN_SOURCE = [['소스 코드', 'https://github.com/pengveloper/MyMonitor'], ['원본 프로젝트 · WorldMonitor', 'https://github.com/koala73/worldmonitor'], ['라이선스', 'https://github.com/koala73/worldmonitor/blob/main/LICENSE']] as const;

/** The field design. A presentation of already-read canonical state: no IO, no invented values. */
export function mountFieldBriefing(host: HTMLElement, options: BriefingOptions = {}) {
  let update: BriefingUpdate | null = null, discovery: OwnerDiscoveryRead | null = null, discoveryFailed = false;
  let selected: string | null = null, filter: Filter = 'all', section: Section = 'Atlas', researchSymbol: string | null = null;
  let mapItem: MapItem | null = null, quakesOpen = false;
  // Until the owner picks an event, the default is worked out again on every render: coordinates can arrive after the first one.
  let userPicked = false;
  let sources: readonly SourceState[] = [], holdings: readonly OwnerUniverseEntry[] | null = null, holdingsFailed = false;
  // undefined until the first read answers; null when that read failed.
  let learning: LearningInput;
  let now = Date.now();

  const root = el('section', '', 'global-briefing gb-field'); root.dataset.design = 'next'; root.dataset.section = 'Atlas'; root.setAttribute('aria-label', '세계 상황실');
  // ---- Top bar ----
  const top = el('header', '', 'gb-top gf-top');
  const brand = button('', () => navigate('Atlas'), 'gf-brand'); brand.setAttribute('aria-label', 'MyMonitor · Atlas로 이동');
  const mark = el('span', '', 'gf-mark'); mark.setAttribute('aria-hidden', 'true'); brand.append(mark, el('span', 'MyMonitor', 'gf-wordmark'));
  const nav = el('nav', '', 'gb-nav gf-nav'); nav.setAttribute('aria-label', '화면');
  const SECTIONS = [['Atlas', 'atlas'], ['Signals', 'signals'], ['Research', 'research'], ['Portfolio', 'portfolio']] as const;
  const navButtons = SECTIONS.map(([name]) => { const b = button(name, () => navigate(name)); b.dataset.section = name; nav.append(b); return b; });
  const stamp = el('span', '', 'gf-clock');
  const sourcePill = button('', () => navigate('Sources'), 'gf-source-pill'); sourcePill.dataset.section = 'Sources';
  const searchButton = button('', () => options.onSearch ? options.onSearch() : openSearch(), 'gf-icon-button gf-search-button'); searchButton.append(icon('search')); searchButton.setAttribute('aria-label', '사건 검색 · Ctrl K');
  const menuButton = button('', () => { const open = root.dataset.menu !== 'open'; root.dataset.menu = open ? 'open' : ''; menuButton.setAttribute('aria-expanded', String(open)); }, 'gf-icon-button gf-menu-button');
  menuButton.append(icon('more')); menuButton.setAttribute('aria-label', '더보기'); menuButton.setAttribute('aria-expanded', 'false');
  const menu = el('div', '', 'gf-menu');
  const toolsButton = button('전체 기능 · 설정', () => navigate('Tools'), 'gf-text-button gb-tools-button'); toolsButton.hidden = true; // Only the actual app shell supplies these tools.
  menu.append(toolsButton);
  // While both layouts are offered, the way back stays one click away on wide screens; the menu keeps it everywhere.
  const designBack = options.onDesignChange ? button('기존 화면', () => options.onDesignChange?.('current'), 'gf-text-button gf-design-back') : null;
  if (designBack) { designBack.dataset.target = 'current'; designBack.setAttribute('aria-label', '기존 화면으로 돌아가기'); }
  if (options.onDesignChange) {
    const switchDesign = button('기존 화면으로 돌아가기', () => options.onDesignChange?.('current'), 'gf-text-button gb-design-switch'); switchDesign.dataset.target = 'current'; menu.append(switchDesign);
  }
  // The app's page footer is hidden in this layout, so its source and licence links live here.
  const openSource = el('div', '', 'gf-menu-links'); openSource.append(el('span', '출처·오픈소스', 'gf-menu-label'));
  for (const [label, href] of OPEN_SOURCE) { const a = el('a', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; openSource.append(a); }
  menu.append(openSource);
  top.append(brand, nav, stamp, sourcePill, ...(designBack ? [designBack] : []), searchButton, menuButton, menu);

  // ---- Atlas ----
  const main = el('div', '', 'gf-main');
  const atlas = el('div', '', 'gf-atlas');
  const signals = el('aside', '', 'gf-signals'); signals.setAttribute('aria-label', 'Signals');
  const signalsHead = el('div', '', 'gf-panel-head'); const signalsMeta = el('span', '', 'gf-meta');
  signalsHead.append(el('h2', 'Signals', 'gf-serif'), signalsMeta);
  const chips = el('div', '', 'gf-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', '사건 거르기');
  const CHIPS = [['all', '전체'], ['high', '높음'], ['market', '시장 연결']] as const;
  const chipButtons = CHIPS.map(([key, label]) => {
    const b = button('', () => { filter = key; mapItem = null; renderAtlas(); }, 'gf-chip'); b.dataset.filter = key;
    b.append(el('span', label), el('span', '', 'gf-chip-count')); chips.append(b); return b;
  });
  const list = el('div', '', 'gf-signal-list');
  signals.append(signalsHead, chips, list);
  list.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(list.querySelectorAll<HTMLButtonElement>('.gf-signal')); const at = rows.indexOf(event.target as HTMLButtonElement);
    const to = rows[at + (event.key === 'ArrowDown' ? 1 : -1)]; if (at >= 0 && to) { event.preventDefault(); to.focus(); }
  });

  const stage = el('section', '', 'gf-stage'); stage.setAttribute('aria-label', '지도');
  const mapBox = el('div', '', 'gf-map');
  const engineHost = el('div', '', 'gb-engine-host gf-engine');
  // The drawing and its pins share one cover-sized frame, so a pin stays on its place at any aspect ratio.
  const svgMap = el('div', '', 'gf-svgmap'); const frame = el('div', '', 'gf-frame'); const camera = el('div', '', 'gf-camera'); camera.append(worldMap());
  const pins = el('div', '', 'gf-pins'); camera.append(pins); frame.append(camera); svgMap.append(frame);
  const mapTitle = el('div', '', 'gf-map-title'); const mapSubtitle = el('p', '', 'gf-map-subtitle');
  const scenarioNote = el('p', '가상 시나리오 · 실제 계좌·현재 시장 아님', 'gf-scenario'); scenarioNote.hidden = true;
  // Below 1280px the detail sits under the map; after a map click this takes the reader there.
  const detailJump = button('아래 상세 보기', () => { detail.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'instant' : 'smooth' }); }, 'gf-text-button gf-detail-jump');
  detailJump.hidden = true;
  mapTitle.append(el('h1', 'Global Briefing', 'gf-serif'), mapSubtitle, scenarioNote, detailJump);
  const layerPill = button('', () => { const open = root.dataset.layers !== 'open'; root.dataset.layers = open ? 'open' : ''; layerPill.setAttribute('aria-expanded', String(open)); }, 'gf-layer-pill');
  layerPill.setAttribute('aria-expanded', 'false');
  const layerNote = el('p', '이 지도는 확인된 사건 좌표만 표시합니다. 다른 레이어는 실제 지도 엔진에서 고를 수 있습니다.', 'gf-layer-note');
  // The legend states what this map actually draws. The real engine marks briefing events with one blue dot and the
  // selection with a ring; every other colour belongs to a layer the owner switched on. The fallback map colours its pins by importance.
  const legend = el('div', '', 'gf-legend'); legend.setAttribute('aria-label', '범례');
  const engineLegend = el('span', '', 'gf-legend-engine');
  const briefingKey = el('span'); briefingKey.append(dot('briefing'), el('span', '브리핑 사건'));
  const selectedKey = el('span'); selectedKey.append(el('span', '', 'gf-ring-key'), el('span', '선택'));
  engineLegend.append(briefingKey, selectedKey, el('span', '그 밖의 색 · 켠 레이어', 'gf-legend-note'));
  const fallbackLegend = el('span', '', 'gf-legend-fallback');
  for (const [kind, label] of [['high', '높음'], ['watch', '주의'], ['normal', '보통'], [null, '분류 없음']] as const) { const item = el('span'); item.append(dot(kind), el('span', label)); fallbackLegend.append(item); }
  legend.append(engineLegend, fallbackLegend);
  mapBox.append(engineHost, svgMap, mapTitle, layerPill, layerNote, legend);
  const strip = el('div', '', 'gf-strip'); strip.setAttribute('aria-label', '시장');
  stage.append(mapBox, strip);

  const detail = el('aside', '', 'gf-detail'); detail.setAttribute('aria-label', '선택한 사건'); detail.setAttribute('aria-live', 'polite');
  atlas.append(signals, stage, detail);

  // ---- Other sections ----
  const feed = el('section', '', 'gf-view gf-feed'); feed.setAttribute('aria-label', 'Signals · 오늘 불러온 사건');
  const research = el('section', '', 'gf-view gf-research'); research.setAttribute('aria-label', 'Research');
  const researchBody = el('div');
  const discoveryHost = el('section', '', 'gb-existing gb-discovery');
  const researchFull = el('details', '', 'gf-full'); researchFull.append(el('summary', '전체 종목 표와 근거 열기'), discoveryHost);
  research.append(researchBody, researchFull);
  const portfolio = el('section', '', 'gf-view gf-portfolio'); portfolio.setAttribute('aria-label', 'Portfolio');
  const portfolioBody = el('div');
  const investmentHost = el('section', '', 'gb-existing gb-investment');
  const portfolioFull = el('details', '', 'gf-full'); portfolioFull.append(el('summary', '보유 상세 열기'), investmentHost);
  portfolio.append(portfolioBody, portfolioFull);
  const sourcesView = el('section', '', 'gf-view gf-sources'); sourcesView.setAttribute('aria-label', '출처 상태');
  const toolsHost = el('section', '', 'gb-tools-host'); toolsHost.setAttribute('aria-label', '전체 기능과 설정');
  main.append(atlas, feed, research, portfolio, sourcesView, toolsHost);
  const tabbar = el('nav', '', 'gf-tabbar'); tabbar.setAttribute('aria-label', '화면');
  const tabButtons = SECTIONS.map(([name, glyph]) => { const b = button('', () => navigate(name)); b.dataset.section = name; b.append(icon(glyph), el('span', name)); tabbar.append(b); return b; });
  root.append(top, main, tabbar); host.append(root);

  // ---- Search (only when the app supplies none) ----
  const dialog = el('dialog', '', 'gf-search'); dialog.setAttribute('aria-label', '사건 검색');
  const input = el('input'); input.type = 'search'; input.placeholder = '사건 제목이나 지역을 검색하세요'; input.setAttribute('aria-label', '사건 검색어');
  const results = el('div', '', 'gf-search-results'); let returnFocus: HTMLElement | null = null;
  const closeSearch = () => { dialog.close(); returnFocus?.focus(); };
  dialog.append(el('h2', '사건 검색'), input, results, button('닫기 · Esc', closeSearch, 'gf-text-button')); root.append(dialog);
  function renderSearch() {
    results.replaceChildren(); const found = newestFirst(visibleEvents(update, '전체', input.value));
    for (const e of found) results.append(button(briefingPresentation(e).title, () => { closeSearch(); selectEvent(e.id); }));
    if (!found.length) results.append(el('p', '불러온 사건에 맞는 결과가 없습니다.'));
  }
  function openSearch() { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : searchButton; renderSearch(); dialog.showModal?.(); input.focus(); }
  input.addEventListener('input', renderSearch);
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSearch(); } });
  const onKey = (event: KeyboardEvent) => { if (!options.onSearch && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } };
  root.ownerDocument.addEventListener('keydown', onKey);

  // ---- Navigation ----
  function navigate(name: Section) {
    // A different page opens at its top; the previous page's scroll position does not carry over.
    if (name !== section) { const scroller = root.closest<HTMLElement>('.main-content'); if (scroller) scroller.scrollTop = 0; else if (typeof window.scrollTo === 'function') try { window.scrollTo(0, 0); } catch { /* jsdom */ } }
    section = name; root.dataset.section = name; root.dataset.menu = ''; menuButton.setAttribute('aria-expanded', 'false');
    atlas.hidden = name !== 'Atlas'; feed.hidden = name !== 'Signals'; research.hidden = name !== 'Research';
    portfolio.hidden = name !== 'Portfolio'; sourcesView.hidden = name !== 'Sources'; toolsHost.hidden = name !== 'Tools';
    toolsButton.setAttribute('aria-expanded', String(name === 'Tools'));
    for (const b of [...navButtons, ...tabButtons]) b.setAttribute('aria-current', b.dataset.section === name ? 'page' : 'false');
    sourcePill.setAttribute('aria-current', name === 'Sources' ? 'page' : 'false');
    if (name === 'Signals') renderFeed(); if (name === 'Research') renderResearch(); if (name === 'Portfolio') renderPortfolio(); if (name === 'Sources') renderSources();
    if (name === 'Atlas') options.onMapResize?.();
    options.onSectionChange?.(name);
  }

  // ---- Selection ----
  // Newest first everywhere a list of events is shown; the model's section order is not a time order.
  const allEvents = (): BriefingEntry[] => newestFirst(visibleEvents(update, '전체'));
  const matches = (e: BriefingEntry, key: Filter) => key === 'all' || (key === 'high' ? severityOf(e) === 'high' : marketLinked(e));
  function events(): BriefingEntry[] { return allEvents().filter(e => matches(e, filter)); }
  const hasPlace = (e: BriefingEntry) => Boolean(eventCoordinates(update?.anchors[e.id]));
  function selectEvent(id: string, fromMap = false) {
    if (!visibleEvents(update, '전체').some(e => e.id === id)) return;
    if (!events().some(e => e.id === id)) filter = 'all';
    selected = id; userPicked = true; mapItem = null; if (section !== 'Atlas') navigate('Atlas');
    renderAtlas(); focusMap(fromMap);
    const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
    if (narrow && !fromMap) mapBox.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'instant' : 'smooth' });
    if (!fromMap) list.querySelector<HTMLButtonElement>(`.gf-signal[data-event-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
  function focusMap(fromMap: boolean) {
    const entry = visibleEvents(update, '전체').find(e => e.id === selected);
    const coords = mapItem ? (mapItem.latitude !== null && mapItem.longitude !== null ? [mapItem.longitude, mapItem.latitude] as [number, number] : null)
      : entry ? eventCoordinates(update?.anchors[entry.id]) : null;
    const durationMs = reducedMotion() ? 0 : 1100;
    if (coords && !fromMap) options.onMapFocus?.(coords[1], coords[0], { durationMs });
    options.onMapSelect?.(coords && mapItem ? { latitude: coords[1], longitude: coords[0], label: mapItem.title, severity: null }
      : entry && coords ? { latitude: coords[1], longitude: coords[0], label: regionLabel(entry), severity: severityOf(entry) } : null);
    // The fallback map moves the same way: centre and enlarge around the selected point.
    const point = coords && mapPoint(coords);
    camera.style.transitionDuration = `${durationMs}ms`;
    camera.style.transform = point ? `translate(${50 - point[0] / 640 * 100}%, ${50 - point[1] / 330 * 100}%) scale(1.35)` : '';
    camera.style.transformOrigin = point ? `${point[0] / 640 * 100}% ${point[1] / 330 * 100}%` : '';
    camera.style.setProperty('--gf-inv', point ? String(1 / 1.35) : '1');
  }
  const mapSelection = (event: Event) => selectEvent((event as CustomEvent<string>).detail, true);
  root.ownerDocument.addEventListener('mymonitor:briefing-map-select', mapSelection);
  root.ownerDocument.addEventListener('mymonitor:briefing-map-evidence', mapSelection);
  // A clicked map-layer item (not a briefing event) opens in the detail panel instead of the engine popup.
  const mapItemSelection = (event: Event) => {
    const item = readMapItem((event as CustomEvent<unknown>).detail); if (!item) return;
    mapItem = item; if (section !== 'Atlas') navigate('Atlas');
    renderAtlas(); focusMap(true);
  };
  root.ownerDocument.addEventListener('mymonitor:map-item-select', mapItemSelection);
  function closeMapItem() { mapItem = null; renderAtlas(); focusMap(true); list.querySelector<HTMLButtonElement>('.gf-signal[aria-pressed=true]')?.focus({ preventScroll: true }); }
  const showMap = () => navigate('Atlas'); window.addEventListener('mymonitor:map-enter', showMap);
  const showTools = () => navigate('Tools'); root.ownerDocument.addEventListener('mymonitor:briefing-tools', showTools);

  // ---- Atlas rendering ----
  function renderAtlas() {
    const shown = events();
    // The default is the newest event with a place on the map that is not a folded minor quake, so the first screen shows where it is.
    if (!userPicked || !shown.some(e => e.id === selected)) selected = (shown.find(e => hasPlace(e) && !isMinorQuake(e)) ?? shown.find(hasPlace) ?? shown[0])?.id ?? null;
    const current = shown.find(e => e.id === selected) ?? null;
    root.dataset.selectedEvent = selected ?? '';
    root.dataset.mapItem = mapItem ? 'open' : '';
    const all = allEvents();
    chipButtons.forEach(b => {
      const key = b.dataset.filter as Filter; b.setAttribute('aria-pressed', String(key === filter));
      const count = update ? all.filter(e => matches(e, key)).length : null;
      b.querySelector('.gf-chip-count')!.textContent = count === null ? '' : String(count);
      b.setAttribute('aria-label', `${CHIPS.find(c => c[0] === key)![1]}${count === null ? '' : ` · ${count}건`}`);
    });
    signalsMeta.textContent = update ? `최근 자료 · ${shown.length}건` : '자료 읽는 중';
    const focusedId = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.dataset.eventId : null;
    list.replaceChildren(); pins.replaceChildren();
    // Minor earthquakes fold into one row; one picked on the map or in search opens the fold so its row is visible.
    const open = quakesOpen || Boolean(current && isMinorQuake(current));
    for (const item of foldMinorQuakes(shown, open)) {
      if (item.kind === 'quakes') { list.append(quakeFoldRow(item.entries, open, 'atlas')); continue; }
      const e = item.entry;
      const display = briefingPresentation(e); const active = e.id === selected && !mapItem; const severity = severityOf(e);
      const row = button('', () => selectEvent(e.id), 'gf-signal'); row.dataset.eventId = e.id; row.setAttribute('aria-pressed', String(active));
      row.setAttribute('aria-label', `${display.title} · ${regionLabel(e)}`);
      const time = el('span', '', 'gf-time'); const day = dayLabel(e.observedAt, now);
      if (day && day !== '오늘') time.append(el('small', day)); time.append(el('span', clock(e.observedAt) ?? (day && day !== '오늘' ? '' : '시각 없음')));
      const body = el('span', '', 'gf-signal-body'); body.append(el('span', display.title, 'gf-signal-title'));
      // A daily market value shows its own number here; its summary only states the comparison with the day before.
      const meta = el('span', '', 'gf-signal-meta'); meta.append(dot(severity), el('span', [regionLabel(e), e.context?.metric?.value?.trim() || null, shortSource(e.source?.label)].filter(Boolean).join(' · ')));
      meta.title = e.source?.label ?? '';
      const fresh = freshnessLabel(e, update?.anchors[e.id], now); const freshness = el('span', fresh.text, 'gf-fresh'); freshness.dataset.tone = fresh.tone;
      body.append(meta); row.append(time, body, freshness); list.append(row);
    }
    for (const e of shown) {
      const display = briefingPresentation(e); const active = e.id === selected && !mapItem; const severity = severityOf(e);
      const coords = eventCoordinates(update?.anchors[e.id]); const point = coords && mapPoint(coords);
      if (point) {
        const pin = button('', () => selectEvent(e.id, true), 'gf-pin'); pin.dataset.eventId = e.id; pin.setAttribute('aria-pressed', String(active));
        pin.setAttribute('aria-label', `지도: ${display.title}`); if (severity) pin.dataset.kind = severity;
        pin.style.left = `${point[0] / 640 * 100}%`; pin.style.top = `${point[1] / 330 * 100}%`;
        if (point[0] / 640 > 0.62 && !active) pin.dataset.align = 'left';
        if (active) pin.append(el('span', regionLabel(e), 'gf-pin-label'));
        pins.append(pin);
      }
    }
    if (!shown.length && update && filter !== 'all') {
      // A filter that leaves nothing says so and offers the way back, instead of a dead end.
      const empty = el('div', '', 'gf-empty gf-empty-filter'); empty.append(el('p', `${CHIPS.find(c => c[0] === filter)![1]}에 해당하는 사건이 지금은 없습니다.`));
      empty.append(button(`전체 ${all.length}건 보기`, () => { filter = 'all'; renderAtlas(); list.querySelector<HTMLButtonElement>('.gf-signal')?.focus({ preventScroll: true }); }, 'gf-text-button gf-empty-action'));
      list.append(empty);
    } else if (!shown.length) list.append(el('p', !update ? '세계 사건 자료를 읽고 있습니다.' : '불러온 사건이 없습니다. 자료가 없다는 것이 안전하다는 뜻은 아닙니다.', 'gf-empty'));
    if (focusedId) list.querySelector<HTMLButtonElement>(`.gf-signal[data-event-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    const fetched = current ? clock(update?.anchors[current.id]?.fetchedAt) : null;
    mapSubtitle.textContent = mapItem ? ['지도 레이어', mapItem.kindLabel].join(' · ')
      : current ? [regionLabel(current), shortSource(current.source?.label), fetched ? `${fetched} 확인` : null, hasPlace(current) ? null : '지도 위치 없음'].filter(Boolean).join(' · ')
      : '확인된 사건 좌표만 표시합니다';
    scenarioNote.hidden = !update?.scenario;
    detailJump.hidden = !mapItem && !current;
    if (mapItem) renderMapItem(mapItem); else renderDetail(current);
    renderStrip(mapItem ? null : current); renderLayerPill();
  }
  /** One row standing for the minor earthquakes: count, newest time and largest magnitude; it opens and closes them in place. */
  function quakeFoldRow(entries: readonly BriefingEntry[], open: boolean, where: 'atlas' | 'feed'): HTMLButtonElement {
    const label = `규모 ${QUAKE_FOLD_BELOW} 미만 지진 ${entries.length}건`;
    const largest = Math.max(...entries.map(e => e.context?.impact?.magnitude ?? 0));
    const toggle = () => {
      quakesOpen = !open;
      // Closing while one of them is selected returns the selection to the default event.
      if (!quakesOpen && entries.some(e => e.id === selected)) { selected = null; userPicked = false; }
      if (where === 'atlas') { renderAtlas(); list.querySelector<HTMLButtonElement>('.gf-fold')?.focus({ preventScroll: true }); }
      else { renderFeed(); feed.querySelector<HTMLButtonElement>('.gf-fold')?.focus({ preventScroll: true }); }
    };
    const row = button('', toggle, where === 'atlas' ? 'gf-signal gf-fold' : 'gf-feed-row gf-fold');
    row.setAttribute('aria-expanded', String(open)); row.setAttribute('aria-label', `${label} · 가장 큰 규모 ${largest.toFixed(1)} · ${open ? '접기' : '펼쳐 보기'}`);
    const newest = entries[0]!; const day = dayLabel(newest.observedAt, now);
    const timeText = `${day && day !== '오늘' ? `${day} ` : ''}${clock(newest.observedAt) ?? ''}`.trim() || '시각 없음';
    const action = el('span', open ? '접기' : '펼치기', 'gf-fresh gf-fold-action');
    if (where === 'atlas') {
      const time = el('span', '', 'gf-time'); if (day && day !== '오늘') time.append(el('small', day)); time.append(el('span', clock(newest.observedAt) ?? ''));
      const body = el('span', '', 'gf-signal-body'); body.append(el('span', label, 'gf-signal-title'));
      const meta = el('span', '', 'gf-signal-meta'); meta.append(dot(null), el('span', `가장 큰 규모 ${largest.toFixed(1)} · 지도에는 모두 표시`)); body.append(meta);
      row.append(time, body, action);
    } else {
      row.setAttribute('role', 'listitem');
      row.append(el('span', timeText, 'gf-time'), tag('자연재해', null), el('span', label, 'gf-feed-title'), el('span', `가장 큰 규모 ${largest.toFixed(1)}`, 'gf-meta'), action);
    }
    return row;
  }
  function renderMapItem(item: MapItem) {
    detail.replaceChildren(); delete detail.dataset.eventId; detail.dataset.mapItem = 'true';
    const top = el('section', '', 'gf-detail-top');
    const head = el('div', '', 'gf-detail-head'); const where = el('span', '', 'gf-where'); where.append(el('span', '', 'gf-ring-key'), el('span', `지도 레이어 · ${item.kindLabel}`));
    head.append(where, pill('레이어 자료', 'muted'));
    top.append(head, el('h2', item.title, 'gf-detail-title'));
    if (item.latitude !== null && item.longitude !== null) top.append(el('p', `좌표 ${Math.abs(item.latitude).toFixed(2)}°${item.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(item.longitude).toFixed(2)}°${item.longitude >= 0 ? 'E' : 'W'}`, 'gf-times'));
    const facts = el('section', '', 'gf-block'); facts.append(el('h3', '레이어에 적힌 내용'));
    if (item.facts.length) { const dl = el('dl', '', 'gf-item-facts'); for (const [k, v] of item.facts) dl.append(el('dt', k), el('dd', v)); facts.append(dl); }
    else facts.append(el('p', '이 항목에는 이름과 위치 외에 적힌 내용이 없습니다.', 'gf-empty'));
    const blocks: HTMLElement[] = [top, facts];
    if (item.related.length || item.sourceUrl) {
      const links = el('section', '', 'gf-block'); links.append(el('h3', '관련 자료'));
      const chipsRow = el('div', '', 'gf-evidence-chips');
      if (item.sourceUrl) { const a = el('a', '', 'gf-evidence'); a.href = item.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(el('strong', '원문'), el('span', new URL(item.sourceUrl).hostname)); chipsRow.append(a); }
      links.append(chipsRow);
      if (item.related.length) {
        const ul = el('ul', '', 'gf-related');
        for (const r of item.related) { const li = el('li'); if (r.url) { const a = el('a', r.title); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); } else li.append(el('span', r.title)); ul.append(li); }
        links.append(ul);
      }
      blocks.push(links);
    }
    const foot = el('p', '', 'gf-footnote'); foot.append(icon('info'), el('span', '켠 지도 레이어의 자료입니다. 브리핑 사건과 따로 수집되며, 확인된 사실로 분류하지 않습니다.'));
    const back = el('section', '', 'gf-block'); back.append(button('사건 목록으로 돌아가기', closeMapItem, 'gf-text-button gf-item-back'));
    detail.append(...blocks, back, foot);
  }
  function renderDetail(entry: BriefingEntry | null) {
    detail.replaceChildren(); delete detail.dataset.mapItem; if (entry) detail.dataset.eventId = entry.id; else delete detail.dataset.eventId;
    if (!entry) { detail.append(el('p', '사건을 고르면 확인된 내용과 모르는 것을 나눠 보여 줍니다.', 'gf-empty')); return; }
    const display = briefingPresentation(entry); const severity = severityOf(entry); const fresh = freshnessLabel(entry, update?.anchors[entry.id], now);
    const head = el('div', '', 'gf-detail-head'); const where = el('span', '', 'gf-where'); where.append(dot(severity), el('span', [regionLabel(entry), severity ? SEVERITY_LABEL[severity] : null].filter(Boolean).join(' · ')));
    head.append(where, pill(fresh.text, fresh.tone));
    const times = el('p', '', 'gf-times');
    // A daily value has a reference date, not a first report; a missing check time is said plainly.
    const daily = Boolean(entry.observedAt && /^\d{4}-\d{2}-\d{2}$/.test(entry.observedAt));
    const first = clock(entry.observedAt) ?? dayLabel(entry.observedAt, now); const last = clock(update?.anchors[entry.id]?.fetchedAt);
    times.append(el('span', daily ? '기준일 ' : '첫 보도 '), el('strong', first ?? '기록 없음'), el('span', '  마지막 확인 '), el('strong', last ?? '기록 없음'));
    const top = el('section', '', 'gf-detail-top'); top.append(head, el('h2', display.title, 'gf-detail-title'), times);
    if (display.languageLabel) top.append(el('p', display.languageLabel, 'gf-note'));
    const facts = el('section', '', 'gf-block'); const factsHead = el('div', '', 'gf-block-head');
    factsHead.append(el('h3', '확인된 사실'), el('span', `근거 ${entry.evidenceRefs.length}개`, 'gf-meta'));
    const factList = el('ul', '', 'gf-facts');
    const valueLine = metricValueLine(entry); if (valueLine) { const li = el('li', '', 'gf-value-line'); li.append(dot('fresh'), el('strong', valueLine)); factList.append(li); }
    for (const line of entry.details.mainChanges.length ? entry.details.mainChanges : [display.summary]) { const li = el('li'); li.append(dot('fresh'), el('span', line === entry.summary ? display.summary : line)); factList.append(li); }
    const unknown = el('li', '', 'gf-unknown'); unknown.append(dot('late', true), el('span', entry.details.uncertainty || '시장 영향은 아직 확인되지 않았습니다.')); factList.append(unknown);
    facts.append(factsHead, factList);
    const evidence = el('section', '', 'gf-block'); evidence.append(el('h3', '근거'));
    const chipsRow = el('div', '', 'gf-evidence-chips'); const href = sourceHref(entry.source?.href);
    const sourceChip = href ? el('a', '', 'gf-evidence') : el('span', '', 'gf-evidence');
    if (href && sourceChip instanceof HTMLAnchorElement) { sourceChip.href = href; sourceChip.target = '_blank'; sourceChip.rel = 'noopener noreferrer'; }
    sourceChip.append(el('strong', entry.source?.label ?? '출처 미확인'), el('span', clock(entry.observedAt) ?? (href ? '원문' : '원문 링크 없음')));
    chipsRow.append(sourceChip);
    if (entry.evidenceRefs.length > 1) { const more = el('span', '', 'gf-evidence'); more.append(el('strong', '연결 근거'), el('span', `${entry.evidenceRefs.length - 1}개`)); chipsRow.append(more); }
    evidence.append(chipsRow);
    const context = el('section', '', 'gf-block'); const contextHead = el('div', '', 'gf-block-head');
    contextHead.append(el('h3', '시장 맥락'), el('span', discovery ? `기준 ${clock(discovery.discovery.cutoffAt) ?? '시각 미기록'}` : '시장 자료 읽는 중', 'gf-meta'));
    const rows = el('div', '', 'gf-context');
    const symbols = entry.context?.symbols ?? [];
    for (const symbol of symbols) {
      const market = discovery?.scan.results.find(r => r.instrument.symbol === symbol)?.frozenInputs.quote?.evidence?.market;
      const row = el('div', '', 'gf-context-row'); const value = typeof market?.changePercent === 'number' && Number.isFinite(market.changePercent) ? market.changePercent : null;
      const change = el('strong', value === null ? '시세 미수신' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`); change.dataset.direction = value === null ? '' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
      row.append(el('span', symbol), change); rows.append(row);
    }
    for (const cell of marketCells(discovery, entry).filter(c => c.linked)) {
      const row = el('div', '', 'gf-context-row'); const change = el('strong', cell.change ?? cell.value ?? '미수신'); change.dataset.direction = cell.direction ?? '';
      row.append(el('span', cell.label), change); rows.append(row);
    }
    if (!rows.childElementCount) rows.append(el('p', '이 사건과 연결된 종목이나 지표가 없습니다.', 'gf-empty'));
    context.append(contextHead, rows);
    const foot = el('p', '', 'gf-footnote'); foot.append(icon('info'), el('span', '사실은 출처에 적힌 내용만 옮기고, 모르는 것은 모른다고 적습니다.'));
    const dev = el('details', '', 'gf-dev'); dev.append(el('summary', '개발 정보'));
    const devList = el('dl'); for (const [k, v] of [['사건 ID', entry.id], ['근거 ID', entry.evidenceRefs.join(' · ')], ['상태 코드', `${entry.freshness} · ${entry.availability}`], ['다음 확인', entry.details.nextCheck.label]]) { devList.append(el('dt', k), el('dd', v)); }
    dev.append(devList);
    detail.append(top, facts, evidence, context, foot, dev);
  }
  function renderStrip(entry: BriefingEntry | null) {
    strip.replaceChildren();
    for (const cell of marketCells(discovery, entry)) {
      const box = el('div', '', 'gf-cell'); box.dataset.key = cell.key; box.dataset.linked = String(cell.linked); box.dataset.tone = cell.tone;
      const head = el('div', '', 'gf-cell-head'); head.append(el('span', cell.label)); if (cell.linked) head.append(el('span', '사건 연결', 'gf-linked'));
      const value = el('div', '', 'gf-cell-value'); value.append(el('strong', cell.value ?? '미수신'));
      if (cell.change) { const c = el('span', cell.change, 'gf-change'); c.dataset.direction = cell.direction ?? ''; value.append(c); }
      box.append(head, value, el('small', cell.status)); strip.append(box);
    }
  }
  // Some engine layers have no Korean name yet and fall back to English (one in capitals). This layout shows them in Korean;
  // a row whose label is already something else (a later translation) is left alone.
  const LAYER_LABELS_KO: Record<string, [string, string]> = {
    radiationWatch: ['Radiation Watch', '방사능 관측'], gpsJamming: ['GPS JAMMING', 'GPS 교란'],
    canadaRoads: ['Canada Roads', '캐나다 도로'], canadaAlerts: ['Canada Alerts (AB + BC)', '캐나다 경보(AB·BC)'],
    storageFacilities: ['Storage Facilities', '에너지 저장 시설'], fuelShortages: ['Fuel Shortages', '연료 부족'],
    sanctions: ['Sanctions', '제재'], webcams: ['Live Webcams', '실시간 웹캠'], diseaseOutbreaks: ['Disease Outbreaks', '질병 발생'],
  };
  function localizeEngineLayers() {
    for (const [key, [english, korean]] of Object.entries(LAYER_LABELS_KO)) {
      const label = root.querySelector(`.gb-engine-host .layer-toggle[data-layer="${key}"] .toggle-label`);
      const text = label?.firstChild; if (text?.nodeType === Node.TEXT_NODE && text.textContent?.trim() === english) text.textContent = korean;
    }
    // The explain buttons are named in English ("Explain … layer"); a screen reader hears the row's own name here.
    for (const explain of root.querySelectorAll<HTMLButtonElement>('.gb-engine-host .layer-explain-btn[aria-label^="Explain "]')) {
      const name = explain.closest('.layer-toggle-row')?.querySelector('.toggle-label')?.textContent?.trim();
      if (name) explain.setAttribute('aria-label', `${name} 레이어 설명`);
    }
  }
  function renderLayerPill() {
    localizeEngineLayers();
    // Strategic waterways are drawn in nearly the same blue as briefing events, so the key names both while that layer is on.
    const waterways = Boolean(root.querySelector('.gb-engine-host .layer-toggle[data-layer="waterways"] input:checked'));
    briefingKey.lastElementChild!.textContent = waterways ? '브리핑 사건·전략 수로' : '브리핑 사건';
    // WebGL engine: checkbox rows. SVG fallback: pressed buttons. Both read the engine's own state.
    const checked = [
      ...Array.from(root.querySelectorAll<HTMLInputElement>('.layer-toggles .layer-toggle input:checked')).map(input => input.closest('.layer-toggle')?.querySelector('.toggle-label')?.textContent?.trim()),
      ...Array.from(root.querySelectorAll<HTMLButtonElement>('.layer-toggles button.layer-toggle[aria-pressed=true]')).map(b => b.textContent?.trim()),
    ].filter((t): t is string => Boolean(t));
    layerPill.replaceChildren(icon('layers'), el('span', '레이어', 'gf-layer-word'));
    const shown = checked.length ? checked.slice(0, 3) : ['사건'];
    for (const name of shown) layerPill.append(el('span', name, 'gf-layer-chip'));
    if (checked.length > 3) layerPill.append(el('span', `외 ${checked.length - 3}`, 'gf-layer-more'));
    layerPill.append(el('span', '▾', 'gf-layer-caret'));
    layerPill.setAttribute('aria-label', `레이어 · ${checked.length ? `${checked.length}개 켜짐` : '사건'} · 목록 열기`);
  }
  const onLayerChange = (event: Event) => { if ((event.target as Element | null)?.closest?.('.layer-toggles')) queueMicrotask(renderLayerPill); };
  root.addEventListener('change', onLayerChange); root.addEventListener('click', onLayerChange);
  // The engine arrives after mount (the app shell moves it in) and builds its layer list later, deeper inside.
  // Read its layer state whenever the engine itself or a layer row is added; other map changes are ignored.
  const addsLayerRows = (record: MutationRecord) => record.target === engineHost
    || Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches('.layer-toggles, .layer-toggle') || Boolean(node.querySelector('.layer-toggle'))));
  const engineObserver = typeof MutationObserver === 'function' ? new MutationObserver(records => { if (records.some(addsLayerRows)) renderLayerPill(); }) : null;
  engineObserver?.observe(engineHost, { childList: true, subtree: true });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (root.dataset.layers === 'open') { root.dataset.layers = ''; layerPill.setAttribute('aria-expanded', 'false'); layerPill.focus(); event.stopPropagation(); }
    else if (root.dataset.menu === 'open') { root.dataset.menu = ''; menuButton.setAttribute('aria-expanded', 'false'); menuButton.focus(); event.stopPropagation(); }
    else if (mapItem) { closeMapItem(); event.stopPropagation(); }
  });

  // ---- Source pill ----
  // A source this deployment does not use is listed on its card but never counted as missing.
  function groups(): SourceGroup[] {
    return sourceGroups(sources, discovery, discoveryFailed, update?.model.sections ?? [], update ? { entries: update.model.entries, anchors: update.anchors } : null, now);
  }
  function renderSourcePill() {
    const all = groups().filter(g => g.status !== 'off'); const current = all.filter(groupCurrent).length;
    const bar = el('span', '', 'gf-bars'); bar.setAttribute('aria-hidden', 'true');
    for (const g of all) { const s = el('span'); s.dataset.status = g.status; bar.append(s); }
    sourcePill.replaceChildren(bar, el('span', '출처 ', 'gf-pill-word'), el('strong', `${current}/${all.length}`), el('span', ' 최신', 'gf-pill-word'));
    sourcePill.setAttribute('aria-label', `출처 ${all.length}곳 중 ${current}곳 최신 · 출처 상태 열기`);
  }

  // ---- Signals (M2) ----
  function renderFeed() {
    const all = allEvents(); const index = signalsIndex(all, now);
    feed.replaceChildren();
    const head = el('header', '', 'gf-view-head gf-head-row'); const headText = el('div');
    headText.append(el('p', 'Signals · 사건 목록', 'gf-eyebrow'), el('h1', '오늘 불러온 사건'), el('p', '사건마다 출처와 시각을 따로 적습니다. 원문을 묶은 수는 이 화면 자료에 없어 세지 않습니다.', 'gf-lead'));
    if (update?.scenario) headText.append(el('p', '가상 시나리오 · 실제 계좌·현재 시장 아님', 'gf-scenario'));
    const news = groups().find(g => g.key === 'news');
    head.append(headText);
    if (news && news.status !== 'off') head.append(pill(`세계 뉴스 · ${news.lastUpdate ? `${clock(new Date(news.lastUpdate))} 수신` : GROUP_STATUS_LABEL[news.status]}`, toneOf(news.status)));
    const strip2 = el('div', '', 'gf-index');
    const stat = (label: string, value: string, note: string) => { const s = el('div', '', 'gf-stat'); s.append(el('span', label), el('strong', value), el('small', note)); return s; };
    strip2.append(stat('오늘 불러온 사건', String(index.today), `00:00부터 ${clock(new Date(now))}까지`), stat('전체 불러온 사건', String(index.total), '어제 이전 관측 포함'),
      stat('출처', String(index.sources), `원문 링크 있음 ${index.linked}건`));
    const hours = el('div', '', 'gf-hours'); hours.append(el('span', '시간대별 · 오늘', 'gf-mini-label'));
    // Only the hours that have passed today: an empty future is not a quiet hour.
    const hoursSoFar = index.byHour.slice(0, index.nowHour + 1);
    const bars = el('div', '', 'gf-hour-bars'); const max = Math.max(1, ...hoursSoFar);
    hoursSoFar.forEach((n, h) => { const b = el('span'); b.style.height = `${Math.max(4, n / max * 100)}%`; b.dataset.now = String(h === index.nowHour); b.dataset.empty = String(n === 0); b.title = `${h}시 · ${n}건`; bars.append(b); });
    const two = (h: number) => `${String(h).padStart(2, '0')}시`;
    const axis = el('div', '', 'gf-hour-axis'); axis.append(el('span', two(0)), el('span', two(Math.round(index.nowHour / 2))), el('span', two(index.nowHour)));
    hours.append(bars, axis);
    const cats = el('div', '', 'gf-cats'); const catMax = Math.max(1, ...index.byCategory.map(c => c.count));
    for (const c of index.byCategory) { const row = el('div'); const bar = el('span', '', 'gf-cat-bar'); bar.style.width = `${c.count / catMax * 100}%`; row.append(el('span', c.label), bar, el('strong', String(c.count))); cats.append(row); }
    strip2.append(hours, cats);
    const table = el('div', '', 'gf-table'); table.setAttribute('role', 'list');
    const tableHead = el('div', '', 'gf-table-head'); tableHead.setAttribute('aria-hidden', 'true');
    for (const h of ['시각', '분야', '사건', '출처', '최신성']) tableHead.append(el('span', h));
    if (all.length) table.append(tableHead);
    for (const item of foldMinorQuakes(all, quakesOpen)) {
      if (item.kind === 'quakes') { table.append(quakeFoldRow(item.entries, quakesOpen, 'feed')); continue; }
      const e = item.entry;
      const display = briefingPresentation(e); const fresh = freshnessLabel(e, update?.anchors[e.id], now);
      const row = button('', () => selectEvent(e.id), 'gf-feed-row'); row.setAttribute('role', 'listitem'); row.dataset.eventId = e.id;
      const category = eventCategory(e);
      row.append(el('span', `${dayLabel(e.observedAt, now) === '오늘' ? '' : `${dayLabel(e.observedAt, now) ?? ''} `}${clock(e.observedAt) ?? ''}`.trim() || '시각 없음', 'gf-time'),
        tag(category === '전체' ? '세계' : category, severityOf(e)), el('span', display.title, 'gf-feed-title'), Object.assign(el('span', shortSource(e.source?.label), 'gf-meta'), { title: e.source?.label ?? '' }));
      const f = el('span', fresh.text, 'gf-fresh'); f.dataset.tone = fresh.tone; row.append(f); table.append(row);
    }
    if (!all.length) table.append(el('p', update ? '불러온 사건이 없습니다.' : '세계 사건 자료를 읽고 있습니다.', 'gf-empty'));
    feed.append(head, strip2, table);
  }

  // ---- Research (M3) ----
  function renderResearch() {
    researchBody.replaceChildren();
    const entries = update?.model.entries ?? [];
    const availability = Object.values(discovery?.discovery.quoteAvailability ?? {});
    const lastObserved = Math.max(...(discovery?.scan.results ?? []).map(r => Date.parse(r.frozenInputs.quote?.evidence?.market?.observedAt ?? '')).filter(Number.isFinite), -Infinity);
    const status = !discovery ? (discoveryFailed ? '저장 시장 자료를 읽지 못했습니다' : '시장 자료 읽는 중')
      : availability.some(a => a.status === 'SESSION_OBSERVATION_AVAILABLE') ? '미국 장중 · 지연 시세'
      : availability.length && availability.every(a => a.status === 'MARKET_CLOSED_LAST_KNOWN') ? `미국 장 마감 값${Number.isFinite(lastObserved) ? ` · ${clock(new Date(lastObserved))}` : ''}` : '시세 관측이 오래됐습니다';
    const head = el('header', '', 'gf-view-head gf-head-row'); const headText = el('div');
    headText.append(el('p', `Research · 오늘의 브리핑 · ${clock(new Date(now))}`, 'gf-eyebrow'), el('h1', '분석과 근거'), el('p', '지수만 보지 않고, 시장 폭과 상품 자체의 추세까지 확인한 뒤 규칙으로 판정합니다.', 'gf-lead'));
    head.append(headText, pill(status, discovery ? (status.startsWith('미국 장 마감') ? 'closed' : status.startsWith('미국 장중') ? 'fresh' : 'late') : 'muted'));
    const summary = el('div', '', 'gf-summary');
    for (const cell of researchSummary(entries, discovery)) {
      const box = el('div', '', 'gf-stat gf-summary-cell'); box.dataset.missing = String(cell.value === null);
      const value = el('div', '', 'gf-cell-value'); value.append(el('strong', cell.value ?? '미수신'));
      if (cell.change) { const c = el('span', cell.change, 'gf-change'); c.dataset.direction = cell.direction ?? ''; value.append(c); }
      box.append(el('span', cell.label), value);
      if (cell.bar !== null) { const bar = el('span', '', 'gf-meter'); const fill = el('span'); fill.style.width = `${cell.bar}%`; bar.append(fill); box.append(bar); }
      box.append(el('small', cell.note)); summary.append(box);
    }
    const grid = el('div', '', 'gf-research-grid');
    const results = discovery?.discovery.results ?? [];
    if (!researchSymbol || !results.some(r => r.symbol === researchSymbol)) researchSymbol = results[0]?.symbol ?? null;
    const result = results.find(r => r.symbol === researchSymbol);
    const scan = discovery?.scan.results.find(r => r.instrument.symbol === researchSymbol);
    const card = el('article', '', 'gf-card gf-verdict-card');
    if (!discovery || !result || !scan) {
      card.append(el('h2', '규칙 판정'), el('p', !discovery ? (discoveryFailed ? '저장 시장 자료를 읽지 못해 판정을 보여 줄 수 없습니다.' : '저장 시장 자료를 읽고 있습니다.') : '판정할 종목 자료가 없습니다.', 'gf-empty'));
    } else {
      const hist = discovery.histories?.[result.symbol];
      const market = scan.frozenInputs.quote?.evidence?.market;
      const reasons = result.blockers.slice(0, 3).map(code => {
        const text = blockerText(code);
        const source = code === 'quote:CANONICAL_QUOTE_STALE' && market ? `관측 ${dayLabel(market.observedAt, now) ?? ''} ${clock(market.observedAt) ?? ''} · 기준 관측 후 30분`.replace(/\s+/g, ' ')
          : code === 'TECHNICAL_STATE:HARD_ADVERSE' && typeof hist?.last === 'number' ? `종가 ${hist.last} · 20일 평균 ${typeof hist.ma20 === 'number' ? hist.ma20.toFixed(2) : '미확인'}`
          : code === 'CURRENT_PRICE_NOT_CONFIRMING_TREND' && typeof market?.changePercent === 'number' ? `당일 변화율 ${market.changePercent > 0 ? '+' : ''}${market.changePercent.toFixed(2)}%`
          : code === 'TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE' ? '일봉 이력 확인 필요' : '';
        return { text, source };
      });
      if (!reasons.length) for (const f of result.factors.filter(f => f.state !== 'UNKNOWN').slice(0, 3)) reasons.push({ text: `${FACTOR_LABELS[f.group] ?? f.group} · ${FACTOR_STATE_LABELS[f.state] ?? f.state}`, source: '' });
      const word = result.marketCandidate === 'CANDIDATE_FOR_REVIEW' ? '검토 후보' : candidateLabel(result).startsWith('평가 보류') ? '판정 보류' : '조건 미충족';
      const tail = candidateLabel(result).split(' · ')[1] ?? '';
      const cardHead = el('div', '', 'gf-card-head'); cardHead.append(el('h2', result.symbol, 'gf-serif'), pill('규칙 판정', 'late', 'gf-rule'));
      card.append(cardHead, el('p', `판정 규칙 ${discovery.discovery.ruleVersion.split('/').pop()} · 근거 ${reasons.length}개 · 기준 ${clock(discovery.discovery.cutoffAt) ?? '시각 미기록'}`, 'gf-meta'));
      const body = el('div', '', 'gf-verdict-body'); const verdict = el('div', '', 'gf-verdict'); verdict.dataset.word = word;
      verdict.append(el('small', '오늘의 판정'), el('strong', word), el('small', tail || ' '));
      const ol = el('ol', '', 'gf-reasons'); reasons.forEach(r => { const li = el('li'); li.append(el('span', r.text)); if (r.source) li.append(el('small', r.source)); ol.append(li); });
      body.append(verdict, ol);
      const symbolChips = el('div', '', 'gf-symbols'); symbolChips.setAttribute('role', 'group'); symbolChips.setAttribute('aria-label', '종목');
      for (const r of results) { const b = button(r.symbol, () => { researchSymbol = r.symbol; renderResearch(); researchBody.querySelector<HTMLButtonElement>(`.gf-symbols button[data-symbol="${CSS.escape(r.symbol)}"]`)?.focus(); }, 'gf-chip'); b.dataset.symbol = r.symbol; b.setAttribute('aria-pressed', String(r.symbol === researchSymbol)); symbolChips.append(b); }
      const levels = el('figure', '', 'gf-levels');
      if (hist && hist.state === 'AVAILABLE' && [hist.last, hist.ma5, hist.ma20].every(n => typeof n === 'number' && Number.isFinite(n))) {
        const values = [['종가', hist.last!], ['5일 평균', hist.ma5!], ['20일 평균', hist.ma20!]] as const;
        const lo = Math.min(...values.map(v => v[1])), hi = Math.max(...values.map(v => v[1])), span = hi - lo || 1;
        const track = el('div', '', 'gf-level-track');
        for (const [label, v] of values) { const m = el('span', '', 'gf-level'); m.style.left = `${(v - lo) / span * 100}%`; m.dataset.label = label; m.append(el('b', label), el('i', String(Number(v.toFixed(2))))); track.append(m); }
        levels.append(track, el('figcaption', `일봉 ${hist.count}세션 · 마지막 ${dayLabel(hist.observationDate, now) ?? '날짜 미확인'} · 5세션 변화 ${typeof hist.return5 === 'number' ? `${hist.return5 > 0 ? '+' : ''}${hist.return5.toFixed(1)}%` : '미확인'} · 60일 계열은 이 화면 자료에 없어 저장 요약값만 표시합니다`));
      } else levels.append(el('figcaption', '일봉 이력이 없거나 오래돼 추세를 그리지 않습니다.'));
      const foot = el('p', '', 'gf-footnote'); foot.append(icon('info'), el('span', '판정은 규칙이 내립니다. 화면의 문장은 규칙 결과를 옮긴 것이며 매수·매도 제안이 아닙니다.'));
      card.append(body, symbolChips, levels, foot);
    }
    const side = el('div', '', 'gf-research-side');
    const other = el('article', '', 'gf-card'); other.append(el('h2', '다른 해석의 근거'));
    const breadth = breadthOf(entries);
    if (breadth) {
      const p = breadth.windows['50d'].percentage;
      other.append(el('p', `미국 보통주${breadth.commonStocks ? ` ${breadth.commonStocks}종목` : ''} 중 50일선 위 종목이 ${Math.round(p)}%입니다. 개별 상품의 판정과 시장 전체의 폭은 따로 봅니다.`));
      const split = el('div', '', 'gf-split'); const up = el('span', '', 'gf-split-up'); up.style.width = `${p}%`; split.append(up, el('span', '', 'gf-split-down'));
      const labels = el('div', '', 'gf-split-labels'); labels.append(el('span', `50일선 위 ${Math.round(p)}%`), el('span', `아래 ${Math.round(100 - p)}%`));
      other.append(split, labels);
    } else other.append(el('p', '시장 폭 자료가 없어 다른 해석을 판단하지 않습니다.', 'gf-empty'));
    const nextCard = el('article', '', 'gf-card'); nextCard.append(el('h2', '다음에 확인할 신호'));
    const checks = el('ul', '', 'gf-checks');
    const NEXT: Record<string, [string, string]> = {
      'quote:CANONICAL_QUOTE_STALE': ['가격 관측이 30분 기준 안으로 들어오는지', '다음 미국 정규장 중'],
      'TECHNICAL_STATE:HARD_ADVERSE': ['종가가 20일 평균을 다시 넘는지', '다음 일봉 반영 후'],
      CURRENT_PRICE_NOT_CONFIRMING_TREND: ['당일 변화가 추세 방향과 같아지는지', '다음 시세 관측'],
      NO_VERIFIED_SUPPORTIVE_EVIDENCE: ['상품 자체의 지지 근거가 생기는지', '다음 판정'],
      TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE: ['일봉 이력이 최근 세션까지 채워지는지', '다음 일봉 수집'],
    };
    for (const code of result?.blockers ?? []) { const n = NEXT[code]; if (!n) continue; const li = el('li'); li.append(el('strong', n[0]), el('small', n[1])); checks.append(li); }
    if (!checks.childElementCount) checks.append(el('li', result ? '이 종목에서 추가로 확인할 신호가 없습니다.' : '판정 자료가 생기면 다음 확인 신호를 적습니다.', 'gf-empty'));
    nextCard.append(checks); side.append(other, nextCard);
    grid.append(card, side);
    researchBody.append(head, summary, grid, renderLearning(results.map(r => r.symbol)));
  }

  // ---- Past cases and learning status (inside Research) ----
  function renderLearning(symbols: readonly string[]): HTMLElement {
    const view = learningView(learning, researchSymbol, symbols, now);
    const box = el('section', '', 'gf-learning'); box.setAttribute('aria-label', '과거 사례와 학습 현황'); box.dataset.state = view.state;
    const boxHead = el('div', '', 'gf-card-head'); boxHead.append(el('h2', '과거 사례와 학습 현황'));
    if (view.run) boxHead.append(pill(view.run.text, view.run.tone));
    box.append(boxHead, el('p', '분석을 몇 번 요청했는지가 아니라, 기록해 둔 사건과 그 뒤 실제 가격 결과를 센 값입니다.', 'gf-lead'));
    if (view.state !== 'ready') { box.append(el('p', view.message, 'gf-empty')); return box; }
    const cells = el('div', '', 'gf-summary gf-learning-cells');
    for (const cell of view.cells) {
      const stat = el('div', '', 'gf-stat gf-summary-cell'); stat.dataset.missing = String(cell.value === null);
      const value = el('div', '', 'gf-cell-value'); value.append(el('strong', cell.value ?? '미확인'));
      stat.append(el('span', cell.label), value, el('small', cell.note)); cells.append(stat);
    }
    const lower = el('div', '', 'gf-learning-grid');
    const cases = el('article', '', 'gf-card');
    if (view.symbol) {
      cases.append(el('h3', `${view.symbol.symbol} · 과거 사례`), el('p', view.symbol.caseLine), el('p', view.symbol.similarLine, 'gf-meta'));
      if (view.symbol.similar.length) {
        const list = el('ul', '', 'gf-similar');
        for (const item of view.symbol.similar) { const li = el('li'); li.append(el('strong', item.when), el('span', item.what), el('small', item.shared), el('em', item.outcome)); list.append(li); }
        cases.append(list);
      }
      cases.append(el('p', view.symbol.calibration, 'gf-meta'));
      const note = el('p', '', 'gf-footnote'); note.append(icon('info'), el('span', '유사 사례와 확신도 보정은 보유 종목 상세 분석의 근거로 전달됩니다. 위의 규칙 판정에는 쓰이지 않습니다.'));
      cases.append(note);
    } else cases.append(el('h3', '종목별 과거 사례'), el('p', '판정할 종목 자료가 생기면 그 종목의 사례를 보여 줍니다.', 'gf-empty'));
    const open = el('article', '', 'gf-card'); open.append(el('h3', '아직 확인되지 않은 것'));
    const openList = el('ul', '', 'gf-unknowns');
    for (const text of view.unknowns) openList.append(el('li', text));
    if (!view.unknowns.length) openList.append(el('li', '지금 남아 있는 미확인 항목이 없습니다.', 'gf-empty'));
    open.append(openList);
    lower.append(cases, open); box.append(cells, lower);
    return box;
  }

  // ---- Portfolio (M4) ----
  function renderPortfolio() {
    portfolioBody.replaceChildren();
    const entries = allEvents();
    const rows = holdings ? holdingRows(holdings, entries, discovery) : [];
    const linked = rows.filter(r => r.events.length).length;
    const head = el('header', '', 'gf-view-head'); head.append(el('p', 'Portfolio', 'gf-eyebrow'), el('h1', '오늘 사건이 닿는 보유 종목'),
      el('p', holdings ? `보유 ${rows.length}종목 중 ${linked}종목이 오늘 사건과 연결됩니다. 매수·매도는 제안하지 않습니다.` : holdingsFailed ? '보유 정보를 읽지 못했습니다. 연결 상태를 확인해 주세요.' : '보유 정보를 읽고 있습니다.', 'gf-lead'));
    const grid = el('div', '', 'gf-portfolio-grid');
    const donut = el('figure', '', 'gf-donut');
    const svg = svgNode('svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('aria-hidden', 'true');
    const ring = (cls: string, fraction: number) => { const c = svgNode('circle'); c.setAttribute('cx', '60'); c.setAttribute('cy', '60'); c.setAttribute('r', '48'); c.setAttribute('class', cls); c.setAttribute('pathLength', '100'); c.setAttribute('stroke-dasharray', `${fraction * 100} 100`); return c; };
    svg.append(ring('gf-ring-base', 1), ring('gf-ring-linked', rows.length ? linked / rows.length : 0));
    const center = el('div', '', 'gf-donut-center'); center.append(el('strong', holdings ? `${linked}/${rows.length}` : '—'), el('span', '사건 연결'));
    const legendBox = el('figcaption'); const a = el('span'); a.append(dot('watch'), el('span', `연결 ${linked}`)); const b = el('span'); b.append(dot(null), el('span', `연결 없음 ${rows.length - linked}`)); legendBox.append(a, b);
    const sizes = el('ul', '', 'gf-size-list'); sizes.setAttribute('aria-label', '보유 비중 구간');
    for (const r of rows) { const li = el('li'); const name = el('span'); name.append(dot(r.events.length ? 'watch' : null), el('span', r.symbol)); li.append(name, el('strong', r.size)); sizes.append(li); }
    // A ring needs a few parts to mean anything; with one or two holdings the count alone is clearer.
    const ringful = rows.length >= 3; donut.dataset.ring = String(ringful);
    donut.append(...(ringful ? [svg] : []), center, legendBox);
    if (rows.length) donut.append(sizes);
    const table = el('div', '', 'gf-table gf-holdings'); table.setAttribute('role', 'table');
    const header = el('div', '', 'gf-holding gf-holding-head'); header.setAttribute('role', 'row');
    // The change is the last observed one; a stale value says so on its own row, so the column is not called today's.
    for (const h of ['종목', '비중', '최근 등락', '연결된 사건', '다음 확인']) { const c = el('span', h); c.setAttribute('role', 'columnheader'); header.append(c); }
    table.append(header);
    for (const r of rows) {
      const row = el('div', '', 'gf-holding'); row.setAttribute('role', 'row'); row.dataset.linked = String(r.events.length > 0);
      const name = el('span'); name.append(el('strong', r.symbol), el('small', r.kind));
      const change = el('span'); const c = el('strong', r.change ?? '미수신', 'gf-change'); c.dataset.direction = r.direction ?? ''; change.append(c, el('small', r.changeNote));
      const linkedCell = el('span', '', 'gf-holding-events');
      for (const e of r.events.slice(0, 2)) { const chip = button('', () => selectEvent(e.id), 'gf-event-chip'); chip.append(dot(severityOf(e)), el('span', briefingPresentation(e).title)); chip.title = briefingPresentation(e).title; linkedCell.append(chip); }
      if (!r.events.length) linkedCell.append(el('span', '연결 없음', 'gf-meta'));
      const nextCheck = el('span', r.events[0]?.details.nextCheck.label ?? '—', 'gf-meta');
      for (const cell of [name, el('span', r.size), change, linkedCell, nextCheck]) { cell.setAttribute('role', 'cell'); row.append(cell); }
      table.append(row);
    }
    if (holdings && !rows.length) table.append(el('p', '보유 중인 종목이 없습니다.', 'gf-empty'));
    if (!holdings) table.append(el('p', holdingsFailed ? '보유 정보를 읽지 못했습니다.' : '보유 정보를 읽고 있습니다.', 'gf-empty'));
    grid.append(donut, table);
    portfolioBody.append(head, grid);
  }

  // ---- Sources (M6) ----
  function renderSources() {
    const listed = groups(); const all = listed.filter(g => g.status !== 'off'); const current = all.filter(groupCurrent).length;
    sourcesView.replaceChildren();
    const head = el('header', '', 'gf-view-head'); head.append(el('p', `출처 상태 · ${clock(new Date(now))}`, 'gf-eyebrow'), el('h1', '출처 상태'), el('p', '출처마다 따로 갱신 상태를 적습니다. 한 분야가 최신이라고 화면 전체가 최신인 것은 아닙니다.', 'gf-lead'));
    const rank = (key: string) => key === 'news' ? 0 : key === 'quotes' ? 1 : 2;
    listed.sort((a, b) => rank(a.key) - rank(b.key));
    const grid = el('div', '', 'gf-source-grid');
    for (const g of listed) {
      const card = el('article', '', `gf-card gf-source-card${g.key === 'news' ? ' gf-source-hero' : ''}`); card.dataset.status = g.status; card.dataset.group = g.key;
      const cardHead = el('div', '', 'gf-card-head');
      cardHead.append(el('h2', g.label), pill(GROUP_STATUS_LABEL[g.status], toneOf(g.status))); card.append(cardHead);
      if (g.key === 'news') {
        const big = el('div', '', 'gf-big-time'); big.append(el('strong', g.lastUpdate ? clock(new Date(g.lastUpdate))! : '—', 'gf-serif'), el('span', 'KST'));
        const chip = el('p', '', 'gf-hint'); chip.append(icon('info'), el('span', '자료를 마지막으로 받은 시각 · 사건 발생 시각 아님'));
        const elapsed = g.lastUpdate ? Math.floor((now - g.lastUpdate) / 60_000) : null;
        const explain = el('div', '', 'gf-explain');
        explain.append(el('p', g.status === 'late' && g.lastUpdate ? `새 자료를 받지 못해 ${clock(new Date(g.lastUpdate))}의 목록을 그대로 보여 줍니다. 지도와 Signals의 사건은 그 시각까지의 자료로 만든 것입니다.` : g.note));
        if (g.maxStaleMin && elapsed !== null) explain.append(el('p', `평소 갱신 기준 ${g.maxStaleMin}분 · 지금 ${elapsed}분 지남`, 'gf-meta'));
        const left = el('div'); left.append(big, chip); card.append(left, explain);
      } else card.append(el('p', g.note, 'gf-note'));
      if (g.key === 'threat' && (g.status === 'none' || g.status === 'down')) card.append(el('div', '값이 들어오면 추이가 여기에 그려집니다', 'gf-placeholder'));
      if (g.members.length) {
        const members = el('ul', '', 'gf-members');
        // A source the server collects for the briefing has no record here; a check that brought nothing says so.
        const memberLine = (m: SourceGroup['members'][number]) => !m.lastUpdate ? (g.via === 'briefing' ? '서버 수집 · 브리핑 경유' : '수신 기록 없음')
          : m.itemCount ? `${clock(new Date(m.lastUpdate))} 수신 · ${m.itemCount}건` : `${clock(new Date(m.lastUpdate))} 확인 · 항목 없음`;
        for (const m of g.members) { const li = el('li'); li.dataset.status = m.status; li.append(el('span', m.label), el('small', memberLine(m))); members.append(li); }
        card.append(members);
      } else if (g.lastUpdate) card.append(el('p', `${g.key === 'sec' ? '가장 최근 공시' : '마지막 자료'} ${dayLabel(new Date(g.lastUpdate).toISOString(), now) ?? ''} ${clock(new Date(g.lastUpdate))}`.replace(/\s+/g, ' '), 'gf-meta'));
      grid.append(card);
    }
    const foot = el('div', '', 'gf-card gf-source-foot'); const bar = el('span', '', 'gf-bars gf-bars-wide'); bar.setAttribute('aria-hidden', 'true');
    for (const g of all) { const s = el('span'); s.dataset.status = g.status; bar.append(s); }
    foot.append(bar, el('span', `출처 ${all.length}곳 중 ${current}곳 최신 · 화면 전체를 ‘최신’이라고 쓰지 않습니다`));
    grid.append(foot);
    sourcesView.append(head, grid);
  }

  // ---- Search index for the app search ----
  function publishSearchIndex() {
    options.onSearchIndex?.(visibleEvents(update, '전체').map((e): BriefingSearchItem => ({ id: e.id, title: briefingPresentation(e).title,
      subtitle: `불러온 사건 · ${regionLabel(e)}`, searchText: briefingSearchText(e), activate: () => selectEvent(e.id) })));
  }
  const viewport = root.closest<HTMLElement>('.main-content');
  const viewObserver = viewport && typeof ResizeObserver === 'function' ? new ResizeObserver(() => root.style.setProperty('--gf-view', `${viewport.clientHeight}px`)) : null;
  if (viewport) { root.style.setProperty('--gf-view', `${viewport.clientHeight}px`); viewObserver?.observe(viewport); }
  const tick = setInterval(() => { now = Date.now(); stamp.textContent = screenClock(now); }, 30_000);
  function renderAll() { now = Date.now(); stamp.textContent = screenClock(now); renderAtlas(); renderSourcePill(); if (section === 'Signals') renderFeed(); if (section === 'Research') renderResearch(); if (section === 'Portfolio') renderPortfolio(); if (section === 'Sources') renderSources(); }
  navigate('Atlas'); renderAll();
  return {
    discoveryHost, investmentHost,
    update(value: BriefingUpdate) { update = value; renderAll(); focusMap(true); publishSearchIndex(); options.onMapUpdate?.(value); },
    updateDiscovery(value: OwnerDiscoveryRead | null) { discovery = value; discoveryFailed = value === null; renderAll(); },
    updateSources(value: readonly SourceState[]) { sources = value; renderSourcePill(); if (section === 'Sources') renderSources(); },
    updateLearning(value: LearningRead | null) { learning = value; if (section === 'Research') renderResearch(); },
    updateHoldings(value: readonly OwnerUniverseEntry[] | null) { holdings = value; holdingsFailed = value === null; if (section === 'Portfolio') renderPortfolio(); },
    destroy() {
      clearInterval(tick); viewObserver?.disconnect(); engineObserver?.disconnect(); options.onSearchIndex?.([]); options.onMapSelect?.(null);
      root.ownerDocument.removeEventListener('keydown', onKey); root.ownerDocument.removeEventListener('mymonitor:briefing-map-select', mapSelection);
      root.ownerDocument.removeEventListener('mymonitor:briefing-map-evidence', mapSelection); root.ownerDocument.removeEventListener('mymonitor:briefing-tools', showTools);
      root.ownerDocument.removeEventListener('mymonitor:map-item-select', mapItemSelection);
      window.removeEventListener('mymonitor:map-enter', showMap); root.remove();
    },
  };
}
