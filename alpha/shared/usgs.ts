// U.S. Geological Survey earthquake summary feeds (GeoJSON). USGS-authored data is in the
// U.S. public domain; the screens credit the source and link every event to its USGS page.
// This module is pure: the browser (public demo) and the self-hosted server share it.

export const USGS_FEED_URLS = {
  '4.5_day': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
  '4.5_week': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
  'significant_month': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
} as const;
export type UsgsFeed = keyof typeof USGS_FEED_URLS;
export const DEFAULT_USGS_FEED: UsgsFeed = '4.5_week';
export const USGS_ATTRIBUTION = 'U.S. Geological Survey (USGS) Earthquake Hazards Program';

export interface QuakeRecord {
  id: string;
  magnitude: number;
  place: string;
  /** Epoch milliseconds of the earthquake itself. */
  occurredAt: number;
  /** Epoch milliseconds of the last USGS revision, when given. */
  updatedAt: number | null;
  url: string;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  tsunami: boolean;
  /** PAGER alert level as published: green, yellow, orange or red. */
  alert: string | null;
  /** automatic or reviewed, as published. */
  reviewStatus: string | null;
}
export interface UsgsParse { records: QuakeRecord[]; rejected: number; feedGeneratedAt: number | null }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const ID_RE = /^[a-z0-9_-]{4,40}$/i;
const EVENT_URL_RE = /^https:\/\/earthquake\.usgs\.gov\/earthquakes\/eventpage\/[a-z0-9_-]+$/i;
const ALERTS = new Set(['green', 'yellow', 'orange', 'red']);

/** One feature of the feed as a record, or null when a required field is missing or malformed. Nothing is guessed. */
export function quakeRecord(feature: unknown): QuakeRecord | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) return null;
  const p = feature.properties, coordinates = feature.geometry.coordinates;
  const id = typeof feature.id === 'string' && ID_RE.test(feature.id) ? feature.id : null;
  const magnitude = finite(p.mag), occurredAt = finite(p.time);
  const longitude = Array.isArray(coordinates) ? finite(coordinates[0]) : null, latitude = Array.isArray(coordinates) ? finite(coordinates[1]) : null;
  if (!id || magnitude === null || magnitude < -2 || magnitude > 10 || occurredAt === null || occurredAt <= 0
    || latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const url = typeof p.url === 'string' && EVENT_URL_RE.test(p.url) ? p.url : `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`;
  const depth = Array.isArray(coordinates) ? finite(coordinates[2]) : null;
  return {
    id, magnitude: Math.round(magnitude * 10) / 10,
    place: typeof p.place === 'string' && p.place.trim() ? p.place.trim().slice(0, 160) : 'Location not stated',
    occurredAt, updatedAt: finite(p.updated), url, latitude, longitude,
    depthKm: depth === null ? null : Math.round(depth * 10) / 10,
    tsunami: p.tsunami === 1,
    alert: typeof p.alert === 'string' && ALERTS.has(p.alert) ? p.alert : null,
    reviewStatus: p.status === 'reviewed' || p.status === 'automatic' ? p.status : null,
  };
}

/** Parses a whole feed. Malformed features are counted, not repaired; a malformed feed throws. */
export function parseUsgsFeed(value: unknown): UsgsParse {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error('USGS_FEED_MALFORMED');
  const byId = new Map<string, QuakeRecord>(); let rejected = 0;
  for (const feature of value.features) { const record = quakeRecord(feature); if (record) byId.set(record.id, record); else rejected += 1; }
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  return { records: [...byId.values()].sort((a, b) => b.occurredAt - a.occurredAt), rejected, feedGeneratedAt: finite(metadata.generated) };
}

/** Same guard for records that come back from a store or an API. */
export function isQuakeRecord(value: unknown): value is QuakeRecord {
  return isRecord(value) && typeof value.id === 'string' && ID_RE.test(value.id) && finite(value.magnitude) !== null && finite(value.occurredAt) !== null
    && finite(value.latitude) !== null && finite(value.longitude) !== null && typeof value.place === 'string' && typeof value.url === 'string' && EVENT_URL_RE.test(value.url);
}
