import type {
  GlobalRadarCard,
  GlobalRadarModel,
  GlobalRadarSectionView,
  RadarCardCategory,
  RadarSectionStatus,
  RadarSource,
  RadarSourceMode,
} from './global-radar-model.ts';
import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import { DEFAULT_PRODUCT_LANGUAGE, getProductLocale } from '@/services/i18n-policy';

export const GLOBAL_RADAR_MOBILE_BREAKPOINT = '(max-width: 640px)' as const;

export interface GlobalRadarMapRequest {
  cardId?: string;
  region?: string;
  symbols?: string[];
}

export interface GlobalRadarMountOptions {
  /** Test seam. Production normally follows matchMedia. */
  mobile?: boolean;
  onOpenMap?: (request: GlobalRadarMapRequest) => void;
  onOpenDetail?: (card: GlobalRadarCard) => void;
  onMarkChecked?: () => void;
  onManageWatchlist?: () => void;
  onOpenResearch?: () => void;
  language?: string;
}

export interface MountedGlobalRadar {
  destroy(): void;
}

const CATEGORY_LABELS: Array<{ key: 'ALL' | RadarCardCategory; label: MyMonitorTranslationKey }> = [
  { key: 'ALL', label: 'radar.category.all' },
  { key: 'MARKET', label: 'radar.category.market' },
  { key: 'WORLD', label: 'radar.category.world' },
  { key: 'SEC', label: 'radar.category.sec' },
  { key: 'WATCHLIST', label: 'radar.category.watchlist' },
];

const SOURCE_MODE_LABELS: Record<RadarSourceMode, MyMonitorTranslationKey> = {
  LIVE: 'radar.source.publicData',
  PUBLIC_SNAPSHOT: 'radar.source.snapshot',
  STALE: 'radar.source.delayed',
  UNAVAILABLE: 'radar.source.unavailable',
};

const SECTION_STATUS_LABELS: Record<RadarSectionStatus, MyMonitorTranslationKey> = {
  AVAILABLE: 'radar.status.available',
  STALE: 'radar.status.delayed',
  UNAVAILABLE: 'radar.status.unavailable',
};

function tr(options: GlobalRadarMountOptions, key: MyMonitorTranslationKey): string {
  return translateMyMonitor(key, options.language ?? DEFAULT_PRODUCT_LANGUAGE);
}

