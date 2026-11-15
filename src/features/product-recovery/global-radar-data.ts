import {
  fetchPreviewData,
  type PreviewDataEnvelope,
  type PreviewDataKind,
  type PreviewEventDatum,
  type PreviewMarketDatum,
} from './preview-data.ts';
import {
  GLOBAL_RADAR_PREVIEW_SCHEMA_VERSION,
  parseGlobalRadarPreviewPayload,
  type GlobalRadarPreviewPayload,
  type RadarSection,
  type RadarSource,
} from './global-radar-model.ts';
import { translateMyMonitor } from '@/locales/mymonitor';
import type { MyMonitorTranslationKey } from '@/locales/mymonitor';
import { DEFAULT_PRODUCT_LANGUAGE, getProductLocale } from '@/services/i18n-policy';
import type { NewsItem } from '@/types';
import { getAllGeoHubs, inferGeoHubsFromTitle } from '@/services/geo-hub-index';

export const GLOBAL_RADAR_PREVIEW_ENDPOINTS = [
  '/api/preview/markets',
  '/api/preview/macro',
  '/api/preview/global-events',
  '/api/preview/news',
] as const;

const DEFAULT_TIMEOUT_MS = 8_000;

export type GlobalRadarLoadResult =
  | { ok: true; payload: GlobalRadarPreviewPayload }
  | { ok: false; reason: 'TIMEOUT' | 'NETWORK_ERROR'; detail: string };

export type GlobalRadarFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function canonicalWorldNewsItems(
  section: GlobalRadarPreviewPayload['globalEvents'],
  language: string = DEFAULT_PRODUCT_LANGUAGE,
): NewsItem[] {
  return section.items.map((item) => {
    const translation = item.translation;
    const source = (item.source?.label ?? section.source.label).split(' · ')[0]!.trim();
    const normalizedRegion = item.region?.trim().toLowerCase();
    const regionHub = normalizedRegion
      ? getAllGeoHubs().find((hub) => hub.country.toLowerCase() === normalizedRegion || hub.name.toLowerCase() === normalizedRegion)
      : undefined;
    const inferredHub = regionHub ?? inferGeoHubsFromTitle(`${item.title} ${item.summary ?? ''}`)[0]?.hub;
    return {
      source,
      title: item.title,
      link: item.source?.href ?? section.source.href ?? '',
      pubDate: new Date(item.publishedAt ?? item.observedAt),
      isAlert: false,
      lang: item.translation?.sourceLocale ?? (language === 'ko' ? 'en' : language),
      ...(inferredHub ? { lat: inferredHub.lat, lon: inferredHub.lon, locationName: inferredHub.name } : {}),
      ...(item.summary ? { snippet: item.summary } : {}),
      ...(translation ? {
        translation: {
          status: translation.status === 'PENDING' ? 'UNAVAILABLE' : translation.status,
          locale: 'ko',
          ...(translation.title ? { title: translation.title } : {}),
          ...(translation.summary ? { snippet: translation.summary } : {}),
          cache: translation.cache,
          ...(translation.reason ? { reason: translation.reason } : {}),
        },
      } : {}),
      freshnessStatus: item.source?.mode === 'STALE' ? 'STALE' : 'FRESH',
      sourceMode: item.source?.id.startsWith('RSS:') ? 'RSS' : 'GDELT',
    };
  });
}

function numberLabel(value: number, unit: string, language: string): string {
  const rendered = new Intl.NumberFormat(getProductLocale(language), { maximumFractionDigits: 4 }).format(value);
  return unit === 'index' ? `${rendered}${language === 'ko' ? ' 지수' : ' index'}` : `${rendered}${unit}`;
}

function comparisonLabel(item: PreviewMarketDatum, language: string): string | undefined {
  if (item.change === null || item.previousValue === null || !item.previousObservedAt) return undefined;
  const deltaValue = item.changeSemantic === 'RELATIVE_PERCENT' ? item.changePercent : item.change;
  if (deltaValue === null) return undefined;
  const delta = `${deltaValue >= 0 ? '+' : ''}${numberLabel(deltaValue, item.changeDisplayUnit, language)}`;
  const previous = numberLabel(item.previousValue, item.unit, language);
  return language === 'ko'
    ? `${item.previousObservedAt} ${previous} 대비 ${delta}`
    : `${delta} vs ${previous} on ${item.previousObservedAt}`;
}

