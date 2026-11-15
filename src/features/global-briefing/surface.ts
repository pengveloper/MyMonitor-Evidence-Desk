import type { OwnerDiscoveryRead } from '../../../shared/owner-discovery-read-contract';
import type { BriefingEntry } from '../product-recovery/situation-synthesis-model';
import { FILTERS, briefingTime, eventCategory, eventCoordinates, sourceHref, visibleEvents, type BriefingFilter, type BriefingUpdate } from './model';
import { mapPoint, worldMap } from './world-map';
import { briefingPresentation, briefingSearchText, type BriefingSearchItem } from './presentation';
import { candidateLabel, candidateSummary } from '../owner-discovery/result-labels';
import './surface.css';
import { createEvidenceReader } from './evidence-desk';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function button(label: string, action: () => void, className = ''): HTMLButtonElement {
  const node = el('button', label, className); node.type = 'button'; node.onclick = action; return node;
}
function heading(english: string, korean: string): HTMLElement {
  const h = el('div', '', 'gb-section-title'); h.append(el('h2', english), el('span', korean)); return h;
}
function detail(label: string, value: string): HTMLElement {
  const row = el('div', '', 'gb-detail'); row.append(el('dt', label), el('dd', value)); return row;
}
function readableState(state: string): string {
  return ({ FRESH: '최근 관측', STALE: '오래된 관측', UNKNOWN: '최신 여부 정보 없음', AVAILABLE: '근거 있음', UNAVAILABLE: '근거 사용 불가', UPDATING: '갱신 중', DELAYED: '수신 지연', NO_DATA: '자료 없음', PARTIAL: '일부 근거', MISSING: '자료 미수신' } as Record<string, string>)[state] ?? '상태 미확인';
}
export interface BriefingOptions {
  evidenceDesk?: boolean;
  onSearch?: () => void;
  onSearchIndex?: (items: BriefingSearchItem[]) => void;
  onMapUpdate?: (update: BriefingUpdate) => void;
  onMapFocus?: (latitude: number, longitude: number) => void;
  onMapResize?: () => void;
}

