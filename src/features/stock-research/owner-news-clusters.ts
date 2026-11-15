import type { Ticker360HeadlineInput } from './ticker-360-model';
export interface OwnerNewsCluster { title: string; publishedAt?: string; sources: Array<{name: string; href: string; primary: boolean}>; duplicates: number; }
function timestamp(value: unknown): string | undefined {
  const n = typeof value === 'bigint' ? Number(value) : typeof value === 'string' && !/^\d+$/.test(value) ? Date.parse(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  const d = new Date(n); return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
export function ownerNewsClusters(headlines: readonly Ticker360HeadlineInput[]): OwnerNewsCluster[] {
  const clusters = new Map<string, OwnerNewsCluster>();
  for (const item of headlines) {
    if (typeof item.title !== 'string' || !item.title.trim()) continue;
    const title = item.title.trim();
    const publishedAt = timestamp(item.publishedAt);
    // Conservative duplicate grouping: identical normalized title on the same day.
    // Different reports about a topic are not claimed to be the same event.
    const key = title.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ') + '|' + (publishedAt?.slice(0,10) ?? 'unknown');
    const cluster = clusters.get(key) ?? {title, publishedAt, sources: [], duplicates: 0};
    cluster.duplicates++;
    if (publishedAt && (!cluster.publishedAt || publishedAt > cluster.publishedAt)) cluster.publishedAt = publishedAt;
    try {
      const url = new URL(typeof item.link === 'string' ? item.link : '');
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        const primary = url.hostname === 'sec.gov' || url.hostname.endsWith('.sec.gov');
        if (!cluster.sources.some(s => s.href === url.href)) cluster.sources.push({ name: typeof item.source === 'string' ? item.source : url.hostname, href: url.href, primary });
      }
    } catch { /* Keep the headline, never create a link from invalid input. */ }
    clusters.set(key, cluster);
  }
  return [...clusters.values()].sort((a,b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.title.localeCompare(b.title));
}