function observedDate(item: PreviewMarketDatum): string {
  return item.observationPrecision === 'DATE_ONLY' ? item.observedAt.slice(0, 10) : item.observedAt;
}

function exactObservation(value: string): string {
  return new Date(value).toISOString();
}

function sourceFor<T>(envelope: PreviewDataEnvelope<T>): RadarSource {
  return {
    id: envelope.source.id,
    label: envelope.source.name,
    mode: envelope.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : envelope.status === 'PARTIAL' ? 'STALE' : 'LIVE',
    ...(envelope.freshness.newestObservedAt ? { observedAt: exactObservation(envelope.freshness.newestObservedAt) } : {}),
    capturedAt: envelope.freshness.fetchedAt,
    href: envelope.source.url,
  };
}

function unavailableSource(id: string, label: string, capturedAt: string): RadarSource {
  return { id, label, mode: 'UNAVAILABLE', capturedAt };
}

function sectionStatus<T>(envelope: PreviewDataEnvelope<T>): RadarSection<T>['status'] {
  return envelope.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : envelope.status === 'PARTIAL' ? 'STALE' : 'AVAILABLE';
}

function availabilityReason<T>(envelope: PreviewDataEnvelope<T>, language: string): string | undefined {
  if (envelope.status !== 'PARTIAL') return undefined;
  const base = translateMyMonitor('radar.partial', language);
  return envelope.unavailable.length > 0 ? `${base} (${envelope.unavailable.length})` : base;
}

const SERIES_LABEL_KEYS: Partial<Record<string, MyMonitorTranslationKey>> = {
  DGS10: 'radar.series.dgs10',
  DTWEXBGS: 'radar.series.dollar',
  FEDFUNDS: 'radar.series.fedFunds',
  CPIAUCSL: 'radar.series.cpi',
  UNRATE: 'radar.series.unemployment',
  T10Y2Y: 'radar.series.yieldSpread',
};

function seriesLabel(item: PreviewMarketDatum, language: string): string {
  const key = SERIES_LABEL_KEYS[item.id];
  return key ? translateMyMonitor(key, language) : item.label;
}

function generatedAt(results: readonly PromiseSettledResult<unknown>[]): string {
  const fetched = results.flatMap((result) => {
    if (result.status !== 'fulfilled') return [];
    return [(result.value as PreviewDataEnvelope<unknown>).freshness.fetchedAt];
  }).sort();
  return fetched[fetched.length - 1] ?? new Date().toISOString();
}

function failedSection<T>(id: string, label: string, capturedAt: string, reason: string): RadarSection<T> {
  return {
    status: 'UNAVAILABLE',
    source: unavailableSource(id, label, capturedAt),
    items: [],
    unavailableReason: reason,
  };
}

