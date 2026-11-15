import {
  riskChangeCheckpointView,
  type RiskChangeCheckpointView,
  type RiskChangeStorage,
} from '../stock-research/risk-change-checkpoint.ts';
import type { RiskTicket, RiskTicketType } from '../stock-research/risk-ticket-model.ts';
import {
  globalRadarBaselineCandidateFromCard,
  globalRadarCheckpointView,
  type GlobalRadarBaselineCandidate,
  type GlobalRadarCheckpointStorage,
} from './global-radar-checkpoint.ts';
import {
  matchOwnerWatchlistLinks,
  type WatchlistStockLink,
} from './watchlist-linkage.ts';
import type { MarketWatchlistEntry } from '@/services/market-watchlist';
import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import { DEFAULT_PRODUCT_LANGUAGE } from '@/services/i18n-policy';

export const GLOBAL_RADAR_PREVIEW_SCHEMA_VERSION = 'mymonitor-global-radar-preview/v1' as const;

export type RadarSourceMode = 'LIVE' | 'PUBLIC_SNAPSHOT' | 'STALE' | 'UNAVAILABLE';
export type RadarSectionStatus = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
export type RadarCardCategory = 'MARKET' | 'WORLD' | 'SEC' | 'WATCHLIST';
export type RadarCardSection = RadarCardCategory | 'MACRO';
export type RadarOwnerComparison =
  | 'NEW_CONFIRMED_EVIDENCE'
  | 'NEW_INSUFFICIENT'
  | 'UNCHANGED'
  | 'FIRST_CHECK'
  | 'NOT_COMPARABLE';
export type RadarOwnerChange = 'NEW' | 'UNCHANGED' | 'FIRST_CHECK';

export interface RadarSource {
  id: string;
  label: string;
  mode: RadarSourceMode;
  observedAt?: string;
  capturedAt: string;
  href?: string;
}

export interface RadarUnavailableSource {
  id: string;
  label?: string;
  reason: string;
  attemptedAt?: string;
}

export interface RadarSection<T> {
  status: RadarSectionStatus;
  source: RadarSource;
  items: T[];
  unavailableReason?: string;
  unavailableSources?: RadarUnavailableSource[];
}

export interface RadarMarketObservation {
  id: string;
  symbol: string;
  label: string;
  value: string;
  changePercent?: number;
  changeLabel?: string;
  previousValue?: string;
  previousObservedAt?: string;
  referenceLabel?: string;
  observedAt: string;
  source?: RadarSource;
}

export interface RadarMacroObservation {
  id: string;
  label: string;
  value: string;
  changeLabel?: string;
  previousValue?: string;
  referenceObservedAt?: string;
  observedAt: string;
  source?: RadarSource;
}

export interface RadarGlobalEvent {
  id: string;
  title: string;
  summary?: string;
  translation?: RadarEventTranslation;
  region?: string;
  symbols?: string[];
  observedAt: string;
  /** Only a retained per-item retrieval timestamp; never the preview assembly time. */
  fetchedAt?: string;
  publishedAt?: string;
  timeSemantic?: 'GDELT_SEEN_AT' | 'ARTICLE_PUBLISHED_AT';
  source?: RadarSource;
}

export type RadarTranslationStatus = 'PENDING' | 'TRANSLATED' | 'ORIGINAL_KOREAN' | 'UNAVAILABLE';

export interface RadarEventTranslation {
  status: RadarTranslationStatus;
  targetLocale: 'ko';
  sourceLocale: string;
  title?: string;
  summary?: string;
  contentHash: string;
  glossaryRevision: string;
  promptVersion: string;
  provider?: string;
  model?: string;
  cache: 'HIT' | 'MISS' | 'BYPASS';
  translatedAt?: string;
  reason?: 'REQUIRED_TRANSLATION_CONFIGURATION' | 'VALIDATION_REJECTED' | 'BUDGET_EXHAUSTED' | 'BATCH_DEFERRED';
}

export interface RadarWatchlistObservation {
  id: string;
  symbol: string;
  title: string;
  detail?: string;
  observedAt: string;
  source?: RadarSource;
}

/**
 * Thin UI projection contract for the bounded preview data plane. It contains
 * observations only; it does not claim that an observation is new to the
 * owner. SEC owner-relative change is computed from the existing Risk
 * checkpoint model below.
 */
export interface GlobalRadarPreviewPayload {
  schemaVersion: typeof GLOBAL_RADAR_PREVIEW_SCHEMA_VERSION;
  generatedAt: string;
  market: RadarSection<RadarMarketObservation>;
  macro: RadarSection<RadarMacroObservation>;
  globalEvents: RadarSection<RadarGlobalEvent>;
  watchlist: RadarSection<RadarWatchlistObservation>;
}

export interface GlobalRadarInput {
  preview: GlobalRadarPreviewPayload;
  riskTickets?: readonly RiskTicket[];
  riskStorage?: RiskChangeStorage | null;
  radarStorage?: GlobalRadarCheckpointStorage | null;
  ownerWatchlist?: readonly MarketWatchlistEntry[];
  language?: string;
}

