import { formatOwnerTime } from '@/services/owner-display';
import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import { DEFAULT_PRODUCT_LANGUAGE, getProductLocale } from '@/services/i18n-policy';
import type { MarketWatchlistEntry } from '@/services/market-watchlist';
import type { GlobalRadarCard, GlobalRadarSectionView } from '../product-recovery/global-radar-model.ts';
import { normalizeStockResearchSymbol, stockResearchUrl } from './stock-research-route.ts';
import './control-room-stock-research.css';
import { fetchAutonomousLearningSnapshot } from '@/services/autonomous-learning';

export type ControlRoomStockStatus = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';

export interface ControlRoomStockEntry extends MarketWatchlistEntry {
  /** A bounded, already-derived observation. This component does not infer a trade conclusion. */
  recentChange?: string;
}

export interface ControlRoomStockSummaryOptions {
  entries: readonly ControlRoomStockEntry[];
  status?: ControlRoomStockStatus;
  sourceLabel?: string;
  observedAt?: string;
  language?: string;
  maxVisible?: number;
  onManageWatchlist?: () => void;
  onOpenResearchHub?: (opener: HTMLElement) => void;
  onOpenSymbol?: (symbol: string, opener: HTMLElement) => void;
}

export interface ControlRoomStockSummaryProjection {
  entries: ControlRoomStockEntry[];
  status: ControlRoomStockStatus;
  sourceLabel?: string;
  observedAt?: string;
}

export type StockResearchHubDestination = 'overview' | 'risk' | 'cases' | 'learning';

export interface StockResearchHubOptions {
  entries: readonly MarketWatchlistEntry[];
  language?: string;
  initialSymbol?: string;
  onOpenSymbol?: (
    symbol: string,
    destination: StockResearchHubDestination,
    opener: HTMLElement,
  ) => void;
}

export interface MountedControlRoomStockResearch {
  destroy(): void;
}

const STATUS_KEYS: Record<ControlRoomStockStatus, MyMonitorTranslationKey> = {
  AVAILABLE: 'radar.status.available',
  STALE: 'radar.status.delayed',
  UNAVAILABLE: 'radar.status.unavailable',
};

const DESTINATION_HASH: Record<StockResearchHubDestination, string> = {
  overview: '',
  risk: '#ticker-360-risk',
  cases: '#ticker-360-cases',
  learning: '#ticker-360-learning',
};

const LOCAL_COPY = {
  en: {
    recentChanges: 'Recent changes',
    noRecentChange: 'No confirmed recent change',
    visibleCount: (visible: number, total: number) => `${visible} of ${total} stocks shown`,
    researchDescription: 'Search a symbol, then drill down into its evidence and learning tools.',
    riskChanges: 'Risk changes',
    source: 'Source',
    observed: 'Observed',
  },
  ko: {
    recentChanges: '최근 변화',
    noRecentChange: '확인된 최근 변화 없음',
    visibleCount: (visible: number, total: number) => `${total}개 중 ${visible}개 표시`,
    researchDescription: '종목을 검색한 뒤 근거와 학습 도구로 들어갑니다.',
    riskChanges: '위험 변화',
    source: '출처',
    observed: '자료 기준',
  },
} as const;

function language(options: { language?: string }): 'en' | 'ko' {
  return options.language?.trim().toLowerCase().startsWith('en') ? 'en' : 'ko';
}

function tr(options: { language?: string }, key: MyMonitorTranslationKey): string {
  return translateMyMonitor(key, options.language ?? DEFAULT_PRODUCT_LANGUAGE);
}