async function fetchPreviewSource<T>(
  kind: PreviewDataKind,
  fetcher: GlobalRadarFetch,
  timeoutMs: number,
): Promise<PreviewDataEnvelope<T>> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchPreviewData<T>(kind, {
      fetchImpl: fetcher as typeof fetch,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function marketSection(
  result: PromiseSettledResult<PreviewDataEnvelope<PreviewMarketDatum>>,
  capturedAt: string,
  language: string,
): GlobalRadarPreviewPayload['market'] {
  if (result.status === 'rejected') {
    return failedSection('FRED', 'Federal Reserve Economic Data (FRED)', capturedAt, translateMyMonitor('radar.marketUnavailable', language));
  }
  const envelope = result.value;
  return {
    status: sectionStatus(envelope),
    source: sourceFor(envelope),
    items: envelope.items.map((item) => ({
      id: item.id,
      symbol: item.id,
      label: seriesLabel(item, language),
      value: numberLabel(item.value, item.unit, language),
      ...(item.changePercent === null ? {} : { changePercent: item.changePercent }),
      ...(comparisonLabel(item, language) ? { changeLabel: comparisonLabel(item, language) } : {}),
      ...(item.previousValue === null ? {} : { previousValue: numberLabel(item.previousValue, item.unit, language) }),
      ...(item.previousObservedAt ? { previousObservedAt: item.previousObservedAt } : {}),
      referenceLabel: translateMyMonitor('radar.previousObservation', language),
      observedAt: observedDate(item),
    })),
    ...(envelope.status === 'UNAVAILABLE'
      ? { unavailableReason: translateMyMonitor('radar.marketUnavailable', language) }
      : availabilityReason(envelope, language) ? { unavailableReason: availabilityReason(envelope, language) } : {}),
  };
}

function macroSection(
  result: PromiseSettledResult<PreviewDataEnvelope<PreviewMarketDatum>>,
  capturedAt: string,
  language: string,
): GlobalRadarPreviewPayload['macro'] {
  if (result.status === 'rejected') {
    return failedSection('FRED', 'Federal Reserve Economic Data (FRED)', capturedAt, translateMyMonitor('radar.macroUnavailable', language));
  }
  const envelope = result.value;
  return {
    status: sectionStatus(envelope),
    source: sourceFor(envelope),
    items: envelope.items.map((item) => ({
      id: item.id,
      label: seriesLabel(item, language),
      value: numberLabel(item.value, item.unit, language),
      ...(comparisonLabel(item, language) ? { changeLabel: comparisonLabel(item, language) } : {}),
      ...(item.previousValue === null ? {} : { previousValue: numberLabel(item.previousValue, item.unit, language) }),
      ...(item.previousObservedAt ? { referenceObservedAt: item.previousObservedAt } : {}),
      observedAt: observedDate(item),
    })),
    ...(envelope.status === 'UNAVAILABLE'
      ? { unavailableReason: translateMyMonitor('radar.macroUnavailable', language) }
      : availabilityReason(envelope, language) ? { unavailableReason: availabilityReason(envelope, language) } : {}),
  };
}

function eventItems(
  envelopes: readonly PreviewDataEnvelope<PreviewEventDatum>[],
  capturedAt: string,
  language: string,
): GlobalRadarPreviewPayload['globalEvents']['items'] {
  const byId = new Map<string, GlobalRadarPreviewPayload['globalEvents']['items'][number]>();
  for (const envelope of envelopes) {
    for (const item of envelope.items) {
      if (byId.has(item.id)) continue;
      const isRss = item.sourceMode === 'RSS';
      byId.set(item.id, {
        id: item.id,
        title: item.title,
        summary: item.summary
          ?? translateMyMonitor(isRss ? 'radar.rssObservation' : 'radar.gdeltObservation', language),
        ...(item.sourceCountry ? { region: item.sourceCountry } : {}),
        observedAt: exactObservation(item.observedAt),
        ...(item.publishedAt ? { publishedAt: exactObservation(item.publishedAt) } : {}),
        ...(item.fetchedAt ? { fetchedAt: item.fetchedAt } : {}),
        timeSemantic: item.observedAtSemantic,
        source: {
          id: item.source?.id ?? `${isRss ? 'RSS' : 'GDELT'}:${item.publisher}`,
          label: `${item.source?.name ?? item.publisher} · ${translateMyMonitor(isRss ? 'radar.rssArticleObservation' : 'radar.articleObservation', language)}`,
          mode: item.freshnessStatus === 'STALE' ? 'STALE' : 'LIVE',
          observedAt: exactObservation(item.observedAt),
          capturedAt: item.fetchedAt ?? capturedAt,
          href: item.url,
        },
      });
    }
  }
  return [...byId.values()].slice(0, 12);
}

function eventsSection(
  events: PromiseSettledResult<PreviewDataEnvelope<PreviewEventDatum>>,
  news: PromiseSettledResult<PreviewDataEnvelope<PreviewEventDatum>>,
  capturedAt: string,
  language: string,
): GlobalRadarPreviewPayload['globalEvents'] {
  const envelopes = [events, news].flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (envelopes.length === 0) {
    return failedSection('GDELT', 'GDELT Project 2.1 DOC API', capturedAt, translateMyMonitor('radar.worldUnavailable', language));
  }
  const items = eventItems(envelopes, capturedAt, language);
  const unavailable = envelopes.every((envelope) => envelope.status === 'UNAVAILABLE');
  const partial = !unavailable && (events.status === 'rejected' || news.status === 'rejected'
    || envelopes.some((envelope) => envelope.status === 'PARTIAL' || envelope.status === 'UNAVAILABLE'));
  const missingCount = (events.status === 'rejected' ? 1 : 0) + (news.status === 'rejected' ? 1 : 0)
    + envelopes.reduce((sum, envelope) => sum + envelope.unavailable.length, 0);
  const unavailableSources = [...new Map(envelopes
    .flatMap((envelope) => envelope.unavailable)
    .map((failure) => [`${failure.id}:${failure.reason}`, {
      id: failure.id,
      ...(failure.name ? { label: failure.name } : {}),
      reason: failure.reason,
      ...(failure.attemptedAt ? { attemptedAt: exactObservation(failure.attemptedAt) } : {}),
    }])).values()];
  const fallbackActive = envelopes.some((envelope) => envelope.source.id === 'RSS' && envelope.items.length > 0);
  const partialReason = partial
    ? fallbackActive
      ? translateMyMonitor('radar.rssFallback', language)
      : `${translateMyMonitor('radar.partial', language)} (${missingCount})`
    : undefined;
  return {
    status: unavailable ? 'UNAVAILABLE' : partial ? 'STALE' : 'AVAILABLE',
    source: unavailable
      ? unavailableSource('GDELT', 'GDELT Project 2.1 DOC API', capturedAt)
      : {
          ...sourceFor(envelopes.find((envelope) => envelope.status !== 'UNAVAILABLE') ?? envelopes[0]!),
          ...(fallbackActive ? { label: translateMyMonitor('radar.rssSources', language) } : {}),
          ...(partial ? { mode: 'STALE' as const } : {}),
        },
    items,
    ...(unavailable
      ? { unavailableReason: translateMyMonitor('radar.worldUnavailable', language) }
      : partialReason ? { unavailableReason: partialReason } : {}),
    ...(unavailableSources.length > 0 ? { unavailableSources } : {}),
  };
}

/** Loads only the four fixed same-origin preview endpoints. */
export async function loadGlobalRadarPreview(
  fetcher: GlobalRadarFetch = (...args) => globalThis.fetch(...args),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  language: string = DEFAULT_PRODUCT_LANGUAGE,
): Promise<GlobalRadarLoadResult> {
  try {
    const results = await Promise.allSettled([
      fetchPreviewSource<PreviewMarketDatum>('markets', fetcher, timeoutMs),
      fetchPreviewSource<PreviewMarketDatum>('macro', fetcher, timeoutMs),
      fetchPreviewSource<PreviewEventDatum>('global-events', fetcher, timeoutMs),
      fetchPreviewSource<PreviewEventDatum>('news', fetcher, timeoutMs),
    ]);
    const capturedAt = generatedAt(results);
    const payload = {
      schemaVersion: GLOBAL_RADAR_PREVIEW_SCHEMA_VERSION,
      generatedAt: capturedAt,
      market: marketSection(results[0], capturedAt, language),
      macro: macroSection(results[1], capturedAt, language),
      globalEvents: eventsSection(results[2], results[3], capturedAt, language),
      watchlist: {
        status: 'AVAILABLE',
        source: {
          id: 'browser-watchlist-linkage',
          label: translateMyMonitor('radar.watchlistLinkage', language),
          mode: 'LIVE',
          capturedAt,
        },
        items: [],
      },
    } satisfies GlobalRadarPreviewPayload;
    return { ok: true, payload: parseGlobalRadarPreviewPayload(payload) };
  } catch (error) {
    return {
      ok: false,
      reason: 'NETWORK_ERROR',
      detail: error instanceof Error ? error.message : 'Preview data request failed.',
    };
  }
}
