import { renderOwnerHealth } from './owner-critical-health';
import { formatOwnerTime as formatTime, ownerPriceDisplay, appendOwnerFxDetail } from '@/services/owner-display';
import { fetchOwnerContext, fetchOwnerIntelligence, OwnerContextError, OWNER_CONTEXT_CHANGED } from '@/services/owner-context';
import { stockResearchUrl } from './stock-research-route';
import type { OwnerSignalStory, OwnerSignalStoryEvent, OwnerSignalStoryItem, OwnerIntelligenceResponse } from '../../../shared/owner-intelligence-contract';
import type { OwnerUniverseEntry } from '../../../shared/tossinvest-contract';

const add = (host: HTMLElement, tag: string, className: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  host.append(node);
  return node;
};

function badge(host: HTMLElement, text: string, tone: string): void {
  add(host, 'span', `owner-home__badge owner-home__badge--${tone}`, text);
}

function storyLine(story: OwnerSignalStory | null): string {
  if (!story) return '저장된 판단이 없어 근거를 확인하는 중입니다.';
  return story.oneLineReason || story.headline;
}

function sortedEntries(entries: readonly OwnerUniverseEntry[]): OwnerUniverseEntry[] {
  return [...entries].sort((left, right) => Number(right.actualHolding) - Number(left.actualHolding)
    || Number(right.recentlyTraded) - Number(left.recentlyTraded)
    || left.priority - right.priority
    || left.symbol.localeCompare(right.symbol));
}

function renderQuote(host: HTMLElement, story: OwnerSignalStory | null): void {
  const quote = add(host, 'div', 'owner-home__quote');
  const display = story ? ownerPriceDisplay(story) : { text: '가격 미확인', detail: '' };
  add(quote, 'strong', 'owner-home__price', display.text);
  appendOwnerFxDetail(quote, display.detail);
  if (story?.price.changePercent !== null && story?.price.changePercent !== undefined) {
    const value = story.price.changePercent;
    add(quote, 'span', `owner-home__move owner-home__move--${value >= 0 ? 'up' : 'down'}`, `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`);
  }
  add(quote, 'small', 'owner-home__freshness', story
    ? [story.price.session === 'CLOSED' ? '휴장·거래시간 외' : null,
      story.price.freshness === 'STALE' ? '오래된 시세' : story.price.delayed ? '지연 시세' : '관측 시세',
      formatTime(story.price.observedAt)].filter(Boolean).join(' · ')
    : '가격·관측 시각 미확인');
  if (story?.price.timingLabel) {
    const detail = add(quote, 'details', 'owner-home__summary-detail');
    add(detail, 'summary', '', '시세 기준');
    add(detail, 'p', '', story.price.timingLabel);
  }
}

function renderPriorityCard(
  host: HTMLElement,
  entry: OwnerUniverseEntry,
  story: OwnerSignalStory | null,
  rank: number,
): void {
  const row = add(host, 'article', 'owner-home__priority');
  row.dataset.ownerPriority = entry.symbol;
  const head = add(row, 'div', 'owner-home__priority-head');
  add(head, 'span', 'owner-home__rank', String(rank));
  const identity = add(head, 'div', 'owner-home__identity');
  const link = add(identity, 'a', 'owner-home__symbol', entry.symbol) as HTMLAnchorElement;
  link.href = stockResearchUrl(entry.symbol);
  if (story?.profile.name) add(identity, 'span', 'owner-home__name', story.profile.name);
  const badges = add(head, 'div', 'owner-home__badges');
  if (entry.actualHolding) badge(badges, '실제 보유', 'holding');
  if (entry.recentlyTraded) badge(badges, '최근 거래', 'recent');
  if (story?.profile.leverageMultiple) badge(badges, `${story.profile.leverageMultiple}배 ETF`, 'leverage');
  renderQuote(row, story);
  add(row, 'p', 'owner-home__headline', story?.headline ?? `${entry.symbol} 저장된 판단 미확인`);
  add(row, 'p', 'owner-home__signal', storyLine(story));
  if (story) add(row, 'span', 'owner-home__posture', !entry.actualHolding ? '신규 진입 전 조건 확인' : story.posture === 'REVIEW_HOLD' ? '보유 유지 조건 점검' : story.posture === 'REVIEW_REDUCE' ? '보유 축소 조건 점검' : '관망 · 다음 조건 확인');
}