export interface GlobalRadarCard {
  id: string;
  section: RadarCardSection;
  category: RadarCardCategory;
  title: string;
  detail?: string;
  originalTitle?: string;
  originalDetail?: string;
  translation?: RadarEventTranslation;
  value?: string;
  /** Factual change relative to the card's named reference, never an importance score. */
  changePercent?: number;
  observedAt?: string;
  publishedAt?: string;
  timeSemantic?: 'GDELT_SEEN_AT' | 'ARTICLE_PUBLISHED_AT';
  source: RadarSource;
  symbols: string[];
  region?: string;
  href?: string;
  stockLinks?: WatchlistStockLink[];
  originCardId?: string;
  evidenceStatus?: 'CONFIRMED' | 'INSUFFICIENT';
  ownerComparison: RadarOwnerComparison;
  ownerChange?: RadarOwnerChange;
}

export interface GlobalRadarSectionView {
  key: RadarCardSection;
  title: string;
  status: RadarSectionStatus;
  source: RadarSource;
  unavailableReason?: string;
  unavailableSources?: RadarUnavailableSource[];
  emptyLabel?: string;
  cards: GlobalRadarCard[];
}

export interface GlobalRadarComparisonSummary {
  state: 'FIRST_CHECK' | 'NEW_EVIDENCE' | 'UNCHANGED' | 'UNAVAILABLE';
  headline: string;
  detail: string;
  newConfirmed: number;
  newNeedsReview: number;
  newItems: number;
  lastCheckedAt?: string;
}

export interface GlobalRadarModel {
  generatedAt: string;
  comparison: GlobalRadarComparisonSummary;
  baselineCandidates: GlobalRadarBaselineCandidate[];
  lastCheckCards: GlobalRadarCard[];
  importantCards: GlobalRadarCard[];
  mobileCards: GlobalRadarCard[];
  worldOverview: GlobalRadarWorldOverviewGroup[];
  sections: GlobalRadarSectionView[];
}

export interface GlobalRadarWorldOverviewGroup {
  key: 'MIDDLE_EAST' | 'EUROPE' | 'ASIA_PACIFIC' | 'AMERICAS' | 'AFRICA' | 'OTHER';
  title: string;
  cards: GlobalRadarCard[];
}

const RISK_TYPE_KEYS: Record<RiskTicketType, MyMonitorTranslationKey> = {
  ATM: 'risk.type.atm',
  OFFERING: 'risk.type.offering',
  DILUTION: 'risk.type.dilution',
  SHARES_OUTSTANDING: 'risk.type.sharesOutstanding',
  REVERSE_SPLIT: 'risk.type.reverseSplit',
  LISTING_COMPLIANCE: 'risk.type.listingCompliance',
  WARRANT_OR_PREFERRED: 'risk.type.warrantPreferred',
};

type RadarTranslate = (key: MyMonitorTranslationKey) => string;

function exactTimestamp(value: string): boolean {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validObservationTime(value: string): boolean {
  return exactTimestamp(value) || calendarDate(value);
}

function requiredText(value: unknown, field: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.length > maxLength) {
    throw new Error(`${field} must be non-empty, trimmed text`);
  }
  return value;
}

function optionalText(value: unknown, field: string, maxLength = 512): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field, maxLength);
}