/** A presentation of already-read canonical state. This module performs no IO. */
export function mountGlobalBriefing(host: HTMLElement, options: BriefingOptions = {}) {
  let update: BriefingUpdate | null = null, selected: string | null = null, filter: BriefingFilter = '전체';
  let discovery: OwnerDiscoveryRead | null = null;
  let discoveryFailed = false;
  const root = el('section', '', 'global-briefing'); root.setAttribute('aria-label', '세계 상황실');
  const top = el('header', '', 'gb-top');
  const brand = el('div', '', 'gb-brand'); brand.append(el('span', '◎', 'gb-mark'), el('strong', 'MyMonitor'), el('span', 'GLOBAL INTELLIGENCE · PERSONAL CLARITY', 'gb-strap'));
  const stamp = el('span', '저장 근거 확인 중', 'gb-stamp');
  const searchButton = button('사건 검색  ⌘ / Ctrl K', () => options.onSearch ? options.onSearch() : openSearch(), 'gb-search-button');
  const toolsButton = button('전체 기능 · 설정', () => navigate('Tools'), 'gb-tools-button');
  toolsButton.hidden = true; // Only the actual app shell can supply these tools.
  top.append(brand, stamp, searchButton, toolsButton);
  const sidebar = el('aside', '', 'gb-sidebar'); sidebar.append(el('p', 'YOUR PRIVATE\nWORLD OBSERVATORY', 'gb-eyebrow'));
  const nav = el('nav', '', 'gb-nav'); nav.setAttribute('aria-label', '상황실 탐색');
  const navLabels = [['Atlas', '◎', '세계 상황실'], ['Signals', '≋', '사건 타임라인'], ['Research', '⌕', '종목 리서치'], ['Portfolio', '◇', '보유·포지션']] as const;
  const navButtons: HTMLButtonElement[] = [];
  for (const [name, icon, label] of navLabels) {
    const b = button('', () => navigate(name)); b.dataset.section = name;
    b.append(el('span', icon, 'gb-nav-icon'), el('span', name), el('small', label)); nav.append(b); navButtons.push(b);
  }
  const coverage = el('div', '', 'gb-coverage'); coverage.append(el('p', 'OBSERVE · VERIFY · UNDERSTAND', 'gb-eyebrow'), el('p', '세계를 먼저 읽고,\n시장의 맥락을 확인하세요.'), el('small', '관측 사실과 시장 영향은\n별도의 근거로 판단합니다.'));
  const earth = el('div', '', 'gb-earth'); earth.setAttribute('aria-hidden', 'true');
  sidebar.append(nav, coverage, earth);
  const main = el('div', '', 'gb-main');
  const title = el('div', '', 'gb-title'); const titleText = el('div');
  titleText.append(el('p', 'THE WORLD, IN PERSPECTIVE', 'gb-eyebrow'), el('h1', 'Global Briefing'), el('p', '세계 상황실 · 사건을 읽고, 근거를 따라, 시장을 이해합니다.', 'gb-subtitle'));
  const filters = el('nav', '', 'gb-filters'); filters.setAttribute('aria-label', '사건 분야');
  const filterButtons = FILTERS.map(label => { const b = button(label, () => { filter = label; renderEvents(); }); filters.append(b); return b; });
  title.append(titleText, filters);
  const scenario = el('p', '', 'gb-scenario'); scenario.hidden = true;
  const atlas = el('div', '', 'gb-atlas');
  const hero = el('section', '', 'gb-hero gb-card'); hero.setAttribute('aria-label', '지도와 선택 사건');
  const mapArea = el('div', '', 'gb-map-area'); const map = el('div', '', 'gb-map'); map.append(worldMap());
  const pins = el('div', '', 'gb-pins'); map.append(pins);
  mapArea.append(el('p', 'GLOBAL SIGNALS', 'gb-map-caption'), map, el('p', '확인된 좌표만 표시 · 항로·영향 범위 추정 없음', 'gb-map-note'));
  const engineHost = el('div', '', 'gb-engine-host'); mapArea.prepend(engineHost);
  const summary = el('article', '', 'gb-selected'); summary.setAttribute('aria-live', 'polite');
  hero.append(mapArea, summary);
  const timeline = el('section', '', 'gb-timeline gb-card'); timeline.id = 'briefingTimeline';
  const timelineHead = heading('Signals Timeline', '관측된 변화'); const count = el('span', '', 'gb-count'); timelineHead.append(count);
  const eventList = el('div', '', 'gb-event-list'); timeline.append(timelineHead, eventList);
  const rail = el('aside', '', 'gb-rail');
  const market = el('section', '', 'gb-card gb-market'); market.append(heading('Market Context', '사건과 구분된 시장 근거'));
  const marketRows = el('div'); market.append(marketRows);
  const research = el('section', '', 'gb-card gb-research'); research.append(heading('Owner Research', '같은 스냅샷의 종목'));
  const researchRows = el('div'); research.append(researchRows, button('Today · 종목 비교 열기  →', () => navigate('Research'), 'gb-text-button'));
  const evidence = el('section', '', 'gb-card gb-evidence'); evidence.append(heading('Analysis & Evidence', '관측과 해석을 구분'));
  const evidenceBody = el('div'); evidence.append(evidenceBody);
  const evidenceReader = options.evidenceDesk ? createEvidenceReader({ onReturn: () => { navigate('Atlas'); summary.tabIndex = -1; summary.focus({ preventScroll: true }); }, onSelect: id => selectEvent(id) }) : null;
  if (evidenceReader) evidenceBody.prepend(evidenceReader.element);
  const deskViews = el('nav', '', 'gb-desk-view'); deskViews.hidden = true; deskViews.setAttribute('aria-label', '읽기 공간');
  const setDeskView = (expanded: boolean) => { root.classList.toggle('gb-desk-atlas', expanded); deskViews.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === Number(expanded)))); options.onMapResize?.(); };
  deskViews.append(button('브리핑', () => setDeskView(false)), button('Atlas 탐색', () => setDeskView(true)));
  rail.append(market, research, evidence); atlas.append(hero, timeline, rail);
  const discoveryHost = el('section', '', 'gb-existing gb-discovery'); discoveryHost.hidden = true;
  const investmentHost = el('section', '', 'gb-existing gb-investment'); investmentHost.hidden = true;
  const toolsHost = el('section', '', 'gb-tools-host'); toolsHost.hidden = true; toolsHost.setAttribute('aria-label', '전체 기능과 설정');
  main.append(title, scenario, deskViews, atlas, discoveryHost, investmentHost, toolsHost); root.append(top, sidebar, main); host.append(root);

  // Search only indexes this already-loaded presentation when no app search is supplied.
  const dialog = el('dialog', '', 'gb-search-dialog'); dialog.setAttribute('aria-label', '사건 검색');
  const input = el('input'); input.type = 'search'; input.placeholder = '사건 제목이나 내용을 검색하세요'; input.setAttribute('aria-label', '사건 검색어');
  const results = el('div', '', 'gb-search-results');
  let returnFocus: HTMLElement | null = null;
  const closeSearch = () => { dialog.close(); returnFocus?.focus(); };
  dialog.append(el('h2', '사건 검색'), input, results, button('닫기 · Esc', closeSearch)); root.append(dialog);
  function renderSearch() {
    results.replaceChildren(); const matches = visibleEvents(update, '전체', input.value);
    for (const event of matches) results.append(button(briefingPresentation(event).title, () => { closeSearch(); selectEvent(event.id); }));
    if (!matches.length) results.append(el('p', '검색 결과가 없습니다 · 현재 불러온 자료에 없음 · 검색 범위: 불러온 사건 제목·지역명·요약'));
  }
  function openSearch() { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : searchButton; renderSearch(); dialog.showModal(); input.focus(); }
  input.oninput = renderSearch; dialog.addEventListener('cancel', event => { event.preventDefault(); closeSearch(); });
  // Native search inputs consume the first Escape by clearing text. Close the
  // dialog explicitly so one Escape always returns to the invoking control.
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSearch(); }
  });
  const onKey = (event: KeyboardEvent) => {
    if (!options.onSearch && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  };
  root.ownerDocument.addEventListener('keydown', onKey);
  function navigate(name: string) {
    deskViews.hidden = !root.classList.contains('gb-evidence-desk') || ['Research', 'Portfolio', 'Tools'].includes(name);
    atlas.hidden = name === 'Research' || name === 'Portfolio' || name === 'Tools';
    toolsHost.hidden = name !== 'Tools'; toolsButton.setAttribute('aria-expanded', String(!toolsHost.hidden));
    discoveryHost.hidden = name !== 'Research'; investmentHost.hidden = name !== 'Portfolio'; filters.hidden = atlas.hidden;
    for (const b of navButtons) b.setAttribute('aria-current', b.dataset.section === name ? 'page' : 'false');
    if (name === 'Signals') timeline.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (name === 'Atlas' && root.isConnected) hero.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (name === 'Tools') toolsHost.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (!atlas.hidden) options.onMapResize?.();
  }
  function selectEvent(id: string, fromMap = false) {
    if (!visibleEvents(update, '전체').some(event => event.id === id)) return;
    filter = '전체'; selected = id;
    if (!fromMap) navigate('Atlas');
    renderEvents();
    const coordinates = eventCoordinates(update?.anchors[id]);
    if (coordinates && !fromMap) options.onMapFocus?.(coordinates[1], coordinates[0]);
    if (fromMap) return;
    (Array.from((root.classList.contains('gb-has-engine') ? eventList : pins).querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.eventId === id)
      ?? Array.from(eventList.querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.eventId === id))?.focus({ preventScroll: true });
  }
  const mapSelection = (event: Event) => selectEvent((event as CustomEvent<string>).detail, true);
  const mapEvidence = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    if (!visibleEvents(update, '전체').some(entry => entry.id === id)) return;
    const fullscreen = root.querySelector('#mapSection.live-news-fullscreen #mapFullscreenBtn');
    if (fullscreen instanceof HTMLButtonElement) fullscreen.click();
    selectEvent(id, true); navigate('Atlas'); openEvidence();
  };
  root.ownerDocument.addEventListener('mymonitor:briefing-map-select', mapSelection);
  root.ownerDocument.addEventListener('mymonitor:briefing-map-evidence', mapEvidence);
  const showMap = () => navigate('Atlas');
  const showTools = () => navigate('Tools');
  window.addEventListener('mymonitor:map-enter', showMap);
  root.ownerDocument.addEventListener('mymonitor:briefing-tools', showTools);
  function selectSymbol(symbol: string) {
    if (!discovery?.discovery.results.some(r => r.symbol === symbol)) return;
    navigate('Research');
    const target = Array.from(discoveryHost.querySelectorAll<HTMLButtonElement>('.instrument-list button')).find(b => b.textContent?.startsWith(`${symbol} ·`));
    target?.click();
    Array.from(discoveryHost.querySelectorAll<HTMLButtonElement>('.instrument-list button')).find(b => b.textContent?.startsWith(`${symbol} ·`))?.focus();
  }
  function publishSearchIndex() {
    options.onSearchIndex?.([
      ...visibleEvents(update, '전체').map(event => ({ id: event.id, title: briefingPresentation(event).title,
        subtitle: `불러온 사건 · ${event.context?.region ?? event.source?.label ?? '출처 미확인'}`,
        searchText: briefingSearchText(event), activate: () => selectEvent(event.id) })),
      ...(discovery?.discovery.results ?? []).map(r => ({ id: `owner-research:${r.symbol}`, title: r.symbol,
        subtitle: `현재 불러온 종목 · Research · ${candidateLabel(r)}`, activate: () => selectSymbol(r.symbol) })),
    ]);
  }
  // Selected label has priority; other labels are shown only when their actual
  // rendered boxes fit the map and do not obscure another visible label.
  function layoutLabels() {
    const bounds = map.getBoundingClientRect();
    const occupied: DOMRect[] = [];
    const labels = Array.from(pins.querySelectorAll<HTMLElement>('.gb-pin-label'));
    labels.sort((a, b) => Number(b.parentElement?.getAttribute('aria-pressed') === 'true') - Number(a.parentElement?.getAttribute('aria-pressed') === 'true'));
    for (const label of labels) {
      const active = label.parentElement?.getAttribute('aria-pressed') === 'true';
      label.dataset.visible = 'true';
      const box = label.getBoundingClientRect();
      const collision = occupied.some(r => box.left < r.right + 8 && box.right + 8 > r.left && box.top < r.bottom + 8 && box.bottom + 8 > r.top);
      const outside = box.left < bounds.left || box.right > bounds.right;
      label.dataset.visible = String(active || (!collision && !outside));
      if (label.dataset.visible === 'true') occupied.push(box);
    }
  }
  const labelObserver = new ResizeObserver(layoutLabels); labelObserver.observe(map);
  function openEvidence() { evidence.scrollIntoView({ block: 'start', behavior: 'instant' }); if (root.classList.contains('gb-evidence-desk') && evidenceReader) { evidenceReader.element.tabIndex = -1; evidenceReader.element.focus({ preventScroll: true }); } else { details.open = true; details.querySelector('summary')?.focus(); } }
  const details = el('details'); details.append(el('summary', '근거·관측시각 펼치기')); evidenceBody.append(details);
  function renderEvidence(event?: BriefingEntry) {
    evidenceReader?.update(event, event ? update?.anchors[event.id] : undefined, update?.model.generatedAt, update?.demoDocuments, update?.scenario);
    const wasOpen = details.open; details.replaceChildren(el('summary', '근거·관측시각 펼치기')); details.open = wasOpen;
    evidenceBody.querySelector('.gb-evidence-intro')?.remove();
    const desk = root.classList.contains('gb-evidence-desk');
    details.hidden = desk && !event?.originalTitle && !event?.originalSummary && !event?.context;
    if (desk) details.querySelector('summary')!.textContent = '원본 추가 상세 · 번역·수치 원본';
    if (!event) { details.append(el('p', '선택된 사건이 없습니다.')); return; }
    if (!desk) evidenceBody.prepend(el('p', event.details.uncertainty || '시장 영향은 별도 확인이 필요합니다.', 'gb-evidence-intro'));
    const fields = el('dl'); fields.append(detail('사건 ID', event.id), detail('출처', event.source?.label ?? '미확인'),
      detail('관측·보도 시각', briefingTime(event.observedAt)), detail('수집 시각', briefingTime(update?.anchors[event.id]?.fetchedAt)),
      detail('자료 상태', `${event.freshness} · ${event.availability}`), detail('근거 ID', event.evidenceRefs.join(' · ') || 'MISSING'));
    const href = sourceHref(event.source?.href);
    details.append(fields, el('p', '사건 발생·보도·수집 시각은 같지 않을 수 있습니다. 수집 시각 미확인은 화면 시각으로 대체하지 않습니다.'));
    if (href) { const a = el('a', '원문에서 확인 ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; details.append(a); }
    else details.append(el('p', '원문 링크 미연결'));
    if (event.originalTitle) details.append(el('p', `원문 제목 · ${event.originalTitle}`));
    if (event.originalSummary) details.append(el('p', `원문 요약 · ${event.originalSummary}`));
    if (event.context?.translation) details.append(detail('번역 상태', event.context.translation.status));
    if (event.id.startsWith('world:earthquake:') && event.context?.impact?.magnitude !== undefined) {
      details.append(detail('원본 규모', String(event.context.impact.magnitude)), detail('원본 지역명', event.context.region ?? '미확인'));
    }
    details.append(el('p', event.details.nextCheck.label || '추가 근거 확인'), el('p', event.details.nextCheck.reason));
  }
  function renderEvents() {
    // Only restore a control that this render removes. Search, filters, other
    // app surfaces and a hidden Atlas retain their own focus. Identity is the
    // focused event (which need not be selected) plus its control kind.
    const focusSelectors = ['.gb-pin', '.gb-event', '.gb-selected button:first-of-type', '.gb-selected button:last-of-type', '.gb-evidence summary', '.gb-evidence a'] as const;
    const focused = root.ownerDocument.activeElement;
    const focusKind = !atlas.hidden && focused instanceof HTMLElement && atlas.contains(focused)
      ? focusSelectors.find(selector => focused.matches(selector)) : undefined;
    const focusId = focusKind && focused instanceof HTMLElement ? focused.dataset.eventId ?? selected : null;
    const events = visibleEvents(update, filter); if (!events.some(e => e.id === selected)) selected = events[0]?.id ?? null;
    filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === filter)));
    count.textContent = `${events.length}건`; pins.replaceChildren(); eventList.replaceChildren(); summary.replaceChildren();
    const pick = (id: string) => {
      const pinFocus = document.activeElement?.classList.contains('gb-pin'); selected = id; renderEvents();
      const coordinates = eventCoordinates(update?.anchors[id]);
      if (coordinates) options.onMapFocus?.(coordinates[1], coordinates[0]);
      Array.from((pinFocus ? pins : eventList).querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.eventId === id)?.focus({ preventScroll: true });
    };
    for (const event of events) {
      const display = briefingPresentation(event);
      const active = event.id === selected;
      const coords = eventCoordinates(update?.anchors[event.id]); const point = coords && mapPoint(coords);
      if (point) {
        const pin = button('', () => pick(event.id), 'gb-pin'); pin.setAttribute('aria-label', `지도: ${display.title}`);
        pin.title = display.title; pin.dataset.eventId = event.id; pin.setAttribute('aria-pressed', String(active));
        const label = el('span', display.title.split(/[，,·]/)[0]!.slice(0, 22), 'gb-pin-label');
        label.setAttribute('aria-hidden', 'true'); pin.append(label); pin.dataset.align = point[0] > 320 ? 'left' : 'right';
        pin.style.left = `${point[0] / 640 * 100}%`; pin.style.top = `${point[1] / 330 * 100}%`; pins.append(pin);
      }
      const row = button('', () => pick(event.id), 'gb-event'); row.dataset.eventId = event.id; row.setAttribute('aria-pressed', String(active));
      row.setAttribute('aria-label', `타임라인: ${display.title}`);
      const body = el('div'); body.append(el('small', eventCategory(event) === '전체' ? '세계 사건' : eventCategory(event), 'gb-tag'), el('h3', display.title), el('p', display.summary));
      if (display.languageLabel) body.append(el('small', display.languageLabel, 'gb-state'));
      row.append(el('time', briefingTime(event.observedAt), 'gb-event-time'), body, el('span', readableState(event.freshness), 'gb-state')); eventList.append(row);
      if (active) {
        summary.dataset.eventId = event.id;
        summary.append(el('p', 'SELECTED SIGNAL', 'gb-eyebrow'), el('h2', display.title), el('p', display.summary),
          el('span', `${readableState(event.freshness)} · ${readableState(event.availability)} · ${coords ? '관측 좌표' : '좌표 미확인 · 목록에만 표시'}`, 'gb-state'),
          button('근거 확인  ↗', openEvidence, 'gb-text-button'),
          button('시장 맥락 보기  →', () => { market.scrollIntoView({ block: 'nearest', behavior: 'instant' }); market.tabIndex = -1; market.focus({ preventScroll: true }); }, 'gb-text-button'));
        if (display.languageLabel) summary.append(el('small', display.languageLabel, 'gb-state'));
      }
    }
    if (!events.length) {
      const text = !update ? '세계 사건 자료를 읽고 있습니다.' : '이 분야에서 확인된 사건이 없습니다. 자료 결측은 안전하다는 뜻이 아닙니다.';
      summary.append(el('p', 'WORLD OBSERVATIONS', 'gb-eyebrow'), el('h2', '확인된 근거를 기다립니다'), el('p', text));
      eventList.append(el('p', text, 'gb-empty'));
      delete summary.dataset.eventId;
    }
    renderEvidence(events.find(e => e.id === selected));
    layoutLabels();
    if (focusKind) {
      const controls = (selector: string) => Array.from(atlas.querySelectorAll<HTMLElement>(selector));
      const sameControl = controls(focusKind).find(node => (node.dataset.eventId ?? selected) === focusId);
      const sameEvent = controls('.gb-event').find(node => node.dataset.eventId === focusId);
      const nextControl = controls(focusKind).find(node => (node.dataset.eventId ?? selected) === selected);
      const nextEvent = controls('.gb-event').find(node => node.dataset.eventId === selected);
      // Missing coordinates become list-only; a removed event falls back to
      // the selected surviving event, then the active filter for an empty list.
      (sameControl ?? sameEvent ?? nextControl ?? nextEvent ?? filterButtons.find(b => b.getAttribute('aria-pressed') === 'true'))?.focus({ preventScroll: true });
    }
  }
  function renderMarket() {
    marketRows.replaceChildren(); researchRows.replaceChildren();
    if (!discovery) {
      delete market.dataset.snapshot; delete research.dataset.snapshot;
      market.dataset.state = discoveryFailed ? 'FAILED' : 'LOADING';
      const state = discoveryFailed ? '저장 자료 읽기 실패 · Research에서 다시 읽을 수 있습니다.' : '저장 시장 근거를 읽고 있습니다.';
      marketRows.append(el('p', state, 'gb-empty')); researchRows.append(el('p', state, 'gb-empty')); return;
    }
    const scan = discovery.scan; market.dataset.snapshot = scan.fingerprint; research.dataset.snapshot = scan.fingerprint;
    delete market.dataset.state;
    const items = scan.marketContext.groups.flatMap(g => g.items);
    for (const label of ['SOX', 'VIX', 'DXY', 'DGS10']) {
      const item = items.find(i => i.label === label); const row = el('div', '', 'gb-market-row');
      const value = item && Number.isFinite(item.value) ? `${item.value} ${item.unit}` : '시세 미수신';
      row.append(el('strong', label), el('span', value), el('small', item ? readableState(item.freshness) : '저장된 관측값 없음'));
      const d = el('details'); d.append(el('summary', '시점·출처'));
      if (item) d.append(el('p', `${item.source} · 관측 ${briefingTime(item.observedAt)} · 수집 ${briefingTime(item.fetchedAt)}`), el('p', `${item.freshness} · ${item.session}`), el('p', item.canonicalId));
      else d.append(el('p', '원래 상태 코드: MISSING · 관측·수집 시각 미확인'));
      row.append(d);
      marketRows.append(row);
    }
    marketRows.append(el('p', `${discovery.discovery.semiconductor.direct ? '직접 지수 연결 · SOX는 별도 보조 맥락' : 'ICESEMIT 미확보 · SOX는 대용 지표'}\n${discovery.discovery.breadth.total ? '반도체 표본 ≠ 전체 지수' : '반도체 표본 미연결'}`, 'gb-footnote'));
    for (const result of discovery.discovery.results) {
        const row = button('', () => selectSymbol(result.symbol), 'gb-watch-row');
      row.append(el('strong', result.symbol), el('span', result.analysisEligibility === 'ANALYSIS_READY' ? '자료 준비됨' : '근거 부족'), el('small', candidateLabel(result))); researchRows.append(row);
    }
    researchRows.append(el('p', `${candidateSummary(discovery.discovery.results)} · 자동 주문 없음`, 'gb-footnote'));
  }
  renderEvents(); renderMarket(); navButtons[0]?.setAttribute('aria-current', 'page');
  return {
    discoveryHost, investmentHost,
    update(value: BriefingUpdate) { update = value;
      const deskEnabled = options.evidenceDesk === true && value.scenario === true;
      root.classList.toggle('gb-evidence-desk', deskEnabled);
      if (evidenceReader) evidenceReader.element.hidden = !deskEnabled;
      deskViews.hidden = !deskEnabled || atlas.hidden;
      titleText.querySelector('h1')!.textContent = deskEnabled ? 'Evidence Desk' : 'Global Briefing';
      titleText.querySelector('.gb-subtitle')!.textContent = deskEnabled ? '사건을 고르고, 근거를 읽고, 저장한 질문을 이어갑니다.' : '세계 상황실 · 사건을 읽고, 근거를 따라, 시장을 이해합니다.';
      if (deskEnabled) { if (rail.firstElementChild !== evidence) rail.prepend(evidence); }
      else { if (rail.lastElementChild !== evidence) rail.append(evidence); root.classList.remove('gb-desk-atlas'); }
      deskViews.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === Number(root.classList.contains('gb-desk-atlas')))));
 stamp.textContent = value.scenario ? '고정된 예시 자료' : `화면 구성 ${briefingTime(value.model.generatedAt)} · 관측 시각은 근거별 확인`;
      scenario.hidden = !value.scenario; scenario.replaceChildren();
      if(value.scenario)scenario.append(el('strong','가상 시나리오 데모'),el('span','자료 기준: '+briefingTime(value.model.generatedAt)),el('span','오늘의 뉴스가 아닌 고정된 예시 자료입니다.'));
      renderEvents(); publishSearchIndex(); options.onMapUpdate?.(value); },
    updateDiscovery(value: OwnerDiscoveryRead | null) { discovery = value; discoveryFailed = value === null; renderMarket(); publishSearchIndex(); },
    destroy() { options.onSearchIndex?.([]); labelObserver.disconnect(); root.ownerDocument.removeEventListener('keydown', onKey); root.ownerDocument.removeEventListener('mymonitor:briefing-map-select', mapSelection); root.ownerDocument.removeEventListener('mymonitor:briefing-map-evidence', mapEvidence); window.removeEventListener('mymonitor:map-enter', showMap); root.ownerDocument.removeEventListener('mymonitor:briefing-tools', showTools); root.remove(); },
  };
}