function renderPositionCard(host: HTMLElement, entry: OwnerUniverseEntry, story: OwnerSignalStory | null, summary?: string): void {
  const card = add(host, 'article', 'owner-home__position');
  card.dataset.ownerHolding = entry.symbol;
  const head = add(card, 'div', 'owner-home__position-head');
  const link = add(head, 'a', 'owner-home__symbol', entry.symbol) as HTMLAnchorElement;
  link.href = stockResearchUrl(entry.symbol);
  const badges = add(head, 'div', 'owner-home__badges');
  badge(badges, '실제 보유', 'holding');
  if (entry.recentlyTraded) badge(badges, '최근 거래', 'recent');
  renderQuote(card, story);
  if (summary) {
    const sentences = summary.split(/(?<=[.!?])\s+/);
    // The quote and timestamp are already above; lead with the portfolio meaning.
    const sentence = sentences[1] ?? sentences[0];
    add(card, 'p', 'owner-home__signal', sentence);
    if (sentence !== summary) {
      const more = add(card, 'details', 'owner-home__summary-detail');
      add(more, 'summary', '', '종목 해석 더 보기');
      add(more, 'p', '', summary);
    }
  }
}

function renderImportantEvents(host: HTMLElement, entries: OwnerUniverseEntry[], stories: Map<string, OwnerSignalStory | null>): void {
  const section = add(host, 'section', 'owner-home__section owner-home__priorities');
  const head = add(section, 'header', 'owner-home__section-header');
  add(head, 'h3', 'owner-home__section-title', '지금 중요한 변화');
  add(head, 'span', 'owner-home__section-note', '최대 3개 · 공식 위험 우선');
  const list = add(section, 'div', 'owner-home__priority-list');
  const grouped = new Map<string, { event: OwnerSignalStoryEvent; symbols: Set<string>; score: number; story: OwnerSignalStory }>();
  for (const entry of entries) {
    const story = stories.get(entry.symbol);
    if (!story) continue;
    for (const event of story.newsEventClusters) {
      // The server already classified these clusters for the owner symbol. Keep
      // unrelated global items out of the personal event list.
      if (!event.impactedOwnerSymbols.includes(entry.symbol) || event.freshness !== 'AVAILABLE') continue;
      const key = event.originalHeadline.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
      const materialOfficial = event.primarySource && event.kind === 'SEC' && event.freshness === 'AVAILABLE'
        && /6-K|20-F|F-1|F-3|424B|dilut|offering|liquidity|희석|유동성|자금|발행/i.test(`${event.form} ${event.tags.join(' ')} ${event.headline}`);
      const score = (materialOfficial ? 100 : 0) + (entry.actualHolding ? 20 : 0) + (event.scope === 'DIRECT' ? 30 : event.scope === 'INDIRECT' ? -20 : 0) + (event.freshness === 'AVAILABLE' ? 5 : 0);
      const existing = grouped.get(key);
      if (existing) {
        existing.symbols.add(entry.symbol);
        if (score > existing.score) { existing.score = score; existing.event = event; existing.story = story; }
      }
      else grouped.set(key, { event, symbols: new Set([entry.symbol]), score, story });
    }
  }
  const values = [...grouped.values()].sort((a, b) => b.score - a.score || (b.event.publishedAt ?? '').localeCompare(a.event.publishedAt ?? '')).slice(0, 3);
  for (const [index, value] of values.entries()) {
    const { event } = value;
    const card = add(list, 'article', 'owner-home__priority');
    card.dataset.ownerPriority = [...value.symbols].join(',');
    card.dataset.ownerEvent = event.id;
    const top = add(card, 'div', 'owner-home__priority-head');
    add(top, 'span', 'owner-home__rank', String(index + 1));
    const identity = add(top, 'div', 'owner-home__event-symbols');
    for (const symbol of value.symbols) {
      const link = add(identity, 'a', 'owner-home__symbol', symbol) as HTMLAnchorElement;
      link.href = stockResearchUrl(symbol);
    }
    badge(top, event.kind === 'SEC' ? `공식 공시 ${event.form ?? ''}` : '관련 사건', event.kind === 'SEC' ? 'warning' : 'neutral');
    if (event.scope === 'INDIRECT') badge(top, event.relatedSymbol === 'EWY' ? '간접 · 대용치 EWY' : `간접 관련 · ${event.relatedSymbol ?? '산업'}`, 'neutral');
    add(card, 'h4', 'owner-home__headline', event.headline);
    const pairedDirections = [...value.symbols].flatMap(symbol => {
      const symbolStory = stories.get(symbol);
      const sameEvent = symbolStory?.newsEventClusters.find(candidate => candidate.originalHeadline.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
        === event.originalHeadline.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim());
      const signal = sameEvent && symbolStory?.companyOrEtfSpecific?.find(row =>
        row.id === `underlying-demand-${sameEvent.id}` || row.id === `underlying-sector-${sameEvent.id}`);
      return signal && ['SUPPORTIVE', 'COUNTER'].includes(signal.direction ?? '')
        ? [`${symbol}: ${signal.label} → ${signal.direction === 'SUPPORTIVE' ? '지지' : '반대'}${signal.evidenceType === 'HYPOTHESIS' ? ' 가설' : ''}`] : [];
    });
    const summary = pairedDirections.length > 0 ? pairedDirections.join(' · ') : event.relationshipReason || (event.kind === 'SEC' ? '공식 공시의 조건과 실제 이행 여부를 확인합니다. 발행 가능성만으로 실제 희석을 단정하지 않습니다.' : '종목 관련 사건입니다. 가격에 미칠 방향은 아직 확인되지 않았습니다.');
    add(card, 'p', 'owner-home__signal', summary.startsWith(`${event.headline}.`) ? summary.slice(event.headline.length + 1).trim() : summary);
    add(card, 'small', 'owner-home__event-meta', `${event.translationState === 'TRANSLATED' ? '한국어 제목' : event.translationState === 'TRANSLATION_FAILED' ? '번역 실패 · 원문 유지' : /[가-힣]/.test(event.originalHeadline) ? '한국어 원문' : '번역 미제공 · 원문 유지'} · ${formatTime(event.publishedAt)} · ${event.sourceCount}개 출처의 한 사건`);
  }
  // One shared check per condition, rather than repeating it on every article.
  const conditions = new Map<string, Set<string>>();
  for (const value of values) for (const symbol of value.symbols) {
    const detail = stories.get(symbol)?.changeConditions[0]?.detail;
    if (!detail) continue;
    const symbols = conditions.get(detail) ?? new Set<string>();
    symbols.add(symbol); conditions.set(detail, symbols);
  }
  if (conditions.size) {
    const checks = add(section, 'div', 'owner-home__next-checks');
    add(checks, 'strong', '', '판단을 바꿀 다음 확인');
    for (const [detail, symbols] of conditions) add(checks, 'p', 'owner-home__next', [...symbols].join(' · ') + ': ' + detail);
  }
  if (!values.length) {
    const fallback = entries.filter(entry => entry.symbol !== 'SOXS' || !entries.some(candidate => candidate.symbol === 'SOXL')).slice(0, 3);
    fallback.forEach((entry, index) => renderPriorityCard(list, entry, stories.get(entry.symbol) ?? null, index + 1));
    add(section, 'p', 'owner-home__quiet', '관련 새 사건이 확인되지 않아 저장된 종목 판단을 표시합니다. 수집 상태는 근거 상세에서 확인할 수 있습니다.');
  }
}

