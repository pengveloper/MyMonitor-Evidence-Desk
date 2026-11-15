import type {
  GlobalRadarCard,
  GlobalRadarModel,
  GlobalRadarSectionView,
  RadarCardSection,
  RadarSectionStatus,
  RadarSource,
} from './global-radar-model.ts';

export type IntelligenceBriefingState = 'LOADING' | 'READY' | 'DEGRADED' | 'UNAVAILABLE';
export type IntelligenceBriefingTopic = 'WORLD' | 'MARKET' | 'SEC' | 'WATCHLIST' | 'DATA';
export type IntelligenceBriefingActionKind =
  | 'WORLD_NEWS'
  | 'MARKET_DETAIL'
  | 'STOCK_RESEARCH'
  | 'SEC_EVIDENCE'
  | 'HISTORICAL_ANALOG'
  | 'ASK_AI'
  | 'WHY_IMPORTANT'
  | 'WATCHLIST_IMPACT';

export interface IntelligenceBriefingSourceState {
  key: RadarCardSection;
  label: string;
  status: RadarSectionStatus | 'LOADING';
  source?: RadarSource;
  note?: string;
}

export interface IntelligenceBriefingItem {
  id: string;
  topic: IntelligenceBriefingTopic;
  label: string;
  text: string;
  status: RadarSectionStatus;
  source?: RadarSource;
  observedAt?: string;
  evidenceCardIds: string[];
  symbols: string[];
}

export interface IntelligenceBriefingAction {
  kind: IntelligenceBriefingActionKind;
  label: string;
  href?: string;
  symbol?: string;
  evidenceCardIds: string[];
}

export interface IntelligenceBriefingSinceLastCheck {
  state: GlobalRadarModel['comparison']['state'] | 'LOADING';
  headline: string;
  detail: string;
  lastCheckedAt?: string;
  items: IntelligenceBriefingItem[];
}

export interface IntelligenceBriefingModel {
  state: IntelligenceBriefingState;
  generatedAt?: string;
  today: IntelligenceBriefingItem[];
  sinceLastCheck: IntelligenceBriefingSinceLastCheck;
  sources: IntelligenceBriefingSourceState[];
  nextActions: IntelligenceBriefingAction[];
}

export interface IntelligenceBriefingInput {
  radar?: GlobalRadarModel | null;
  loading?: boolean;
}

const SECTION_LABELS: Record<RadarCardSection, string> = {
  MARKET: '시장',
  WORLD: '세계',
  MACRO: '거시',
  SEC: '기업/SEC',
  WATCHLIST: '내 종목',
};

function section(model: GlobalRadarModel, key: RadarCardSection): GlobalRadarSectionView | undefined {
  return model.sections.find((candidate) => candidate.key === key);
}