function append(parent: HTMLElement, tag: string, className?: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function formatObservationTime(value: string | undefined, language: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat(getProductLocale(language), {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(date);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(getProductLocale(language), {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(date) + ' UTC';
}

function safeHttpHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function sourceMeta(parent: HTMLElement, source: RadarSource, options: GlobalRadarMountOptions, observedAt?: string): void {
  const meta = append(parent, 'div', 'global-radar__source');
  const href = safeHttpHref(source.href);
  if (href) {
    const link = append(meta, 'a', 'global-radar__source-link', source.label) as HTMLAnchorElement;
    link.href = href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.setAttribute('aria-label', `${source.label} · ${tr(options, 'radar.sourceOpen')}`);
  } else {
    append(meta, 'span', 'global-radar__source-name', source.label);
  }
  append(meta, 'span', `global-radar__source-mode global-radar__source-mode--${source.mode.toLowerCase()}`, tr(options, SOURCE_MODE_LABELS[source.mode]));
  const language = options.language ?? DEFAULT_PRODUCT_LANGUAGE;
  const observed = formatObservationTime(observedAt ?? source.observedAt, language);
  const captured = formatObservationTime(source.capturedAt, language);
  if (observed) append(meta, 'span', 'global-radar__timestamp', `${tr(options, 'radar.observed')} ${observed}`);
  if (captured && source.capturedAt !== (observedAt ?? source.observedAt)) {
    append(meta, 'span', 'global-radar__timestamp', `${tr(options, 'radar.captured')} ${captured}`);
  }
}

function comparisonLabel(card: GlobalRadarCard, options: GlobalRadarMountOptions): string | undefined {
  if (card.ownerChange === 'NEW') {
    if (card.evidenceStatus === 'CONFIRMED') return tr(options, 'radar.comparison.newConfirmed');
    if (card.evidenceStatus === 'INSUFFICIENT') return tr(options, 'radar.comparison.newReview');
    return tr(options, 'radar.comparison.newItem');
  }
  if (card.ownerChange === 'UNCHANGED') return tr(options, 'radar.comparison.unchanged');
  if (card.ownerChange === 'FIRST_CHECK') return tr(options, 'radar.comparison.current');
  switch (card.ownerComparison) {
    case 'NEW_CONFIRMED_EVIDENCE': return tr(options, 'radar.comparison.newConfirmed');
    case 'NEW_INSUFFICIENT': return tr(options, 'radar.comparison.newReview');
    case 'UNCHANGED': return tr(options, 'radar.comparison.unchanged');
    case 'FIRST_CHECK': return tr(options, 'radar.comparison.first');
    default: return undefined;
  }
}

function renderCard(
  card: GlobalRadarCard,
  options: GlobalRadarMountOptions,
  removeListeners: Array<() => void>,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'global-radar-card';
  article.dataset.radarCard = card.id;
  article.dataset.radarCategory = card.category;
  article.dataset.ownerComparison = card.ownerComparison;

  const head = append(article, 'div', 'global-radar-card__head');
  append(head, 'h3', 'global-radar-card__title', card.title);
  if (card.value) append(head, 'strong', 'global-radar-card__value', card.value);
  const comparison = comparisonLabel(card, options);
  if (comparison) append(article, 'span', `global-radar-card__comparison global-radar-card__comparison--${card.ownerComparison.toLowerCase()}`, comparison);
  if (card.detail) append(article, 'p', 'global-radar-card__detail', card.detail);

  if (card.stockLinks?.length) {
    const relations = append(article, 'div', 'global-radar-card__relations');
    append(relations, 'span', 'global-radar-card__relations-label', `${tr(options, 'radar.relatedStocks')}:`);
    for (const link of card.stockLinks) {
      const anchor = append(relations, 'a', 'global-radar-card__stock-link', link.label) as HTMLAnchorElement;
      anchor.href = link.href;
      anchor.dataset.radarStockLink = link.symbol;
    }
  }
  if (card.region) append(article, 'p', 'global-radar-card__region', `${tr(options, 'radar.region')}: ${card.region}`);
  sourceMeta(article, card.source, options, card.observedAt);

  const actions = append(article, 'div', 'global-radar-card__actions');
  if (card.href) {
    const href = safeHttpHref(card.href);
    if (href) {
      const link = append(
        actions,
        'a',
        'global-radar__action',
        tr(options, card.section === 'WORLD' ? 'radar.originalArticle' : 'radar.openDetail'),
      ) as HTMLAnchorElement;
      link.href = href;
      const resolved = new URL(href, window.location.origin);
      if (resolved.origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noreferrer';
      }
    }
  } else if (options.onOpenDetail) {
    const button = append(actions, 'button', 'global-radar__action', tr(options, 'radar.openDetail')) as HTMLButtonElement;
    button.type = 'button';
    const onClick = (): void => options.onOpenDetail?.(card);
    button.addEventListener('click', onClick);
    removeListeners.push(() => button.removeEventListener('click', onClick));
  }

  if (card.section === 'WORLD' && card.region) {
    const mapButton = append(actions, 'button', 'global-radar__action global-radar__action--secondary', tr(options, 'radar.openOnMap')) as HTMLButtonElement;
    mapButton.type = 'button';
    mapButton.dataset.radarOpenMap = card.id;
    const onClick = (): void => {
      const detail: GlobalRadarMapRequest = { cardId: card.id, region: card.region, symbols: card.symbols };
      if (options.onOpenMap) {
        options.onOpenMap(detail);
      } else {
        mapButton.dispatchEvent(new CustomEvent<GlobalRadarMapRequest>('mymonitor:open-global-map', {
          bubbles: true,
          detail,
        }));
      }
    };
    mapButton.addEventListener('click', onClick);
    removeListeners.push(() => mapButton.removeEventListener('click', onClick));
  }
  return article;
}

function renderComparison(
  parent: HTMLElement,
  model: GlobalRadarModel,
  options: GlobalRadarMountOptions,
  removeListeners: Array<() => void>,
  includeCards: boolean,
): void {
  const comparison = append(parent, 'section', `global-radar__comparison global-radar__comparison--${model.comparison.state.toLowerCase()}`);
  const labelId = parent.dataset.radarMobile !== undefined
    ? 'global-radar-mobile-comparison-title'
    : 'global-radar-desktop-comparison-title';
  comparison.dataset.radarComparison = model.comparison.state;
  comparison.setAttribute('aria-labelledby', labelId);
  append(comparison, 'h2', 'global-radar__eyebrow', tr(options, 'radar.sinceLastCheck')).id = labelId;
  append(comparison, 'strong', 'global-radar__comparison-headline', model.comparison.headline);
  const comparisonDetail = model.comparison.lastCheckedAt
    ? `${tr(options, 'radar.lastChecked')} ${formatObservationTime(
      model.comparison.lastCheckedAt,
      options.language ?? DEFAULT_PRODUCT_LANGUAGE,
    ) ?? model.comparison.lastCheckedAt}`
    : model.comparison.detail;
  append(comparison, 'p', 'global-radar__comparison-detail', comparisonDetail);
  if (includeCards && model.lastCheckCards.length > 0) {
    const feed = append(comparison, 'div', 'global-radar__last-check-cards');
    model.lastCheckCards.forEach((card) => feed.append(renderCard(card, options, removeListeners)));
  }
  if (options.onMarkChecked) {
    const button = append(comparison, 'button', 'global-radar__action global-radar__mark-checked', tr(options, 'radar.markChecked')) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.radarMarkChecked = '';
    const onClick = (): void => options.onMarkChecked?.();
    button.addEventListener('click', onClick);
    removeListeners.push(() => button.removeEventListener('click', onClick));
  }
}

function renderEmptyState(parent: HTMLElement, section: GlobalRadarSectionView, options: GlobalRadarMountOptions): void {
  const text = section.status === 'UNAVAILABLE'
    ? section.unavailableReason ?? tr(options, 'common.unavailable')
    : section.emptyLabel ?? tr(options, 'radar.noObservations');
  const empty = append(parent, 'p', 'global-radar__empty', text);
  empty.dataset.radarEmpty = section.key;
}

function renderSection(
  section: GlobalRadarSectionView,
  options: GlobalRadarMountOptions,
  removeListeners: Array<() => void>,
): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'global-radar-section';
  wrapper.dataset.radarSection = section.key;
  wrapper.id = `global-radar-section-${section.key.toLowerCase()}`;
  const header = append(wrapper, 'header', 'global-radar-section__header');
  append(header, 'h2', 'global-radar-section__title', section.title);
  const status = append(header, 'span', `global-radar-section__status global-radar-section__status--${section.status.toLowerCase()}`, tr(options, SECTION_STATUS_LABELS[section.status]));
  status.dataset.radarSectionStatus = section.status;
  if (section.cards.length === 0) renderEmptyState(wrapper, section, options);
  else if (section.unavailableReason) append(wrapper, 'p', 'global-radar__availability-note', section.unavailableReason);
  const cards = append(wrapper, 'div', 'global-radar-section__cards');
  section.cards.forEach((card) => cards.append(renderCard(card, options, removeListeners)));
  sourceMeta(wrapper, section.source, options);
  if (section.key === 'WATCHLIST') {
    const actions = append(wrapper, 'div', 'global-radar__section-actions');
    const manage = append(actions, 'button', 'global-radar__action', tr(options, 'radar.addWatchlist')) as HTMLButtonElement;
    manage.type = 'button';
    manage.dataset.radarManageWatchlist = '';
    const onManage = (): void => options.onManageWatchlist?.();
    manage.addEventListener('click', onManage);
    removeListeners.push(() => manage.removeEventListener('click', onManage));
    const research = append(actions, 'button', 'global-radar__action global-radar__action--secondary', tr(options, 'radar.openStockResearch')) as HTMLButtonElement;
    research.type = 'button';
    research.dataset.radarOpenResearch = '';
    const onResearch = (): void => options.onOpenResearch?.();
    research.addEventListener('click', onResearch);
    removeListeners.push(() => research.removeEventListener('click', onResearch));
    const hub = append(wrapper, 'details', 'global-radar__research-hub') as HTMLDetailsElement;
    hub.id = 'global-radar-research-hub';
    append(hub, 'summary', undefined, tr(options, 'radar.researchHub'));
    append(hub, 'p', undefined, tr(options, 'radar.researchNeedsSymbol'));
    const links = append(hub, 'div', 'global-radar__research-links');
    for (const key of ['radar.stockSearch', 'radar.signalLab', 'radar.pastCases'] as const) {
      const button = append(links, 'button', 'global-radar__action global-radar__action--secondary', tr(options, key)) as HTMLButtonElement;
      button.type = 'button';
      const open = (): void => options.onOpenResearch?.();
      button.addEventListener('click', open);
      removeListeners.push(() => button.removeEventListener('click', open));
    }
  }
  return wrapper;
}

function renderWorldOverview(
  model: GlobalRadarModel,
  options: GlobalRadarMountOptions,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'global-radar__world-overview';
  section.id = 'global-radar-world-overview';
  append(section, 'h2', 'global-radar__section-heading', tr(options, 'radar.worldOverview'));
  append(section, 'p', 'global-radar__section-intro', tr(options, 'radar.worldOverviewIntro'));
  const groups = append(section, 'div', 'global-radar__world-overview-groups');
  if (model.worldOverview.length === 0) {
    append(groups, 'p', 'global-radar__empty', tr(options, 'radar.worldUnavailable'));
    return section;
  }
  for (const group of model.worldOverview) {
    const article = append(groups, 'article', 'global-radar__world-region');
    append(article, 'h3', undefined, group.title);
    const list = append(article, 'ul');
    for (const card of group.cards) {
      const item = append(list, 'li');
      const href = safeHttpHref(card.href);
      if (href) {
        const link = append(item, 'a', undefined, card.title) as HTMLAnchorElement;
        link.href = href;
        link.target = '_blank';
        link.rel = 'noreferrer';
      } else {
        append(item, 'span', undefined, card.title);
      }
      const observed = formatObservationTime(card.observedAt, options.language ?? DEFAULT_PRODUCT_LANGUAGE);
      if (observed) append(item, 'small', undefined, `${card.source.label} · ${observed}`);
    }
  }
  return section;
}

function renderDesktop(
  model: GlobalRadarModel,
  options: GlobalRadarMountOptions,
  removeListeners: Array<() => void>,
): HTMLElement {
  const desktop = document.createElement('div');
  desktop.className = 'global-radar__desktop';
  desktop.dataset.radarDesktop = '';
  renderComparison(desktop, model, options, removeListeners, true);
  desktop.append(renderWorldOverview(model, options));
  const sections = append(desktop, 'div', 'global-radar__desktop-grid');
  const order: GlobalRadarSectionView['key'][] = ['MARKET', 'WORLD', 'MACRO', 'SEC', 'WATCHLIST'];
  for (const key of order) {
    const section = model.sections.find((candidate) => candidate.key === key);
    if (!section) continue;
    const rendered = renderSection(section, options, removeListeners);
    if (key === 'WORLD') rendered.querySelector('.global-radar-section__title')!.textContent = tr(options, 'radar.worldNews');
    sections.append(rendered);
  }
  return desktop;
}

function setSelectedCategory(
  category: 'ALL' | RadarCardCategory,
  tabs: HTMLButtonElement[],
  cards: HTMLElement[],
  empty: HTMLElement,
): void {
  tabs.forEach((tab) => {
    const selected = tab.dataset.radarCategoryTab === category;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  let visible = 0;
  cards.forEach((card) => {
    const matches = category === 'ALL' || card.dataset.radarCategory === category;
    card.hidden = !matches || card.dataset.radarOverflowHidden === 'true';
    if (matches && !card.hidden) visible += 1;
  });
  empty.hidden = visible > 0;
}

function renderMobile(
  model: GlobalRadarModel,
  options: GlobalRadarMountOptions,
  removeListeners: Array<() => void>,
): HTMLElement {
  const mobile = document.createElement('div');
  mobile.className = 'global-radar__mobile';
  mobile.dataset.radarMobile = '';
  renderComparison(mobile, model, options, removeListeners, false);
  mobile.append(renderWorldOverview(model, options));

  const tablist = append(mobile, 'div', 'global-radar__tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', tr(options, 'radar.changeCategories'));
  const tabs = CATEGORY_LABELS.map(({ key, label }) => {
    const tab = append(tablist, 'button', 'global-radar__tab', tr(options, label)) as HTMLButtonElement;
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.radarCategoryTab = key;
    return tab;
  });

  const feed = append(mobile, 'section', 'global-radar__feed');
  feed.setAttribute('aria-label', tr(options, 'radar.changeFeed'));
  const sectionByKey = new Map(model.sections.map((section) => [section.key, section]));
  const mobileGroups: Array<{
    id: string;
    category: RadarCardCategory;
    title: string;
    cards: GlobalRadarCard[];
    initial: number;
    section: GlobalRadarSectionView;
  }> = [];
  const market = sectionByKey.get('MARKET');
  const macro = sectionByKey.get('MACRO');
  const world = sectionByKey.get('WORLD');
  const sec = sectionByKey.get('SEC');
  const watchlist = sectionByKey.get('WATCHLIST');
  if (market && macro) {
    const combinedStatus: RadarSectionStatus = market.status === 'UNAVAILABLE' && macro.status === 'UNAVAILABLE'
      ? 'UNAVAILABLE'
      : market.status === 'AVAILABLE' && macro.status === 'AVAILABLE'
        ? 'AVAILABLE'
        : 'STALE';
    const combinedReason = [market.unavailableReason, macro.unavailableReason].filter(Boolean).join(' ');
    const representative = market.status !== 'UNAVAILABLE' ? market.source : macro.source;
    mobileGroups.push({
      id: 'market-macro', category: 'MARKET', title: tr(options, 'radar.marketMacro'),
      cards: [...market.cards, ...macro.cards], initial: 4,
      section: {
        ...market,
        status: combinedStatus,
        source: { ...representative, mode: combinedStatus === 'STALE' ? 'STALE' : representative.mode },
        ...(combinedReason ? { unavailableReason: combinedReason } : {}),
      },
    });
  }
  if (world) mobileGroups.push({ id: 'world', category: 'WORLD', title: tr(options, 'radar.worldNews'), cards: world.cards, initial: 5, section: world });
  if (sec) mobileGroups.push({ id: 'sec', category: 'SEC', title: sec.title, cards: sec.cards, initial: 3, section: sec });
  if (watchlist) mobileGroups.push({ id: 'watchlist', category: 'WATCHLIST', title: watchlist.title, cards: watchlist.cards, initial: Number.POSITIVE_INFINITY, section: watchlist });

  const categorySections: HTMLElement[] = [];
  const cards: HTMLElement[] = [];
  for (const group of mobileGroups) {
    const wrapper = append(feed, 'section', 'global-radar-section global-radar-section--mobile');
    wrapper.id = `global-radar-mobile-${group.id}`;
    wrapper.dataset.radarCategory = group.category;
    wrapper.dataset.radarSection = group.id;
    categorySections.push(wrapper);
    const header = append(wrapper, 'header', 'global-radar-section__header');
    append(header, 'h2', 'global-radar-section__title', group.title);
    const status = append(header, 'span', `global-radar-section__status global-radar-section__status--${group.section.status.toLowerCase()}`, tr(options, SECTION_STATUS_LABELS[group.section.status]));
    status.dataset.radarSectionStatus = group.section.status;
    if (group.section.unavailableReason) append(wrapper, 'p', 'global-radar__availability-note', group.section.unavailableReason);
    if (group.cards.length === 0) renderEmptyState(wrapper, group.section, options);
    const cardsHost = append(wrapper, 'div', 'global-radar-section__cards');
    const renderedCards = group.cards.map((card, index) => {
      const rendered = renderCard(card, options, removeListeners);
      if (index >= group.initial) {
        rendered.hidden = true;
        rendered.dataset.radarOverflowHidden = 'true';
      }
      cardsHost.append(rendered);
      cards.push(rendered);
      return rendered;
    });
    if (group.cards.length > group.initial) {
      const toggle = append(wrapper, 'button', 'global-radar__action global-radar__show-all', `${tr(options, 'radar.showAll')} ${group.cards.length}`) as HTMLButtonElement;
      toggle.type = 'button';
      toggle.dataset.radarShowAll = group.id;
      toggle.setAttribute('aria-expanded', 'false');
      const onToggle = (): void => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        renderedCards.forEach((card, index) => {
          const overflowHidden = expanded && index >= group.initial;
          card.hidden = overflowHidden;
          if (overflowHidden) card.dataset.radarOverflowHidden = 'true';
          else delete card.dataset.radarOverflowHidden;
        });
        toggle.textContent = expanded ? `${tr(options, 'radar.showAll')} ${group.cards.length}` : tr(options, 'radar.showLess');
      };
      toggle.addEventListener('click', onToggle);
      removeListeners.push(() => toggle.removeEventListener('click', onToggle));
    }
    sourceMeta(wrapper, group.section.source, options);
    if (group.category === 'WATCHLIST') {
      const actions = append(wrapper, 'div', 'global-radar__section-actions');
      const manage = append(actions, 'button', 'global-radar__action', tr(options, 'radar.addWatchlist')) as HTMLButtonElement;
      manage.type = 'button';
      manage.dataset.radarManageWatchlist = '';
      const onManage = (): void => options.onManageWatchlist?.();
      manage.addEventListener('click', onManage);
      removeListeners.push(() => manage.removeEventListener('click', onManage));
      const research = append(actions, 'button', 'global-radar__action global-radar__action--secondary', tr(options, 'radar.openStockResearch')) as HTMLButtonElement;
      research.type = 'button';
      research.dataset.radarOpenResearch = '';
      const onResearch = (): void => options.onOpenResearch?.();
      research.addEventListener('click', onResearch);
      removeListeners.push(() => research.removeEventListener('click', onResearch));
    }
  }
  const empty = append(feed, 'p', 'global-radar__empty', tr(options, 'radar.noCategoryObservations'));
  empty.dataset.radarMobileEmpty = '';
  empty.hidden = true;
  tabs.forEach((tab) => {
    const select = (): void => {
      const category = tab.dataset.radarCategoryTab as 'ALL' | RadarCardCategory;
      setSelectedCategory(category, tabs, cards, empty);
      categorySections.forEach((section) => {
        section.hidden = category !== 'ALL' && section.dataset.radarCategory !== category;
      });
    };
    tab.addEventListener('click', select);
    removeListeners.push(() => tab.removeEventListener('click', select));
  });
  setSelectedCategory('ALL', tabs, cards, empty);

  const actions = append(mobile, 'div', 'global-radar__mobile-actions');
  const mapButton = append(actions, 'button', 'global-radar__map-button', tr(options, 'radar.fullMap')) as HTMLButtonElement;
  mapButton.type = 'button';
  mapButton.dataset.radarOpenMap = 'all';
  const openMap = (): void => {
    if (options.onOpenMap) {
      options.onOpenMap({});
    } else {
      mapButton.dispatchEvent(new CustomEvent<GlobalRadarMapRequest>('mymonitor:open-global-map', {
        bubbles: true,
        detail: {},
      }));
    }
  };
  mapButton.addEventListener('click', openMap);
  removeListeners.push(() => mapButton.removeEventListener('click', openMap));
  return mobile;
}

export function mountGlobalRadar(
  host: HTMLElement,
  model: GlobalRadarModel,
  options: GlobalRadarMountOptions = {},
): MountedGlobalRadar {
  const removeListeners: Array<() => void> = [];
  const root = document.createElement('section');
  root.className = 'global-radar';
  root.dataset.globalRadar = '';
  root.tabIndex = -1;
  root.setAttribute('aria-labelledby', 'global-radar-title');
  const heading = append(root, 'header', 'global-radar__header');
  append(heading, 'p', 'global-radar__eyebrow', tr(options, 'radar.eyebrow'));
  append(heading, 'h1', 'global-radar__title', tr(options, 'radar.title')).id = 'global-radar-title';
  append(heading, 'p', 'global-radar__subtitle', tr(options, 'radar.subtitle'));
  const updated = append(heading, 'p', 'global-radar__updated', `${tr(options, 'radar.generated')} ${formatObservationTime(model.generatedAt, options.language ?? DEFAULT_PRODUCT_LANGUAGE) ?? model.generatedAt}`);
  updated.dataset.radarGeneratedAt = model.generatedAt;

  const desktop = renderDesktop(model, options, removeListeners);
  const mobile = renderMobile(model, options, removeListeners);
  root.append(desktop, mobile);
  host.replaceChildren(root);

  const media = typeof window.matchMedia === 'function' ? window.matchMedia(GLOBAL_RADAR_MOBILE_BREAKPOINT) : null;
  const applyViewport = (mobileViewport: boolean): void => {
    desktop.hidden = mobileViewport;
    mobile.hidden = !mobileViewport;
    root.dataset.radarViewport = mobileViewport ? 'mobile' : 'desktop';
  };
  applyViewport(options.mobile ?? media?.matches ?? false);
  if (options.mobile === undefined && media) {
    const onChange = (event: MediaQueryListEvent): void => applyViewport(event.matches);
    media.addEventListener('change', onChange);
    removeListeners.push(() => media.removeEventListener('change', onChange));
  }

  return {
    destroy(): void {
      removeListeners.splice(0).forEach((remove) => remove());
      root.remove();
    },
  };
}