function itemKey(item: OwnerSignalStoryItem): string {
  return `${item.label}:${item.detail}`.toLowerCase();
}

function marketItems(stories: readonly (OwnerSignalStory | null)[]): OwnerSignalStoryItem[] {
  // Per-symbol technical rows belong with their symbol. Letting generic "above
  // / below MA20" rows consume this bounded market list hid valid breadth.
  const values = stories.flatMap((story) => story?.macroChannels ?? []);
  const unique = values.filter((value, index, all) => all.findIndex((candidate) => itemKey(candidate) === itemKey(value)) === index);
  const order = (value: OwnerSignalStoryItem): number => {
    const text = `${value.id} ${value.label} ${value.detail}`;
    if (/breadth|확산|참여율/i.test(text)) return /50/.test(value.id + ' ' + value.label) ? 0 : 0.5;
    if (/vix|변동성/i.test(text)) return 1;
    if (/금리|실질|yield|rate/i.test(text)) return 2;
    return 4;
  };
  return unique.sort((left, right) => order(left) - order(right));
}

function renderMarket(host: HTMLElement, stories: readonly (OwnerSignalStory | null)[]): void {
  const section = add(host, 'section', 'owner-home__section owner-home__market');
  const header = add(section, 'header', 'owner-home__section-header');
  add(header, 'h3', 'owner-home__section-title', '시장 환경');
  add(header, 'span', 'owner-home__section-note', '핵심 관측만');
  const chips = add(section, 'div', 'owner-home__market-chips');
  const items = marketItems(stories);
  const categories = new Set<string>();
  const visible = items.filter(value => {
    const text = value.id + ' ' + value.label;
    const category = /breadth|확산|참여율/i.test(text) ? 'breadth' : /금리|DGS10|DFII10/i.test(text) ? 'rates' : value.id;
    if (categories.has(category)) return false;
    categories.add(category); return true;
  }).slice(0, 4);
  for (const value of visible) {
    const missing = value.state !== 'AVAILABLE';
    const breadth = /breadth|확산/i.test(`${value.id} ${value.label}`);
    const text = breadth && missing ? '시장 상승 참여율 미확인'
      : missing ? value.label + ' · 갱신 필요' : value.detail.split(' · ')[0];
    const chip = add(chips, 'span', `owner-home__market-chip owner-home__market-chip--${missing ? 'unknown' : 'known'}`, text);
    chip.title = [value.source, formatTime(value.observedAt), value.state].filter(Boolean).join(' · ');
  }
  if (!items.some((item) => /breadth|확산/i.test(`${item.id} ${item.label}`))) {
    add(chips, 'span', 'owner-home__market-chip owner-home__market-chip--unknown', '시장 상승 참여율 미확인');
  }
  const details = add(section, 'details', 'owner-home__summary-detail');
  add(details, 'summary', '', '시장 관측 기준·출처');
  for (const value of items) add(details, 'p', '', value.detail + ' · ' + (value.source ?? '출처 미확인') + ' · ' + formatTime(value.observedAt));
  if (chips.childElementCount === 1) add(section, 'p', 'owner-home__quiet', '확인 가능한 시장 관측이 제한적입니다. 미확인을 0으로 처리하지 않습니다.');
}