function append(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function normalizedEntries(entries: readonly MarketWatchlistEntry[]): MarketWatchlistEntry[] {
  const seen = new Set<string>();
  const result: MarketWatchlistEntry[] = [];
  for (const entry of entries) {
    const symbol = normalizeStockResearchSymbol(entry.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    result.push({ ...entry, symbol });
  }
  return result;
}

function cardObservedAt(card: GlobalRadarCard): number {
  const observed = Date.parse(card.observedAt ?? '');
  return Number.isFinite(observed) ? observed : Number.NEGATIVE_INFINITY;
}

function cardPriority(card: GlobalRadarCard): number {
  if (card.ownerChange === 'NEW') return 0;
  if (card.ownerComparison === 'NEW_CONFIRMED_EVIDENCE') return 1;
  if (card.ownerComparison === 'NEW_INSUFFICIENT') return 2;
  if (card.section === 'WATCHLIST') return 3;
  return 4;
}

function boundedRecentChange(card: GlobalRadarCard, symbol: string): string {
  const symbolPrefix = new RegExp(`^${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·:-]\\s*`, 'i');
  const title = card.title.replace(symbolPrefix, '').trim() || card.title.trim();
  const combined = card.detail && !title.includes(card.detail) ? `${title} · ${card.detail}` : title;
  return combined.length > 180 ? `${combined.slice(0, 177).trimEnd()}…` : combined;
}

/**
 * Integration adapter for the Control Room ownerWatchlist + Global Radar
 * WATCHLIST section. Import from
 * `@/features/stock-research/control-room-stock-research`.
 */
export function controlRoomStockSummaryFromRadar(
  ownerWatchlist: readonly MarketWatchlistEntry[],
  watchlistSection: GlobalRadarSectionView | undefined,
): ControlRoomStockSummaryProjection {
  const ownerEntries = normalizedEntries(ownerWatchlist);
  const section = watchlistSection?.key === 'WATCHLIST' ? watchlistSection : undefined;
  const cards = section?.cards ?? [];
  const entries = ownerEntries.map((entry): ControlRoomStockEntry => {
    const related = cards
      .filter((card) => card.symbols.some((candidate) => normalizeStockResearchSymbol(candidate) === entry.symbol))
      .sort((left, right) => cardPriority(left) - cardPriority(right) || cardObservedAt(right) - cardObservedAt(left));
    const recent = related[0];
    return recent
      ? { ...entry, recentChange: boundedRecentChange(recent, entry.symbol) }
      : entry;
  });
  const observedAt = cards
    .map((card) => card.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
    ?? section?.source.observedAt;

  return {
    entries,
    status: section?.status ?? 'UNAVAILABLE',
    ...(section?.source.label ? { sourceLabel: section.source.label } : {}),
    ...(observedAt ? { observedAt } : {}),
  };
}

function formatObservedAt(value: string, requestedLanguage: string | undefined): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(getProductLocale(requestedLanguage), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

function stockDestinationUrl(symbol: string, destination: StockResearchHubDestination): string {
  return `${stockResearchUrl(symbol)}${DESTINATION_HASH[destination]}`;
}

function bindStockLink(
  link: HTMLAnchorElement,
  symbol: string,
  destination: StockResearchHubDestination,
  removeListeners: Array<() => void>,
  onOpen?: StockResearchHubOptions['onOpenSymbol'],
): void {
  if (!onOpen) return;
  const open = (event: Event): void => {
    event.preventDefault();
    onOpen(symbol, destination, link);
  };
  link.addEventListener('click', open);
  removeListeners.push(() => link.removeEventListener('click', open));
}

/**
 * Mount the compact Home entry for stock research. It intentionally renders no
 * risk ticket, Replay chart, recommendation, or other research-room body.
 */
export function mountControlRoomStockSummary(
  host: HTMLElement,
  options: ControlRoomStockSummaryOptions,
): MountedControlRoomStockResearch {
  const removeListeners: Array<() => void> = [];
  const copy = LOCAL_COPY[language(options)];
  const entries = normalizedEntries(options.entries) as ControlRoomStockEntry[];
  const maxVisible = Math.max(1, Math.min(5, Math.floor(options.maxVisible ?? 3)));
  const visibleEntries = entries.slice(0, maxVisible);
  const status = options.status ?? (entries.length > 0 ? 'AVAILABLE' : 'UNAVAILABLE');

  host.replaceChildren();
  const section = append(host, 'section', 'control-room-stock-summary');
  section.dataset.controlRoomStockSummary = '';
  section.dataset.stockStatus = status;
  const header = append(section, 'header', 'control-room-stock-summary__header');
  append(header, 'h2', 'control-room-stock-summary__title', tr(options, 'nav.watchlist'));
  append(
    header,
    'span',
    `control-room-stock-summary__status control-room-stock-summary__status--${status.toLowerCase()}`,
    tr(options, STATUS_KEYS[status]),
  );

  if (visibleEntries.length === 0) {
    append(section, 'p', 'control-room-stock-summary__empty', tr(options, 'radar.watchlistEmpty'));
  } else {
    append(section, 'p', 'control-room-stock-summary__eyebrow', copy.recentChanges);
    const list = append(section, 'ul', 'control-room-stock-summary__list');
    for (const entry of visibleEntries) {
      const item = append(list, 'li', 'control-room-stock-summary__item');
      const link = append(item, 'a', 'control-room-stock-summary__symbol') as HTMLAnchorElement;
      link.href = stockResearchUrl(entry.symbol);
      link.textContent = entry.display || entry.symbol;
      if (options.onOpenSymbol) {
        const open = (event: Event): void => {
          event.preventDefault();
          options.onOpenSymbol?.(entry.symbol, link);
        };
        link.addEventListener('click', open);
        removeListeners.push(() => link.removeEventListener('click', open));
      }
      append(item, 'span', 'control-room-stock-summary__name', entry.name || entry.symbol);
      append(
        item,
        'span',
        entry.recentChange
          ? 'control-room-stock-summary__change'
          : 'control-room-stock-summary__change control-room-stock-summary__change--quiet',
        entry.recentChange || copy.noRecentChange,
      );
    }
    if (entries.length > visibleEntries.length) {
      append(
        section,
        'p',
        'control-room-stock-summary__count',
        copy.visibleCount(visibleEntries.length, entries.length),
      );
    }
  }

  const meta = append(section, 'p', 'control-room-stock-summary__meta');
  meta.textContent = `${copy.source}: ${options.sourceLabel || tr(options, 'radar.watchlistLinkage')}`;
  if (options.observedAt) {
    meta.append(document.createTextNode(` · ${copy.observed}: ${formatObservedAt(options.observedAt, options.language)}`));
  }

  const actions = append(section, 'div', 'control-room-stock-summary__actions');
  const manage = append(actions, 'button', 'control-room-stock-summary__action', tr(options, 'radar.addWatchlist')) as HTMLButtonElement;
  manage.type = 'button';
  manage.dataset.manageWatchlist = '';
  const onManage = (): void => options.onManageWatchlist?.();
  manage.addEventListener('click', onManage);
  removeListeners.push(() => manage.removeEventListener('click', onManage));

  const research = append(actions, 'button', 'control-room-stock-summary__action control-room-stock-summary__action--primary', tr(options, 'radar.openStockResearch')) as HTMLButtonElement;
  research.type = 'button';
  research.dataset.openResearchHub = '';
  const onResearch = (): void => {
    if (options.onOpenResearchHub) {
      options.onOpenResearchHub(research);
      return;
    }
    research.dispatchEvent(new CustomEvent('mymonitor:open-stock-research-hub', { bubbles: true }));
  };
  research.addEventListener('click', onResearch);
  removeListeners.push(() => research.removeEventListener('click', onResearch));

  return {
    destroy(): void {
      removeListeners.splice(0).forEach((remove) => remove());
      if (section.isConnected) section.remove();
    },
  };
}

/** Mount a separate, lightweight navigation hub; research details stay on /stocks/:symbol. */
export function mountStockResearchHub(
  host: HTMLElement,
  options: StockResearchHubOptions,
): MountedControlRoomStockResearch {
  const removeListeners: Array<() => void> = [];
  const copy = LOCAL_COPY[language(options)];
  const entries = normalizedEntries(options.entries);
  const initialSymbol = normalizeStockResearchSymbol(options.initialSymbol) ?? entries[0]?.symbol ?? '';

  host.replaceChildren();
  const section = append(host, 'section', 'stock-research-hub');
  section.dataset.stockResearchHub = '';
  append(section, 'h2', 'stock-research-hub__title', tr(options, 'radar.researchHub'));
  append(section, 'p', 'stock-research-hub__description', copy.researchDescription);

  const form = append(section, 'form', 'stock-research-hub__search') as HTMLFormElement;
  form.setAttribute('aria-label', tr(options, 'radar.stockSearch'));
  const label = append(form, 'label', undefined, tr(options, 'radar.stockSearch')) as HTMLLabelElement;
  label.htmlFor = 'control-room-stock-symbol';
  const input = append(form, 'input', undefined) as HTMLInputElement;
  input.id = 'control-room-stock-symbol';
  input.name = 'symbol';
  input.value = initialSymbol;
  input.maxLength = 15;
  input.autocomplete = 'off';
  input.spellcheck = false;
  const submit = append(form, 'button', 'stock-research-hub__primary', tr(options, 'radar.openStockResearch')) as HTMLButtonElement;
  submit.type = 'submit';

  const destinations = append(section, 'nav', 'stock-research-hub__destinations');
  destinations.setAttribute('aria-label', tr(options, 'nav.research'));
  const destinationDefinitions: Array<{
    destination: StockResearchHubDestination;
    label: string;
  }> = [
    { destination: 'overview', label: 'TICKER-360' },
    { destination: 'risk', label: copy.riskChanges },
    { destination: 'cases', label: tr(options, 'radar.pastCases') },
    { destination: 'learning', label: tr(options, 'radar.signalLab') },
  ];
  const destinationLinks = destinationDefinitions.map(({ destination, label: text }) => {
    const link = append(destinations, 'a', 'stock-research-hub__destination', text) as HTMLAnchorElement;
    link.dataset.researchDestination = destination;
    return { destination, link };
  });

  const updateDestinations = (): string | null => {
    const symbol = normalizeStockResearchSymbol(input.value);
    input.setCustomValidity(symbol ? '' : tr(options, 'ticker.invalidSymbol'));
    for (const { destination, link } of destinationLinks) {
      link.href = symbol ? stockDestinationUrl(symbol, destination) : stockResearchUrl('');
      link.setAttribute('aria-disabled', String(!symbol));
      link.tabIndex = symbol ? 0 : -1;
    }
    return symbol;
  };
  updateDestinations();

  const onInput = (): void => { updateDestinations(); };
  input.addEventListener('input', onInput);
  removeListeners.push(() => input.removeEventListener('input', onInput));

  for (const { destination, link } of destinationLinks) {
    const open = (event: Event): void => {
      const symbol = updateDestinations();
      if (!symbol) {
        event.preventDefault();
        input.reportValidity();
        return;
      }
      if (options.onOpenSymbol) {
        event.preventDefault();
        options.onOpenSymbol(symbol, destination, link);
      }
    };
    link.addEventListener('click', open);
    removeListeners.push(() => link.removeEventListener('click', open));
  }

  const onSubmit = (event: Event): void => {
    event.preventDefault();
    const symbol = updateDestinations();
    if (!symbol) {
      input.reportValidity();
      return;
    }
    if (options.onOpenSymbol) {
      options.onOpenSymbol(symbol, 'overview', submit);
      return;
    }
    // Use the same delegated route as the working overview link. The old
    // custom event had no listener, leaving Enter and the submit button inert.
    destinationLinks.find(item => item.destination === 'overview')?.link.click();
  };
  form.addEventListener('submit', onSubmit);
  removeListeners.push(() => form.removeEventListener('submit', onSubmit));

  const watchlist = append(section, 'section', 'stock-research-hub__watchlist');
  append(watchlist, 'h3', undefined, tr(options, 'nav.watchlist'));
  if (entries.length === 0) {
    append(watchlist, 'p', 'stock-research-hub__empty', tr(options, 'radar.watchlistEmpty'));
  } else {
    const list = append(watchlist, 'ul');
    for (const entry of entries.slice(0, 12)) {
      const item = append(list, 'li');
      const link = append(item, 'a', undefined, entry.display || entry.symbol) as HTMLAnchorElement;
      link.href = stockResearchUrl(entry.symbol);
      link.setAttribute('aria-label', `${entry.name || entry.symbol} · ${tr(options, 'radar.openStockResearch')}`);
      bindStockLink(link, entry.symbol, 'overview', removeListeners, options.onOpenSymbol);
    }
  }

  const learning = append(section, 'section', 'stock-research-hub__learning');
  learning.dataset.autonomousLearningSummary = '';
  append(learning, 'h3', undefined, language(options) === 'ko' ? '최근 MyMonitor가 배운 것' : 'What MyMonitor learned recently');
  const learningStatus = append(learning, 'p', 'stock-research-hub__empty', language(options) === 'ko' ? '실제 결과 통계를 불러오는 중입니다.' : 'Loading realized-outcome statistics.');
  void fetchAutonomousLearningSnapshot().then((snapshot) => {
    if (!learning.isConnected) return;
    if (!snapshot || snapshot.globalLessons.length === 0) {
      learningStatus.textContent = language(options) === 'ko'
        ? `최소 표본이 쌓이는 중입니다${snapshot ? ` · 사례 ${snapshot.caseCount}건` : ''}.`
        : `Building the minimum sample${snapshot ? ` · ${snapshot.caseCount} cases` : ''}.`;
      return;
    }
    learningStatus.remove();
    const list = append(learning, 'ul');
    snapshot.globalLessons.slice(0, 3).forEach((lesson) => append(list, 'li', undefined, lesson));
    append(learning, 'p', 'stock-research-hub__empty', `마지막 학습 관측 · ${formatOwnerTime(snapshot.lastOutcomeUpdate ?? snapshot.generatedAt)}`);
  }).catch(() => {
    if (learning.isConnected) learningStatus.textContent = language(options) === 'ko' ? '자동 학습 통계를 사용할 수 없습니다.' : 'Autonomous learning statistics unavailable.';
  });

  return {
    destroy(): void {
      removeListeners.splice(0).forEach((remove) => remove());
      if (section.isConnected) section.remove();
    },
  };
}
