import { createCircuitBreaker, proxyUrl } from '@/utils';
import { isDesktopRuntime, toApiUrl } from '@/services/runtime';
import { apiFetch, apiHttpError } from '@/services/api-fetch';

export interface TelegramItem {
  id: string;
  source: 'telegram';
  channel: string;
  channelTitle: string;
  url: string;
  ts: string;
  text: string;
  topic: string;
  tags: string[];
  earlySignal: boolean;
  mediaUrls?: string[];
}

export interface TelegramFeedResponse {
  source: string;
  earlySignal: boolean;
  enabled: boolean;
  count: number;
  updatedAt: string | null;
  items: TelegramItem[];
  status?: 'live' | 'degraded' | 'provider_unavailable' | 'auth_blocked';
}

export const TELEGRAM_TOPICS = [
  { id: 'all', labelKey: 'components.telegramIntel.filterAll' },
  { id: 'breaking', labelKey: 'components.telegramIntel.filterBreaking' },
  { id: 'conflict', labelKey: 'components.telegramIntel.filterConflict' },
  { id: 'geopolitics', labelKey: 'components.telegramIntel.filterGeopolitics' },
  { id: 'middleeast', labelKey: 'components.telegramIntel.filterMiddleeast' },
  { id: 'osint', labelKey: 'components.telegramIntel.filterOsint' },
  { id: 'cyber', labelKey: 'components.telegramIntel.filterCyber' },
] as const;

let cachedResponse: TelegramFeedResponse | null = null;
let cachedAt = 0;
const CACHE_TTL = 30_000;
const MISSING_TIMESTAMP_ISO = new Date(0).toISOString();
const TELEGRAM_UNAVAILABLE: TelegramFeedResponse = {
  source: 'telegram', earlySignal: true, enabled: false, count: 0,
  updatedAt: null, items: [], status: 'provider_unavailable',
};
const breaker = createCircuitBreaker<TelegramFeedResponse>({
  name: 'Telegram Feed', maxFailures: 1, cooldownMs: 5 * 60 * 1000,
  cacheTtlMs: CACHE_TTL, maxAttempts: 2, retryBaseDelayMs: 250,
});

function telegramFeedUrl(limit: number): string {
  const path = `/api/telegram-feed?limit=${limit}`;
  return isDesktopRuntime() ? proxyUrl(path) : toApiUrl(path);
}

export async function fetchTelegramFeed(limit = 50): Promise<TelegramFeedResponse> {
  if (cachedResponse && Date.now() - cachedAt < CACHE_TTL) return cachedResponse;
  const result = await breaker.execute(async () => {
    const res = await apiFetch(telegramFeedUrl(limit));
    if (!res.ok) throw apiHttpError(res, 'Telegram feed');
    const json: TelegramFeedResponse = await res.json();
    cachedResponse = { ...json, status: 'live' };
    cachedAt = Date.now();
    return cachedResponse;
  }, TELEGRAM_UNAVAILABLE, { cacheKey: String(limit), shouldCache: (data) => data.status === 'live' });
  const mode = breaker.getDataState().mode;
  if (breaker.getLastError()?.includes('AUTH_SESSION_REQUIRED')) return { ...result, status: 'auth_blocked' };
  if (mode === 'cached') return { ...result, status: 'degraded' };
  if (mode === 'unavailable') return { ...result, status: 'provider_unavailable' };
  return result;
}

export function formatTelegramTime(ts: string): string {
  const time = new Date(ts).getTime();
  if (!Number.isFinite(time) || ts === MISSING_TIMESTAMP_ISO) return 'unknown';

  const diff = Date.now() - time;
  if (diff < 0) return 'now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