function eventIdentity(event: OwnerSignalStoryEvent): string {
  return `${event.id}:${event.headline}`;
}

function renderWorld(host: HTMLElement, stories: readonly (OwnerSignalStory | null)[]): void {
  const section = add(host, 'section', 'owner-home__section owner-home__world');
  const header = add(section, 'header', 'owner-home__section-header');
  add(header, 'h3', 'owner-home__section-title', '세계');
  add(header, 'span', 'owner-home__section-note', '내 보유 관련 순');
  const events = stories.flatMap((story) => story?.newsEventClusters ?? [])
    .filter(event => event.freshness === 'AVAILABLE')
    .filter((event, index, all) => all.findIndex((candidate) => eventIdentity(candidate) === eventIdentity(event)) === index)
    .slice(0, 2);
  if (!events.length) {
    add(section, 'p', 'owner-home__quiet', '보유 종목에 연결된 최신 세계 사건은 미확인입니다. 전체 WorldMonitor는 아래에서 계속 확인할 수 있습니다.');
    return;
  }
  const list = add(section, 'div', 'owner-home__events');
  for (const event of events) {
    const card = add(list, 'article', 'owner-home__event');
    const badges = add(card, 'div', 'owner-home__badges');
    badge(badges, event.translationState === 'TRANSLATED' ? '한국어 요약' : event.translationState === 'TRANSLATION_FAILED' ? '번역 실패 · 원문 유지' : /[가-힣]/.test(event.originalHeadline) ? '한국어 원문' : '번역 미제공 · 원문 유지', event.translationState === 'TRANSLATION_FAILED' ? 'warning' : 'neutral');
    add(card, 'h4', 'owner-home__event-title', event.headline);
    add(card, 'p', 'owner-home__event-summary', `${event.impactedOwnerSymbols.join('·')} 관련 사건 묶음입니다. 가격 원인으로 단정하지 않고 다음 관측과 함께 확인합니다.`);
    add(card, 'small', 'owner-home__event-meta', `${event.links[0]?.name ?? '출처 미확인'} · ${formatTime(event.publishedAt)}`);
    if (event.headline !== event.originalHeadline) {
      const original = add(card, 'details', 'owner-home__original');
      add(original, 'summary', '', '원문 제목');
      add(original, 'p', '', event.originalHeadline);
    }
    const source = event.links[0];
    if (source) {
      const link = add(card, 'a', 'owner-home__source', '원문 보기') as HTMLAnchorElement;
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }
}

/** Same-origin Cloudflare Access identity is validated by the private endpoint. */
export function mountOwnerInvestmentContext(host: HTMLElement, symbol?: string): () => void {
  let disposed = false;
  let requestId = 0;
  let lastProviderRefresh = 0;
  const section = add(host, 'section', 'owner-investment-context owner-home');
  section.dataset.ownerInvestmentContext = '';
  const header = add(section, 'header', 'owner-home__header');
  add(header, 'div', 'owner-home__eyebrow', symbol ? '내 보유 맥락' : 'MYMONITOR · 오늘');
  add(header, 'h2', 'owner-home__title', symbol ? `${symbol} · 내 포지션` : '오늘, 내 포지션에 중요한 것');
  if (!symbol) add(header, 'p', 'owner-home__dek', '중요한 변화와 내게 미치는 의미, 다음 확인 조건을 먼저 읽습니다.');
  const loading = add(section, 'p', 'owner-home__loading', '보유·시장 근거를 자동으로 확인하는 중…');
  loading.setAttribute('role', 'status');
  const content = add(section, 'div', 'owner-home__content');

  const refresh = async (mode: 'status' | 'refresh' = 'status'): Promise<void> => {
    const id = ++requestId;
    if (mode === 'refresh') lastProviderRefresh = Date.now();
    loading.hidden = content.childElementCount > 0;
    let summaryRefreshNeeded = false;
    try {
      const context = await fetchOwnerContext(true);
      if (disposed || id !== requestId) return;
      const health = context.providerHealth;
      let entries = sortedEntries(context.ownerUniverse?.entries ?? []).filter((entry) => !symbol || entry.symbol === symbol);
      const focus = ['SOXS', 'SOXL', 'CISS', 'KORU'];
      const candidates = symbol ? entries : sortedEntries(entries.filter(entry => entry.actualHolding || focus.includes(entry.symbol)));
      const storyEntries = (candidates.length ? candidates : entries).slice(0, symbol ? 1 : 8);
      const summaries = new Map<string, string>();
      const intelligence = new Map<string, OwnerIntelligenceResponse>();
      const storyResults = await Promise.all(storyEntries.map(async (entry) => {
        try {
          const saved = await fetchOwnerIntelligence(entry.symbol, mode);
          intelligence.set(entry.symbol, saved);
          if (saved.story) {
            if (saved.shortSummary?.text && !saved.shortSummary.refreshNeeded) summaries.set(entry.symbol, saved.shortSummary.text);
            if (!saved.shortSummary || saved.shortSummary.refreshNeeded) summaryRefreshNeeded = true;
            return saved.story;
          }
          const refreshed = await fetchOwnerIntelligence(entry.symbol, 'refresh');
          intelligence.set(entry.symbol, refreshed);
          lastProviderRefresh = Date.now();
          if (refreshed.shortSummary?.text && !refreshed.shortSummary.refreshNeeded) summaries.set(entry.symbol, refreshed.shortSummary.text);
          return refreshed.story;
        } catch { return null; }
      }));
      if (disposed || id !== requestId) return;
      content.replaceChildren();
      loading.hidden = true;
      const storyBySymbol = new Map(storyEntries.map((entry, index) => [entry.symbol, storyResults[index] ?? null]));
      entries = sortedEntries(entries.map(entry => {
        const story = storyBySymbol.get(entry.symbol);
        return story && typeof story.actualHolding === 'boolean'
          ? { ...entry, actualHolding: story.actualHolding, positionState: story.positionState as OwnerUniverseEntry['positionState'] }
          : entry;
      }));

      if (!entries.length) {
        add(content, 'p', 'owner-home__empty', symbol
          ? '확인된 현재 보유·최근 거래 맥락이 없습니다. 미보유로 단정하지 않습니다.'
          : '개인 보유 정보를 확인할 수 없습니다. 수동 관심종목의 빈 상태와 같은 뜻이 아닙니다.');
      }

      if (!symbol) {
        const holdings = entries.filter((entry) => entry.actualHolding);
        const positions = add(content, 'section', 'owner-home__section owner-home__positions');
        const positionHeader = add(positions, 'header', 'owner-home__section-header');
        add(positionHeader, 'h3', 'owner-home__section-title', '내 포지션');
        add(positionHeader, 'span', 'owner-home__section-note', `Toss 보유 · ${formatTime(health?.lastSuccessfulSync)}`);
        const grid = add(positions, 'div', 'owner-home__position-grid');
        holdings.forEach((entry) => renderPositionCard(grid, entry, storyBySymbol.get(entry.symbol) ?? null, summaries.get(entry.symbol)));
        if (!holdings.length) add(positions, 'p', 'owner-home__quiet', '실제 보유 스냅샷이 미확인입니다. 빈 계좌로 단정하지 않습니다.');

        const focusEntries = entries.filter(entry => !entry.actualHolding && storyBySymbol.has(entry.symbol));
        if (focusEntries.length) {
          const focusLinks = add(positions, 'nav', 'owner-home__market-chips');
          focusLinks.setAttribute('aria-label', '함께 확인할 종목');
          for (const entry of focusEntries) {
            const link = add(focusLinks, 'a', 'owner-home__market-chip', entry.symbol) as HTMLAnchorElement;
            link.href = stockResearchUrl(entry.symbol);
          }
        }

        renderMarket(content, storyResults);
        renderImportantEvents(content, entries, storyBySymbol);

        const pair = holdings.some((entry) => entry.symbol === 'SOXL') && holdings.some((entry) => entry.symbol === 'SOXS');
        if (pair) {
          const callout = add(content, 'section', 'owner-home__pair');
          const top = add(callout, 'div', 'owner-home__pair-head');
          add(top, 'h3', 'owner-home__pair-title', 'SOXL + SOXS · 양방향 3배 노출');
          badge(top, '일일 재설정', 'warning');
          add(callout, 'p', 'owner-home__pair-lead', '같은 반도체 기초지수에 반대 방향으로 노출됩니다. 동시 보유의 실제 손익은 비중과 보유 경로에 따라 달라집니다.');
          const risks = add(callout, 'ul', 'owner-home__pair-risks');
          ['반대 방향 노출', '총 레버리지 노출', '경로 의존성'].forEach((risk) => add(risks, 'li', '', risk));
          add(callout, 'small', 'owner-home__pair-note', '수량·평가금액이 충분하지 않으면 정확한 순노출은 계산하지 않습니다.');
        }

        const world = add(content, 'details', 'owner-home__world-disclosure');
        add(world, 'summary', '', '관련 뉴스와 세계 맥락 더 보기');
        renderWorld(world, storyResults);
      } else {
        renderImportantEvents(content, entries, storyBySymbol);
      }

      renderOwnerHealth(content, storyEntries.map(entry => entry.symbol), intelligence);
      const diagnostics = add(content, 'details', 'owner-home__diagnostics');
      add(diagnostics, 'summary', 'owner-home__diagnostics-summary', '보유 동기화·행동 학습 상세');
      const body = add(diagnostics, 'div', 'owner-home__diagnostics-body');
      add(body, 'p', '', `자동 인증 · 보유 ${health?.holdings ?? 'UNKNOWN'} · 마지막 동기화 ${formatTime(health?.lastSuccessfulSync)}`);
      add(body, 'p', '', `주문 이력 ${health?.backfillProgress?.uniqueOrders ?? 0}건 · ${health?.backfillProgress?.complete ? '수집 완료' : '수집 미완료 — 행동 통계 보류'}`);
      add(body, 'p', '', '매매 이유는 당시 직접 남긴 기록이 없으면 추정하지 않습니다. 주문 수는 독립된 완결 거래 표본 수가 아닙니다.');
      add(body, 'p', '', `화면 진단 · CSS ${window.innerWidth}×${window.innerHeight} · 배율 ${window.devicePixelRatio} · 표시 영역 ${window.visualViewport ? `${Math.round(window.visualViewport.width)}×${Math.round(window.visualViewport.height)}` : '미확인'}`);
      const gaps = [...new Set(storyResults.flatMap((story) => story ? [...story.unknowns, ...story.notWired] : []))].slice(0, 8);
      if (gaps.length) add(body, 'p', 'owner-home__gaps', `미확인 · ${gaps.join(' · ')}`);
      if (mode === 'status' && (summaryRefreshNeeded || Date.now() - lastProviderRefresh >= 300_000)) void refresh('refresh');
    } catch (error) {
      if (disposed || id !== requestId) return;
      content.replaceChildren();
      loading.hidden = true;
      add(content, 'p', 'owner-home__error', error instanceof OwnerContextError && error.status === 401
        ? 'Cloudflare Access 인증을 확인할 수 없습니다. Access 로그인 후 새로고침하세요.'
        : '개인 데이터 조회 실패 — 빈 계좌로 간주하지 않습니다.');
    }
  };

  const changed = (): void => { requestId++; content.replaceChildren(); void refresh('refresh'); };
  window.addEventListener(OWNER_CONTEXT_CHANGED, changed);
  const poll = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !section.querySelector('details[open]')) void refresh('status');
  }, 60_000);
  void refresh();
  return () => {
    disposed = true;
    requestId += 1;
    clearInterval(poll);
    window.removeEventListener(OWNER_CONTEXT_CHANGED, changed);
    section.remove();
  };
}
