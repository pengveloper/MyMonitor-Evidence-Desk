import { DEFAULT_USGS_FEED, USGS_FEED_URLS, parseUsgsFeed, type UsgsFeed } from '../shared/usgs.ts';
import type { CollectAttempt } from '../shared/events-contract.ts';
import { mergeRecords, readStore, recordFailure, writeStore } from './store.ts';

export interface CollectOptions { dataDir: string; feed?: UsgsFeed; feedUrl?: string; fetcher?: typeof fetch; now?: () => number }
const failureText = (error: unknown): string => error instanceof Error && /^(HTTP \d{3}|USGS_FEED_MALFORMED)$/.test(error.message) ? error.message
  : error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';

/** One collection: fetch the public USGS feed, validate it, merge it into the store. No key, no cost. */
export async function collectOnce(options: CollectOptions): Promise<CollectAttempt> {
  const now = options.now ?? Date.now, fetcher = options.fetcher ?? fetch;
  const feedUrl = options.feedUrl ?? USGS_FEED_URLS[options.feed ?? DEFAULT_USGS_FEED];
  const before = readStore(options.dataDir);
  try {
    const response = await fetcher(feedUrl, { headers: { accept: 'application/geo+json, application/json', 'user-agent': 'mymonitor-alpha (self-hosted; USGS summary feed reader)' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseUsgsFeed(await response.json());
    const merged = mergeRecords(before, parsed.records, parsed.rejected, feedUrl, now());
    writeStore(options.dataDir, merged.state);
    return merged.attempt;
  } catch (error) {
    const failed = recordFailure(before, failureText(error), now());
    writeStore(options.dataDir, failed.state);
    return failed.attempt;
  }
}

// `node alpha/server/collect.ts` collects once and prints the result (for cron or a first run).
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const feed = process.env.ALPHA_USGS_FEED as UsgsFeed | undefined;
  if (feed && !(feed in USGS_FEED_URLS)) { console.error(`ALPHA_USGS_FEED must be one of: ${Object.keys(USGS_FEED_URLS).join(', ')}`); process.exit(2); }
  const attempt = await collectOnce({ dataDir: process.env.ALPHA_DATA_DIR ?? 'alpha-data', ...(feed ? { feed } : {}) });
  console.log(JSON.stringify(attempt));
  process.exit(attempt.ok ? 0 : 1);
}
