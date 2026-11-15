export const PREVIEW_DATA_KINDS = ['markets', 'macro', 'global-events', 'news'] as const;
export type PreviewDataKind = (typeof PREVIEW_DATA_KINDS)[number];
export type PreviewDataStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export interface PreviewFreshness {
  fetchedAt: string;
  newestObservedAt: string | null;
  ageSeconds: number | null;
}

export interface PreviewMarketDatum {
  id: string;
  label: string;
  value: number;
  previousValue: number | null;
  previousObservedAt?: string | null;
  /** Absolute delta; use changeSemantic/changeDisplayUnit when rendering it. */
  change: number | null;
  /** Present only when the series contract is a relative-percent change. */
  changePercent: number | null;
  changeSemantic: 'RELATIVE_PERCENT' | 'PERCENTAGE_POINT';
  changeDisplayUnit: '%' | '%p';
  observedAt: string;
  observationPrecision: 'DATE_ONLY';
  unit: string;
  sourceUrl: string;
}

export interface PreviewEventDatum {
  id: string;
  title: string;
  url: string;
  publisher: string;
  sourceCountry: string | null;
  language: string | null;
  /** Plain-text source description, bounded by the preview handler. */
  summary?: string;
  observedAt: string;
  /** Publisher-supplied article time. Never an assertion about event occurrence. */
  publishedAt?: string;
  /** Article observation/publication time, never the event's effective time. */
  observedAtSemantic: 'GDELT_SEEN_AT' | 'ARTICLE_PUBLISHED_AT';
  /** Additive per-item provenance emitted by GLOBAL-RADAR-1 preview handlers. */
  source?: { id: string; name: string };
  fetchedAt?: string;
  sourceMode?: 'GDELT' | 'RSS';
  freshnessStatus?: 'FRESH' | 'STALE';
}

export interface PreviewUnavailableSource {
  id: string;
  name?: string;
  reason: string;
  attemptedAt?: string;
}

export interface PreviewDataEnvelope<T> {
  schemaVersion: 1;
  kind: PreviewDataKind;
  status: PreviewDataStatus;
  sourceMode: 'PUBLIC_READ_ONLY';
  source: { id: 'FRED' | 'GDELT' | 'RSS'; name: string; url: string };
  freshness: PreviewFreshness;
  items: T[];
  unavailable: PreviewUnavailableSource[];
  unavailableReason: string | null;
}

function isEnvelope(value: unknown, kind: PreviewDataKind): value is PreviewDataEnvelope<never> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PreviewDataEnvelope<never>>;
  return candidate.schemaVersion === 1
    && candidate.kind === kind
    && ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(candidate.status ?? '')
    && candidate.sourceMode === 'PUBLIC_READ_ONLY'
    && Array.isArray(candidate.items)
    && Array.isArray(candidate.unavailable)
    && typeof candidate.source?.name === 'string'
    && typeof candidate.freshness?.fetchedAt === 'string';
}

export async function fetchPreviewData<T>(
  kind: PreviewDataKind,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<PreviewDataEnvelope<T>> {
  const fetchImpl: typeof fetch = options.fetchImpl
    ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const response = await fetchImpl(`/api/preview/${kind}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal: options.signal,
  });
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error(`Preview ${kind} returned a non-JSON response`);
  }
  const payload: unknown = await response.json();
  if (!isEnvelope(payload, kind)) throw new Error(`Preview ${kind} returned an invalid contract`);
  return payload as PreviewDataEnvelope<T>;
}
