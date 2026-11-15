import {
  JASYNQ_EXPORT_CATEGORIES,
  normalizeIntelligenceItem,
  type IntelligenceFeedResponse,
  type IntelligenceItem,
  type JasynqExportCategory,
} from '../../shared/intelligence-bridge-contract';

export const JASYNQ_EXPORT_SETTINGS_STORAGE_KEY = 'wm-jasynq-export-settings-v1';
export const JASYNQ_EXPORT_SETTINGS_EVENT = 'wm-jasynq-export-settings-changed';

const MAX_FILTERS = 100;
const MAX_FILTER_LENGTH = 256;

export interface JasynqExportSettings {
  version: 1;
  delivery_enabled: boolean;
  paused: boolean;
  allowed_categories: JasynqExportCategory[];
  entity_filters: string[];
  ticker_filters: string[];
  excluded_item_revisions: string[];
  snoozed_item_revisions: Record<string, string>;
  user_notes: Record<string, string>;
  personal_labels: Record<string, string>;
}

export type JasynqPreviewStatus =
  | 'eligible'
  | 'delivery_off'
  | 'paused'
  | 'category_excluded'
  | 'filter_excluded'
  | 'item_excluded'
  | 'snoozed';

export interface JasynqPreviewResult {
  feed_epoch: string;
  sync_mode: IntelligenceFeedResponse['sync_mode'];
  items: IntelligenceItem[];
  has_more: boolean;
}

export const DEFAULT_JASYNQ_EXPORT_SETTINGS: Readonly<JasynqExportSettings> = Object.freeze({
  version: 1,
  delivery_enabled: false,
  paused: true,
  allowed_categories: [...JASYNQ_EXPORT_CATEGORIES],
  entity_filters: [],
  ticker_filters: [],
  excluded_item_revisions: [],
  snoozed_item_revisions: {},
  user_notes: {},
  personal_labels: {},
});

function copyDefaults(): JasynqExportSettings {
  return {
    ...DEFAULT_JASYNQ_EXPORT_SETTINGS,
    allowed_categories: [...DEFAULT_JASYNQ_EXPORT_SETTINGS.allowed_categories],
    entity_filters: [],
    ticker_filters: [],
    excluded_item_revisions: [],
    snoozed_item_revisions: {},
    user_notes: {},
    personal_labels: {},
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedStrings(value: unknown, options: { uppercase?: boolean } = {}): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (output.length >= MAX_FILTERS) break;
    if (typeof entry !== 'string') continue;
    let normalized = entry.trim().slice(0, MAX_FILTER_LENGTH);
    if (options.uppercase) normalized = normalized.toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizedStringMap(value: unknown, options: { timestamps?: boolean } = {}): Record<string, string> {
  const input = record(value);
  if (!input) return {};
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input).slice(0, MAX_FILTERS)) {
    if (typeof rawValue !== 'string') continue;
    const key = rawKey.trim().slice(0, MAX_FILTER_LENGTH);
    const text = rawValue.trim().slice(0, 2_048);
    if (!key || !text) continue;
    if (options.timestamps && !Number.isFinite(Date.parse(text))) continue;
    output[key] = text;
  }
  return output;
}

export function normalizeJasynqExportSettings(value: unknown): JasynqExportSettings {
  const input = record(value);
  if (!input || input.version !== 1) return copyDefaults();
  const categories = normalizedStrings(input.allowed_categories)
    .filter((value): value is JasynqExportCategory => (
      JASYNQ_EXPORT_CATEGORIES.includes(value as JasynqExportCategory)
    ));
  return {
    version: 1,
    delivery_enabled: input.delivery_enabled === true,
    paused: input.paused !== false,
    allowed_categories: categories,
    entity_filters: normalizedStrings(input.entity_filters),
    ticker_filters: normalizedStrings(input.ticker_filters, { uppercase: true }),
    excluded_item_revisions: normalizedStrings(input.excluded_item_revisions),
    snoozed_item_revisions: normalizedStringMap(input.snoozed_item_revisions, { timestamps: true }),
    user_notes: normalizedStringMap(input.user_notes),
    personal_labels: normalizedStringMap(input.personal_labels),
  };
}