function safeHttpUrl(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const text = requiredText(value, field, 2048);
  const parsed = new URL(text);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${field} must use http or https`);
  }
  return parsed.toString();
}

function sourceFromUnknown(value: unknown, field: string): RadarSource {
  if (!value || typeof value !== 'object') throw new Error(`${field} is required`);
  const source = value as Record<string, unknown>;
  const mode = source.mode;
  if (mode !== 'LIVE' && mode !== 'PUBLIC_SNAPSHOT' && mode !== 'STALE' && mode !== 'UNAVAILABLE') {
    throw new Error(`${field}.mode is invalid`);
  }
  const capturedAt = requiredText(source.capturedAt, `${field}.capturedAt`);
  if (!exactTimestamp(capturedAt)) throw new Error(`${field}.capturedAt must be an exact UTC timestamp`);
  const observedAt = optionalText(source.observedAt, `${field}.observedAt`);
  if (observedAt && !validObservationTime(observedAt)) {
    throw new Error(`${field}.observedAt must be an ISO date or exact UTC timestamp`);
  }
  return {
    id: requiredText(source.id, `${field}.id`, 128),
    label: requiredText(source.label, `${field}.label`, 256),
    mode,
    ...(observedAt ? { observedAt } : {}),
    capturedAt,
    ...(source.href === undefined ? {} : { href: safeHttpUrl(source.href, `${field}.href`)! }),
  };
}

function sectionFromUnknown<T>(
  value: unknown,
  field: string,
  itemParser: (item: unknown, field: string) => T,
): RadarSection<T> {
  if (!value || typeof value !== 'object') throw new Error(`${field} is required`);
  const section = value as Record<string, unknown>;
  const status = section.status;
  if (status !== 'AVAILABLE' && status !== 'STALE' && status !== 'UNAVAILABLE') {
    throw new Error(`${field}.status is invalid`);
  }
  if (!Array.isArray(section.items)) throw new Error(`${field}.items must be an array`);
  const unavailableReason = optionalText(section.unavailableReason, `${field}.unavailableReason`);
  const unavailableSources = section.unavailableSources === undefined
    ? undefined
    : parseUnavailableSources(section.unavailableSources, `${field}.unavailableSources`);
  if (status === 'UNAVAILABLE' && !unavailableReason) {
    throw new Error(`${field}.unavailableReason is required when unavailable`);
  }
  const source = sourceFromUnknown(section.source, `${field}.source`);
  if (status === 'UNAVAILABLE' && source.mode !== 'UNAVAILABLE') {
    throw new Error(`${field}.source must also be unavailable`);
  }
  if (status !== 'UNAVAILABLE' && source.mode === 'UNAVAILABLE') {
    throw new Error(`${field}.source cannot be unavailable when the section is available`);
  }
  if (status === 'STALE' && source.mode !== 'STALE') {
    throw new Error(`${field}.source must be stale when the section is stale`);
  }
  const items = section.items.map((item, index) => itemParser(item, `${field}.items[${index}]`));
  const itemIds = new Set<string>();
  for (const [index, item] of items.entries()) {
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string' || itemIds.has(id)) throw new Error(`${field}.items[${index}].id must be unique`);
    itemIds.add(id);
  }
  return {
    status,
    source,
    items,
    ...(unavailableReason ? { unavailableReason } : {}),
    ...(unavailableSources ? { unavailableSources } : {}),
  };
}

function parseUnavailableSources(value: unknown, field: string): RadarUnavailableSource[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((entry, index) => {
    const item = itemRecord(entry, `${field}[${index}]`);
    const attemptedAt = optionalText(item.attemptedAt, `${field}[${index}].attemptedAt`);
    if (attemptedAt && !exactTimestamp(attemptedAt)) {
      throw new Error(`${field}[${index}].attemptedAt must be an exact UTC timestamp`);
    }
    return {
      id: requiredText(item.id, `${field}[${index}].id`, 128),
      ...(item.label === undefined ? {} : { label: requiredText(item.label, `${field}[${index}].label`, 256) }),
      reason: requiredText(item.reason, `${field}[${index}].reason`, 256),
      ...(attemptedAt ? { attemptedAt } : {}),
    };
  });
}

function itemRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function itemObservedAt(item: Record<string, unknown>, field: string): string {
  const observedAt = requiredText(item.observedAt, `${field}.observedAt`);
  if (!validObservationTime(observedAt)) throw new Error(`${field}.observedAt is invalid`);
  return observedAt;
}

function optionalSource(item: Record<string, unknown>, field: string): RadarSource | undefined {
  return item.source === undefined ? undefined : sourceFromUnknown(item.source, `${field}.source`);
}

function parseMarketItem(value: unknown, field: string): RadarMarketObservation {
  const item = itemRecord(value, field);
  const source = optionalSource(item, field);
  const changePercent = item.changePercent;
  if (changePercent !== undefined && (typeof changePercent !== 'number' || !Number.isFinite(changePercent))) {
    throw new Error(`${field}.changePercent must be finite`);
  }
  return {
    id: requiredText(item.id, `${field}.id`, 128),
    symbol: requiredText(item.symbol, `${field}.symbol`, 32),
    label: requiredText(item.label, `${field}.label`, 128),
    value: requiredText(item.value, `${field}.value`, 128),
    ...(changePercent === undefined ? {} : { changePercent }),
    ...(item.changeLabel === undefined ? {} : { changeLabel: requiredText(item.changeLabel, `${field}.changeLabel`, 128) }),
    ...(item.previousValue === undefined ? {} : { previousValue: requiredText(item.previousValue, `${field}.previousValue`, 128) }),
    ...(item.previousObservedAt === undefined ? {} : { previousObservedAt: requiredText(item.previousObservedAt, `${field}.previousObservedAt`, 32) }),
    ...(item.referenceLabel === undefined ? {} : { referenceLabel: requiredText(item.referenceLabel, `${field}.referenceLabel`, 128) }),
    observedAt: itemObservedAt(item, field),
    ...(source ? { source } : {}),
  };
}

function parseMacroItem(value: unknown, field: string): RadarMacroObservation {
  const item = itemRecord(value, field);
  const source = optionalSource(item, field);
  return {
    id: requiredText(item.id, `${field}.id`, 128),
    label: requiredText(item.label, `${field}.label`, 128),
    value: requiredText(item.value, `${field}.value`, 128),
    ...(item.changeLabel === undefined ? {} : { changeLabel: requiredText(item.changeLabel, `${field}.changeLabel`, 128) }),
    ...(item.previousValue === undefined ? {} : { previousValue: requiredText(item.previousValue, `${field}.previousValue`, 128) }),
    ...(item.referenceObservedAt === undefined ? {} : { referenceObservedAt: requiredText(item.referenceObservedAt, `${field}.referenceObservedAt`, 32) }),
    observedAt: itemObservedAt(item, field),
    ...(source ? { source } : {}),
  };
}

function parseSymbols(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((symbol, index) => requiredText(symbol, `${field}[${index}]`, 32));
}

function parseGlobalEvent(value: unknown, field: string): RadarGlobalEvent {
  const item = itemRecord(value, field);
  const source = optionalSource(item, field);
  const publishedAt = optionalText(item.publishedAt, `${field}.publishedAt`);
  const fetchedAt = optionalText(item.fetchedAt, `${field}.fetchedAt`);
  if (fetchedAt && !exactTimestamp(fetchedAt)) {
    throw new Error(`${field}.fetchedAt must be an exact UTC timestamp`);
  }
  if (publishedAt && !exactTimestamp(publishedAt)) {
    throw new Error(`${field}.publishedAt must be an exact UTC timestamp`);
  }
  const timeSemantic = item.timeSemantic;
  if (timeSemantic !== undefined && timeSemantic !== 'GDELT_SEEN_AT' && timeSemantic !== 'ARTICLE_PUBLISHED_AT') {
    throw new Error(`${field}.timeSemantic is invalid`);
  }
  return {
    id: requiredText(item.id, `${field}.id`, 2048),
    title: requiredText(item.title, `${field}.title`, 320),
    ...(item.summary === undefined ? {} : { summary: requiredText(item.summary, `${field}.summary`, 768) }),
    ...(item.translation && typeof item.translation === 'object'
      ? { translation: item.translation as RadarEventTranslation }
      : {}),
    ...(item.region === undefined ? {} : { region: requiredText(item.region, `${field}.region`, 128) }),
    ...(item.symbols === undefined ? {} : { symbols: parseSymbols(item.symbols, `${field}.symbols`)! }),
    observedAt: itemObservedAt(item, field),
    ...(publishedAt ? { publishedAt } : {}),
    ...(fetchedAt ? { fetchedAt } : {}),
    ...(timeSemantic ? { timeSemantic } : {}),
    ...(source ? { source } : {}),
  };
}

function parseWatchlistItem(value: unknown, field: string): RadarWatchlistObservation {
  const item = itemRecord(value, field);
  const source = optionalSource(item, field);
  return {
    id: requiredText(item.id, `${field}.id`, 128),
    symbol: requiredText(item.symbol, `${field}.symbol`, 32),
    title: requiredText(item.title, `${field}.title`, 256),
    ...(item.detail === undefined ? {} : { detail: requiredText(item.detail, `${field}.detail`, 768) }),
    observedAt: itemObservedAt(item, field),
    ...(source ? { source } : {}),
  };
}

/** Runtime boundary for data supplied by the preview Worker. */
export function parseGlobalRadarPreviewPayload(value: unknown): GlobalRadarPreviewPayload {
  if (!value || typeof value !== 'object') throw new Error('global radar preview payload is required');
  const payload = value as Record<string, unknown>;
  if (payload.schemaVersion !== GLOBAL_RADAR_PREVIEW_SCHEMA_VERSION) {
    throw new Error('global radar preview schema version is unsupported');
  }
  const generatedAt = requiredText(payload.generatedAt, 'global radar generatedAt');
  if (!exactTimestamp(generatedAt)) throw new Error('global radar generatedAt must be an exact UTC timestamp');
  return {
    schemaVersion: GLOBAL_RADAR_PREVIEW_SCHEMA_VERSION,
    generatedAt,
    market: sectionFromUnknown(payload.market, 'market', parseMarketItem),
    macro: sectionFromUnknown(payload.macro, 'macro', parseMacroItem),
    globalEvents: sectionFromUnknown(payload.globalEvents, 'globalEvents', parseGlobalEvent),
    watchlist: sectionFromUnknown(payload.watchlist, 'watchlist', parseWatchlistItem),
  };
}

function itemSource(itemSource: RadarSource | undefined, sectionSource: RadarSource): RadarSource {
  return itemSource ?? sectionSource;
}

function marketCards(section: RadarSection<RadarMarketObservation>, tr: RadarTranslate): GlobalRadarCard[] {
  return section.items.map((item) => {
    const change = item.changePercent;
    const changeLabel = change === undefined ? undefined : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
    return {
      id: `market:${item.id}`,
      section: 'MARKET',
      category: 'MARKET',
      title: `${item.label} (${item.symbol})`,
      detail: item.changeLabel ?? (changeLabel
        ? `${item.referenceLabel ?? tr('radar.previousObservation')} ${changeLabel}`
        : tr('radar.currentObservation')),
      value: item.value,
      ...(change === undefined ? {} : { changePercent: change }),
      observedAt: item.observedAt,
      source: itemSource(item.source, section.source),
      symbols: [item.symbol],
      href: '#global-radar-section-market',
      ownerComparison: 'NOT_COMPARABLE',
    } satisfies GlobalRadarCard;
  });
}

function macroCards(section: RadarSection<RadarMacroObservation>, tr: RadarTranslate): GlobalRadarCard[] {
  return section.items.map((item) => ({
    id: `macro:${item.id}`,
    section: 'MACRO',
    category: 'MARKET',
    title: item.label,
    detail: item.changeLabel ?? tr('radar.currentObservation'),
    value: item.value,
    observedAt: item.observedAt,
    source: itemSource(item.source, section.source),
    symbols: [],
    href: '#global-radar-section-macro',
    ownerComparison: 'NOT_COMPARABLE',
  }));
}

function globalEventCards(section: RadarSection<RadarGlobalEvent>, language: string): GlobalRadarCard[] {
  return section.items.map((item) => {
    const originalIsKorean = /[가-힣]/.test(item.title) && (!item.summary || /[가-힣]/.test(item.summary));
    const translated = language !== 'ko'
      || originalIsKorean
      || item.translation?.status === 'TRANSLATED' || item.translation?.status === 'ORIGINAL_KOREAN';
    const title = language !== 'ko'
      ? item.title
      : translated
      ? item.translation?.title ?? item.title
      : item.title;
    const detail = language !== 'ko'
      ? item.summary
      : translated
      ? item.translation?.summary ?? item.summary
      : item.summary;
    return ({
    id: `world:${item.id}`,
    section: 'WORLD',
    category: 'WORLD',
    title,
    ...(detail ? { detail } : {}),
    originalTitle: item.title,
    ...(item.summary ? { originalDetail: item.summary } : {}),
    ...(item.translation ? { translation: item.translation } : {}),
    observedAt: item.observedAt,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    ...(item.timeSemantic ? { timeSemantic: item.timeSemantic } : {}),
    source: itemSource(item.source, section.source),
    symbols: item.symbols ?? [],
    ...(item.region ? { region: item.region } : {}),
    ...(item.source?.href ? { href: item.source.href } : {}),
    ownerComparison: 'NOT_COMPARABLE',
    });
  });
}

const WORLD_REGION_COUNTRIES = {
  MIDDLE_EAST: new Set([
    'bahrain', 'egypt', 'iran', 'iraq', 'israel', 'jordan', 'kuwait', 'lebanon', 'oman',
    'palestine', 'qatar', 'saudi arabia', 'syria', 'turkey', 'türkiye', 'united arab emirates', 'yemen',
  ]),
  EUROPE: new Set([
    'albania', 'austria', 'belarus', 'belgium', 'bosnia', 'bulgaria', 'croatia', 'cyprus',
    'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary',
    'iceland', 'ireland', 'italy', 'latvia', 'lithuania', 'moldova', 'netherlands', 'norway',
    'poland', 'portugal', 'romania', 'russia', 'serbia', 'slovakia', 'slovenia', 'spain',
    'sweden', 'switzerland', 'ukraine', 'united kingdom',
  ]),
  ASIA_PACIFIC: new Set([
    'australia', 'bangladesh', 'china', 'hong kong', 'india', 'indonesia', 'japan', 'malaysia',
    'myanmar', 'new zealand', 'north korea', 'pakistan', 'philippines', 'singapore', 'south korea',
    'sri lanka', 'taiwan', 'thailand', 'vietnam',
  ]),
  AMERICAS: new Set([
    'argentina', 'bolivia', 'brazil', 'canada', 'chile', 'colombia', 'costa rica', 'cuba',
    'ecuador', 'el salvador', 'guatemala', 'haiti', 'honduras', 'mexico', 'nicaragua', 'panama',
    'paraguay', 'peru', 'united states', 'uruguay', 'venezuela',
  ]),
  AFRICA: new Set([
    'algeria', 'angola', 'cameroon', 'democratic republic of the congo', 'ethiopia', 'ghana',
    'kenya', 'libya', 'mali', 'morocco', 'mozambique', 'nigeria', 'somalia', 'south africa',
    'sudan', 'tanzania', 'tunisia', 'uganda', 'zimbabwe',
  ]),
} as const;

function worldRegionKey(region: string | undefined): GlobalRadarWorldOverviewGroup['key'] {
  const normalized = region?.trim().toLowerCase() ?? '';
  if (!normalized) return 'OTHER';
  for (const [key, countries] of Object.entries(WORLD_REGION_COUNTRIES)) {
    if ((countries as ReadonlySet<string>).has(normalized)) {
      return key as keyof typeof WORLD_REGION_COUNTRIES;
    }
  }
  if (/middle east|gulf|mena/.test(normalized)) return 'MIDDLE_EAST';
  if (/europe/.test(normalized)) return 'EUROPE';
  if (/asia|pacific|oceania/.test(normalized)) return 'ASIA_PACIFIC';
  if (/america|caribbean/.test(normalized)) return 'AMERICAS';
  if (/africa/.test(normalized)) return 'AFRICA';
  return 'OTHER';
}

const WORLD_REGION_LABEL_KEYS = {
  MIDDLE_EAST: 'radar.region.middleEast',
  EUROPE: 'radar.region.europe',
  ASIA_PACIFIC: 'radar.region.asiaPacific',
  AMERICAS: 'radar.region.americas',
  AFRICA: 'radar.region.africa',
  OTHER: 'radar.region.other',
} as const satisfies Record<GlobalRadarWorldOverviewGroup['key'], MyMonitorTranslationKey>;

function worldOverviewGroups(
  cards: readonly GlobalRadarCard[],
  tr: RadarTranslate,
): GlobalRadarWorldOverviewGroup[] {
  const groups = new Map<GlobalRadarWorldOverviewGroup['key'], GlobalRadarCard[]>();
  for (const card of cards) {
    const key = worldRegionKey(card.region);
    const group = groups.get(key) ?? [];
    group.push(card);
    groups.set(key, group);
  }
  const order: GlobalRadarWorldOverviewGroup['key'][] = [
    'MIDDLE_EAST', 'EUROPE', 'ASIA_PACIFIC', 'AMERICAS', 'AFRICA', 'OTHER',
  ];
  return order.flatMap((key) => {
    const group = groups.get(key);
    return group?.length ? [{ key, title: tr(WORLD_REGION_LABEL_KEYS[key]), cards: group.slice(0, 2) }] : [];
  });
}

function watchlistCards(section: RadarSection<RadarWatchlistObservation>): GlobalRadarCard[] {
  return section.items.map((item) => ({
    id: `watchlist:${item.id}`,
    section: 'WATCHLIST',
    category: 'WATCHLIST',
    title: `${item.symbol} · ${item.title}`,
    ...(item.detail ? { detail: item.detail } : {}),
    observedAt: item.observedAt,
    source: itemSource(item.source, section.source),
    symbols: [item.symbol],
    href: `/stocks/${encodeURIComponent(item.symbol)}`,
    ownerComparison: 'NOT_COMPARABLE',
  }));
}

function sourceFromRiskChange(change: Extract<RiskChangeCheckpointView, { state: 'COMPARED' }>['unchanged'][number]): RadarSource {
  return {
    id: change.source.evidenceId,
    label: `${change.source.provider} · ${change.source.dataset}`,
    mode: change.source.deliveryProvenance === 'PUBLIC_SNAPSHOT' ? 'PUBLIC_SNAPSHOT' : 'LIVE',
    observedAt: change.identity.knownAt,
    capturedAt: change.source.fetchedAt ?? change.identity.knownAt,
    ...(change.source.href ? { href: change.source.href } : {}),
  };
}

function riskCard(
  symbol: string,
  change: Extract<RiskChangeCheckpointView, { state: 'COMPARED' }>['unchanged'][number],
  ownerComparison: Exclude<RadarOwnerComparison, 'NOT_COMPARABLE'>,
  tr: RadarTranslate,
): GlobalRadarCard {
  const status = change.currentStatus === 'CONFIRMED' ? tr('risk.status.confirmed') : tr('risk.status.needsReview');
  return {
    id: `sec:${change.identity.key}`,
    section: 'SEC',
    category: 'SEC',
    title: `${symbol} · ${tr(RISK_TYPE_KEYS[change.identity.riskType])}`,
    detail: status,
    observedAt: change.identity.knownAt,
    source: sourceFromRiskChange(change),
    symbols: [symbol],
    href: `/stocks/${encodeURIComponent(symbol)}`,
    evidenceStatus: change.currentStatus,
    ownerComparison,
  };
}

interface RiskProjection {
  cards: GlobalRadarCard[];
  viewStates: RiskChangeCheckpointView[];
}

function riskCards(
  tickets: readonly RiskTicket[],
  storage: RiskChangeStorage | null,
  tr: RadarTranslate,
): RiskProjection {
  const cards: GlobalRadarCard[] = [];
  const viewStates: RiskChangeCheckpointView[] = [];
  for (const ticket of tickets) {
    try {
      const view = riskChangeCheckpointView(storage, ticket);
      viewStates.push(view);
      if (view.state === 'FIRST_CHECK') {
        cards.push(...view.currentEvidence.map((change) => riskCard(ticket.ticker, change, 'FIRST_CHECK', tr)));
        continue;
      }
      cards.push(...view.newConfirmed.map((change) => riskCard(ticket.ticker, change, 'NEW_CONFIRMED_EVIDENCE', tr)));
      cards.push(...view.newNeedsReview.map((change) => riskCard(ticket.ticker, change, 'NEW_INSUFFICIENT', tr)));
      cards.push(...view.unchanged.map((change) => riskCard(ticket.ticker, change, 'UNCHANGED', tr)));
    } catch {
      // A malformed ticket must not make the rest of Today's data disappear.
      // It is excluded and the aggregate comparison state remains truthful.
    }
  }
  return { cards, viewStates };
}

function candidateKey(candidate: GlobalRadarBaselineCandidate): string {
  return JSON.stringify([
    candidate.category,
    candidate.stableId,
    candidate.observedAt ?? '',
    candidate.watchlistSymbol ?? '',
  ]);
}

function applyOwnerChange(
  cards: readonly GlobalRadarCard[],
  storage: GlobalRadarCheckpointStorage | null,
): {
  cards: GlobalRadarCard[];
  candidates: GlobalRadarBaselineCandidate[];
  state: ReturnType<typeof globalRadarCheckpointView>;
} {
  const candidates = cards.map(globalRadarBaselineCandidateFromCard);
  const state = globalRadarCheckpointView(storage, candidates);
  const newKeys = new Set(state.newItems.map(candidateKey));
  const cardsWithChange = cards.map((card, index) => ({
    ...card,
    ownerChange: state.state === 'FIRST_CHECK'
      ? 'FIRST_CHECK' as const
      : newKeys.has(candidateKey(candidates[index]!))
        ? 'NEW' as const
        : 'UNCHANGED' as const,
  }));
  return { cards: cardsWithChange, candidates, state };
}

function comparisonSummary(
  state: ReturnType<typeof globalRadarCheckpointView>,
  cards: readonly GlobalRadarCard[],
  tr: RadarTranslate,
): GlobalRadarComparisonSummary {
  if (state.state === 'FIRST_CHECK') {
    return {
      state: 'FIRST_CHECK',
      headline: tr('radar.firstCheck'),
      detail: tr('radar.firstCheckDetail'),
      newConfirmed: 0,
      newNeedsReview: 0,
      newItems: 0,
    };
  }
  const newCards = uniqueOriginCards(cards.filter((card) => card.ownerChange === 'NEW'));
  const newConfirmed = newCards.filter((card) => card.section === 'SEC' && card.evidenceStatus === 'CONFIRMED').length;
  const newNeedsReview = newCards.filter((card) => card.section === 'SEC' && card.evidenceStatus === 'INSUFFICIENT').length;
  if (newCards.length > 0) {
    return {
      state: 'NEW_EVIDENCE',
      headline: `${newCards.length}${tr('radar.newItemCount')}`,
      detail: `${tr('radar.lastChecked')} ${state.lastCheckedAt}`,
      newConfirmed,
      newNeedsReview,
      newItems: newCards.length,
      lastCheckedAt: state.lastCheckedAt,
    };
  }
  return {
    state: 'UNCHANGED',
    headline: tr('radar.noGlobalChange'),
    detail: `${tr('radar.lastChecked')} ${state.lastCheckedAt}`,
    newConfirmed: 0,
    newNeedsReview: 0,
    newItems: 0,
    lastCheckedAt: state.lastCheckedAt,
  };
}

function uniqueOriginCards(cards: readonly GlobalRadarCard[]): GlobalRadarCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const identity = card.originCardId ?? card.id;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function linkOwnerWatchlist(
  sourceCards: readonly GlobalRadarCard[],
  ownerWatchlist: readonly MarketWatchlistEntry[],
): { sourceCards: GlobalRadarCard[]; watchlistCards: GlobalRadarCard[] } {
  const linkedSourceCards: GlobalRadarCard[] = [];
  const watchlistCards: GlobalRadarCard[] = [];
  for (const card of sourceCards) {
    const result = matchOwnerWatchlistLinks({ title: card.title, symbols: card.symbols }, ownerWatchlist);
    if (result.state !== 'MATCHED') {
      linkedSourceCards.push(card);
      continue;
    }
    const symbols = [...new Set([...card.symbols, ...result.links.map((link) => link.symbol)])];
    const linked = { ...card, symbols, stockLinks: result.links };
    linkedSourceCards.push(linked);
    watchlistCards.push({
      ...linked,
      id: `watchlist-linked:${card.id}`,
      originCardId: card.id,
      section: 'WATCHLIST',
      category: 'WATCHLIST',
      href: result.links.length === 1 ? result.links[0]!.href : undefined,
    });
  }
  return { sourceCards: linkedSourceCards, watchlistCards };
}

function importantCards(
  risk: GlobalRadarCard[],
  markets: GlobalRadarCard[],
  macro: GlobalRadarCard[],
  world: GlobalRadarCard[],
  watchlist: GlobalRadarCard[],
  limit: number,
): GlobalRadarCard[] {
  const newConfirmed = risk.filter((card) => card.evidenceStatus === 'CONFIRMED');
  const newNeedsReview = risk.filter((card) => card.evidenceStatus === 'INSUFFICIENT');
  const movedMarkets = [...markets].sort((left, right) => {
    return Math.abs(right.changePercent ?? 0) - Math.abs(left.changePercent ?? 0);
  });
  // This is a fixed category order, not an opaque importance score. Within
  // world/macro/watchlist we preserve the upstream's documented order.
  return [...newConfirmed, ...newNeedsReview, ...movedMarkets, ...macro, ...world, ...watchlist].slice(0, limit);
}

function lastCheckCards(cards: readonly GlobalRadarCard[], limit: number): GlobalRadarCard[] {
  const newCards = cards.filter((card) => card.ownerChange === 'NEW');
  const priority = (card: GlobalRadarCard): number => {
    if (card.section === 'SEC' && card.evidenceStatus === 'CONFIRMED') return 0;
    if (card.section === 'WATCHLIST') return 1;
    if (card.section === 'SEC') return 2;
    if (card.section === 'WORLD') return 3;
    return 4;
  };
  return uniqueOriginCards([...newCards].sort((left, right) => {
    const priorityDelta = priority(left) - priority(right);
    if (priorityDelta !== 0) return priorityDelta;
    return Date.parse(right.observedAt ?? '') - Date.parse(left.observedAt ?? '');
  })).slice(0, limit);
}

function mobileFeedCards(
  risk: GlobalRadarCard[],
  markets: GlobalRadarCard[],
  macro: GlobalRadarCard[],
  world: GlobalRadarCard[],
  watchlist: GlobalRadarCard[],
): GlobalRadarCard[] {
  const movedMarkets = [...markets].sort((left, right) => {
    return Math.abs(right.changePercent ?? 0) - Math.abs(left.changePercent ?? 0);
  });
  const allCards = [...world, ...movedMarkets, ...macro, ...risk, ...watchlist];
  const changed = lastCheckCards(allCards, allCards.length);
  if (changed.length > 0) {
    const changedIds = new Set(changed.map((card) => card.id));
    return uniqueOriginCards([...changed, ...allCards.filter((card) => !changedIds.has(card.id))]);
  }
  return uniqueOriginCards([
    ...world,
    ...movedMarkets,
    ...macro,
    ...risk,
    ...watchlist,
  ]);
}

function sectionView<T>(
  key: RadarCardSection,
  title: string,
  section: RadarSection<T>,
  cards: GlobalRadarCard[],
  emptyLabel?: string,
): GlobalRadarSectionView {
  return {
    key,
    title,
    status: section.status,
    source: section.source,
    ...(section.unavailableReason ? { unavailableReason: section.unavailableReason } : {}),
    ...(section.unavailableSources ? { unavailableSources: section.unavailableSources } : {}),
    ...(emptyLabel ? { emptyLabel } : {}),
    cards,
  };
}

export function buildGlobalRadarModel(input: GlobalRadarInput): GlobalRadarModel {
  const language = input.language ?? DEFAULT_PRODUCT_LANGUAGE;
  const tr: RadarTranslate = (key) => translateMyMonitor(key, language);
  const market = marketCards(input.preview.market, tr);
  const macro = macroCards(input.preview.macro, tr);
  const world = globalEventCards(input.preview.globalEvents, language);
  const previewWatchlist = watchlistCards(input.preview.watchlist);
  const risk = riskCards(input.riskTickets ?? [], input.riskStorage ?? null, tr);
  const linkage = linkOwnerWatchlist(
    [...risk.cards, ...world, ...market, ...macro],
    input.ownerWatchlist ?? [],
  );
  const linkedRisk = linkage.sourceCards.filter((card) => card.section === 'SEC');
  const linkedWorld = linkage.sourceCards.filter((card) => card.section === 'WORLD');
  const linkedMarket = linkage.sourceCards.filter((card) => card.section === 'MARKET');
  const linkedMacro = linkage.sourceCards.filter((card) => card.section === 'MACRO');
  const rawWatchlist = [...previewWatchlist, ...linkage.watchlistCards];
  const comparison = applyOwnerChange(
    [...linkedRisk, ...rawWatchlist, ...linkedWorld, ...linkedMarket, ...linkedMacro],
    input.radarStorage ?? null,
  );
  const byId = new Map(comparison.cards.map((card) => [card.id, card]));
  const comparedRisk = linkedRisk.map((card) => byId.get(card.id)!);
  const comparedWatchlist = rawWatchlist.map((card) => byId.get(card.id)!);
  const comparedWorld = linkedWorld.map((card) => byId.get(card.id)!);
  const comparedMarket = linkedMarket.map((card) => byId.get(card.id)!);
  const comparedMacro = linkedMacro.map((card) => byId.get(card.id)!);
  const allComparedCards = comparison.cards;

  return {
    generatedAt: input.preview.generatedAt,
    comparison: comparisonSummary(comparison.state, allComparedCards, tr),
    baselineCandidates: comparison.candidates,
    lastCheckCards: lastCheckCards(allComparedCards, 10),
    importantCards: importantCards(comparedRisk, comparedMarket, comparedMacro, comparedWorld, comparedWatchlist, 5),
    mobileCards: mobileFeedCards(comparedRisk, comparedMarket, comparedMacro, comparedWorld, comparedWatchlist),
    worldOverview: worldOverviewGroups(comparedWorld, tr),
    sections: [
      sectionView('MARKET', tr('radar.section.market'), input.preview.market, comparedMarket),
      sectionView('WORLD', tr('radar.section.world'), input.preview.globalEvents, comparedWorld),
      sectionView('MACRO', tr('radar.section.macro'), input.preview.macro, comparedMacro),
      {
        key: 'SEC',
        title: tr('radar.section.sec'),
        status: risk.viewStates.length > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
        source: {
          id: 'risk-ticket',
          label: tr('radar.riskSource'),
          mode: risk.viewStates.length > 0 ? 'PUBLIC_SNAPSHOT' : 'UNAVAILABLE',
          capturedAt: input.preview.generatedAt,
        },
        ...(risk.viewStates.length > 0 ? {} : { unavailableReason: tr('radar.secUnavailable') }),
        cards: comparedRisk,
      },
      sectionView(
        'WATCHLIST',
        tr('radar.section.watchlist'),
        input.preview.watchlist,
        comparedWatchlist,
        tr(input.ownerWatchlist?.length ? 'radar.watchlistNoMatch' : 'radar.watchlistEmpty'),
      ),
    ],
  };
}