function timestamp(card: GlobalRadarCard): number {
  const value = card.observedAt ?? card.source.observedAt ?? card.source.capturedAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rankedCards(cards: readonly GlobalRadarCard[]): GlobalRadarCard[] {
  const ownerRank = (card: GlobalRadarCard): number => {
    if (card.ownerChange === 'NEW') return 0;
    if (card.evidenceStatus === 'CONFIRMED') return 1;
    if (card.evidenceStatus === 'INSUFFICIENT') return 2;
    return 3;
  };
  return [...cards].sort((left, right) => {
    const rank = ownerRank(left) - ownerRank(right);
    if (rank !== 0) return rank;
    const time = timestamp(right) - timestamp(left);
    return time !== 0 ? time : left.id.localeCompare(right.id);
  });
}

function uniqueSymbols(cards: readonly GlobalRadarCard[]): string[] {
  return [...new Set(cards.flatMap((card) => card.symbols))];
}

function itemFromCard(
  topic: IntelligenceBriefingTopic,
  label: string,
  status: RadarSectionStatus,
  card: GlobalRadarCard,
): IntelligenceBriefingItem {
  return {
    id: `briefing:${card.id}`,
    topic,
    label,
    text: card.detail ? `${card.title} — ${card.detail}` : card.title,
    status,
    source: card.source,
    observedAt: card.observedAt,
    evidenceCardIds: [card.id],
    symbols: card.symbols,
  };
}

function marketObservationText(cards: readonly GlobalRadarCard[]): string {
  return cards.map((card) => {
    const value = card.value ? ` ${card.value}` : '';
    const change = card.detail ? ` · ${card.detail}` : '';
    return `${card.title}${value}${change}`;
  }).join(' / ');
}

function marketPriority(card: GlobalRadarCard): number {
  const text = `${card.title} ${card.id}`;
  if (/S&P|SP500|VIX|변동성/i.test(text)) return 0;
  if (/금리|국채|rate|yield|DGS|FEDFUNDS/i.test(text)) return 1;
  if (/breadth|등락|상승.?종목|하락.?종목/i.test(text)) return 2;
  return 3;
}

function marketItem(model: GlobalRadarModel): IntelligenceBriefingItem | null {
  const market = section(model, 'MARKET');
  const macro = section(model, 'MACRO');
  const cards = [...(market?.cards ?? []), ...(macro?.cards ?? [])]
    .sort((left, right) => marketPriority(left) - marketPriority(right) || timestamp(right) - timestamp(left))
    .slice(0, 4);
  if (cards.length === 0) return null;
  const status = market?.status === 'UNAVAILABLE' && macro?.status === 'UNAVAILABLE'
    ? 'UNAVAILABLE'
    : market?.status === 'AVAILABLE' && macro?.status === 'AVAILABLE'
      ? 'AVAILABLE'
      : 'STALE';
  const first = cards[0]!;
  return {
    id: 'briefing:market-macro',
    topic: 'MARKET',
    label: '시장·거시',
    text: marketObservationText(cards),
    status,
    source: first.source,
    observedAt: first.observedAt,
    evidenceCardIds: cards.map((card) => card.id),
    symbols: uniqueSymbols(cards),
  };
}

function unavailableSummary(sources: readonly IntelligenceBriefingSourceState[]): IntelligenceBriefingItem | null {
  const affected = sources.filter((source) => source.status === 'STALE' || source.status === 'UNAVAILABLE');
  if (affected.length === 0) return null;
  return {
    id: 'briefing:data-state',
    topic: 'DATA',
    label: '데이터 상태',
    text: affected.map((source) => {
      const status = source.status === 'STALE' ? '지연' : '사용 불가';
      return `${source.label} ${status}${source.note ? ` · ${source.note}` : ''}`;
    }).join(' / '),
    status: affected.some((source) => source.status === 'UNAVAILABLE') ? 'UNAVAILABLE' : 'STALE',
    evidenceCardIds: [],
    symbols: [],
  };
}

function sourceStates(model: GlobalRadarModel): IntelligenceBriefingSourceState[] {
  return (['WORLD', 'MARKET', 'MACRO', 'SEC', 'WATCHLIST'] as const).map((key) => {
    const value = section(model, key);
    return {
      key,
      label: SECTION_LABELS[key],
      status: value?.status ?? 'UNAVAILABLE',
      ...(value?.source ? { source: value.source } : {}),
      ...(value?.unavailableReason ? { note: value.unavailableReason } : {}),
    };
  });
}

function ownerChangeItem(card: GlobalRadarCard, model: GlobalRadarModel): IntelligenceBriefingItem {
  const sourceSection = section(model, card.section);
  const topic: IntelligenceBriefingTopic = card.section === 'WORLD'
    ? 'WORLD'
    : card.section === 'SEC'
      ? 'SEC'
      : card.section === 'WATCHLIST'
        ? 'WATCHLIST'
        : 'MARKET';
  return itemFromCard(topic, SECTION_LABELS[card.section], sourceSection?.status ?? 'UNAVAILABLE', card);
}

function safeSymbol(cards: readonly GlobalRadarCard[], sectionKey?: RadarCardSection): string | undefined {
  return cards.find((card) => (!sectionKey || card.section === sectionKey) && card.symbols.length > 0)?.symbols[0];
}

function actions(model: GlobalRadarModel): IntelligenceBriefingAction[] {
  const world = section(model, 'WORLD')?.cards ?? [];
  const market = [...(section(model, 'MARKET')?.cards ?? []), ...(section(model, 'MACRO')?.cards ?? [])];
  const sec = section(model, 'SEC')?.cards ?? [];
  const watchlist = section(model, 'WATCHLIST')?.cards ?? [];
  const symbol = safeSymbol(sec, 'SEC') ?? safeSymbol(watchlist, 'WATCHLIST') ?? safeSymbol(world);
  const result: IntelligenceBriefingAction[] = [];
  if (world.length > 0) {
    result.push({
      kind: 'WORLD_NEWS', label: '관련 세계 뉴스 보기', href: '#panelsGrid',
      evidenceCardIds: world.slice(0, 3).map((card) => card.id),
    });
  }
  if (market.length > 0) {
    result.push({
      kind: 'MARKET_DETAIL', label: '시장 상세 보기', href: '#panelsGrid',
      evidenceCardIds: market.slice(0, 4).map((card) => card.id),
    });
  }
  if (symbol) {
    const encoded = encodeURIComponent(symbol);
    result.push({ kind: 'STOCK_RESEARCH', label: `${symbol} 종목 연구`, href: `/stocks/${encoded}`, symbol, evidenceCardIds: [] });
  }
  const secSymbol = safeSymbol(sec, 'SEC');
  if (secSymbol) {
    const encoded = encodeURIComponent(secSymbol);
    const evidenceIds = sec.filter((card) => card.symbols.includes(secSymbol)).map((card) => card.id);
    result.push(
      { kind: 'SEC_EVIDENCE', label: '새 SEC 근거 보기', href: `/stocks/${encoded}#ticker-360-evidence`, symbol: secSymbol, evidenceCardIds: evidenceIds },
      { kind: 'HISTORICAL_ANALOG', label: '과거 유사 사례 보기', href: `/stocks/${encoded}#ticker-360-cases`, symbol: secSymbol, evidenceCardIds: evidenceIds },
    );
  }
  return result;
}

function loadingModel(): IntelligenceBriefingModel {
  return {
    state: 'LOADING',
    today: [],
    sinceLastCheck: {
      state: 'LOADING',
      headline: '현재 관측 데이터를 불러오는 중입니다.',
      detail: '출처 상태를 확인한 뒤 지난 확인 기준과 비교합니다.',
      items: [],
    },
    sources: (['WORLD', 'MARKET', 'MACRO', 'SEC', 'WATCHLIST'] as const).map((key) => ({
      key, label: SECTION_LABELS[key], status: 'LOADING',
    })),
    nextActions: [],
  };
}

/**
 * A deterministic, compact projection of Global Radar evidence for the top of
 * the control room. It summarizes observations; it never scores importance,
 * predicts an outcome, or recommends a trade.
 */
export function buildIntelligenceBriefing(input: IntelligenceBriefingInput): IntelligenceBriefingModel {
  if (input.loading || !input.radar) return loadingModel();
  const model = input.radar;
  const sources = sourceStates(model);
  const today: IntelligenceBriefingItem[] = [];
  const worldSection = section(model, 'WORLD');
  const world = rankedCards(worldSection?.cards ?? [])[0];
  if (world && worldSection) today.push(itemFromCard('WORLD', '세계', worldSection.status, world));
  const market = marketItem(model);
  if (market) today.push(market);
  const secSection = section(model, 'SEC');
  const sec = rankedCards(secSection?.cards ?? [])[0];
  if (sec && secSection) today.push(itemFromCard('SEC', '기업/SEC', secSection.status, sec));
  const watchlistSection = section(model, 'WATCHLIST');
  const watchlist = rankedCards(watchlistSection?.cards ?? [])[0];
  if (watchlist && watchlistSection) today.push(itemFromCard('WATCHLIST', '내 종목', watchlistSection.status, watchlist));
  const dataState = unavailableSummary(sources);
  if (dataState) today.push(dataState);

  const unavailableCount = sources.filter((source) => source.status === 'UNAVAILABLE').length;
  const degraded = sources.some((source) => source.status === 'STALE' || source.status === 'UNAVAILABLE');
  return {
    state: unavailableCount === sources.length ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY',
    generatedAt: model.generatedAt,
    today,
    sinceLastCheck: {
      state: model.comparison.state,
      headline: model.comparison.headline,
      detail: model.comparison.detail,
      ...(model.comparison.lastCheckedAt ? { lastCheckedAt: model.comparison.lastCheckedAt } : {}),
      items: model.lastCheckCards.slice(0, 4).map((card) => ownerChangeItem(card, model)),
    },
    sources,
    nextActions: actions(model),
  };
}