export function getJasynqExportSettings(): JasynqExportSettings {
  try {
    const raw = localStorage.getItem(JASYNQ_EXPORT_SETTINGS_STORAGE_KEY);
    return raw ? normalizeJasynqExportSettings(JSON.parse(raw)) : copyDefaults();
  } catch {
    return copyDefaults();
  }
}

export function setJasynqExportSettings(value: JasynqExportSettings): JasynqExportSettings {
  const normalized = normalizeJasynqExportSettings(value);
  try {
    localStorage.setItem(JASYNQ_EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Local settings remain usable for the current rendered session.
  }
  try {
    window.dispatchEvent(new CustomEvent(JASYNQ_EXPORT_SETTINGS_EVENT, { detail: normalized }));
  } catch {
    // Tests and storage-blocked runtimes may not expose an event target.
  }
  return normalized;
}

export function updateJasynqExportSettings(
  patch: Partial<Omit<JasynqExportSettings, 'version'>>,
): JasynqExportSettings {
  return setJasynqExportSettings({ ...getJasynqExportSettings(), ...patch, version: 1 });
}

/** Exact revision key. Export policy changes never mutate the canonical item. */
export function jasynqItemRevisionKey(
  item: Pick<IntelligenceItem, 'source' | 'item_id' | 'revision'>,
): string {
  return JSON.stringify([item.source, item.item_id, item.revision]);
}

export function jasynqExportCategoryFor(item: IntelligenceItem): JasynqExportCategory | null {
  if (item.item_type === 'data_health') return 'DATA_HEALTH';
  const category = item.category.toUpperCase();
  return JASYNQ_EXPORT_CATEGORIES.includes(category as JasynqExportCategory)
    ? category as JasynqExportCategory
    : null;
}

function itemMatchesFilters(item: IntelligenceItem, settings: JasynqExportSettings): boolean {
  const entityMatches = settings.entity_filters.length === 0 || item.entities.some((entity) => {
    const identity = `${entity.namespace}:${entity.id}`.toLowerCase();
    return settings.entity_filters.some((filter) => identity.includes(filter.toLowerCase()));
  });
  const tickerMatches = settings.ticker_filters.length === 0 || item.entities.some((entity) => (
    entity.aliases?.some((alias) => settings.ticker_filters.includes(alias.toUpperCase())) ?? false
  ));
  return entityMatches && tickerMatches;
}

export function getJasynqPreviewStatus(
  item: IntelligenceItem,
  settings: JasynqExportSettings,
  now = Date.now(),
): JasynqPreviewStatus {
  if (!settings.delivery_enabled) return 'delivery_off';
  if (settings.paused) return 'paused';
  const category = jasynqExportCategoryFor(item);
  if (!category || !settings.allowed_categories.includes(category)) return 'category_excluded';
  if (!itemMatchesFilters(item, settings)) return 'filter_excluded';
  const key = jasynqItemRevisionKey(item);
  if (settings.excluded_item_revisions.includes(key)) return 'item_excluded';
  const snoozedUntil = settings.snoozed_item_revisions[key];
  if (snoozedUntil && Date.parse(snoozedUntil) > now) return 'snoozed';
  return 'eligible';
}

/**
 * One same-origin read used only when the user opens the local preview.
 * There is intentionally no timer, callback, webhook, or JASYNQ transport.
 */
export async function loadJasynqExportPreview(signal?: AbortSignal): Promise<JasynqPreviewResult> {
  const response = await fetch('/api/integrations/jasynq/v1/feed?limit=20', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(response.status === 404 ? 'Bridge is disabled' : 'Preview unavailable');
  const payload = await response.json() as Partial<IntelligenceFeedResponse>;
  if (!Array.isArray(payload.items)
    || typeof payload.feed_epoch !== 'string'
    || (payload.sync_mode !== 'initial_snapshot' && payload.sync_mode !== 'live_catchup')) {
    throw new Error('Preview response is invalid');
  }
  return {
    feed_epoch: payload.feed_epoch,
    sync_mode: payload.sync_mode,
    items: payload.items.map(normalizeIntelligenceItem),
    has_more: payload.has_more === true,
  };
}
