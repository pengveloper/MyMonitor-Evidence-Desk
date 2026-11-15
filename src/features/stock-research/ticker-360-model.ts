export type Ticker360DataStatus = 'Live' | 'Delayed' | 'Cached' | 'Unavailable' | 'Needs review';

export interface Ticker360TimelineItem {
  id: string;
  kind: 'NEWS';
  title: string;
  source: string;
  eventTime?: string;
  relatedDate?: string;
  href?: string;
  status: Ticker360DataStatus;
}

export interface Ticker360HeadlineInput {
  title?: unknown;
  source?: unknown;
  link?: unknown;
  publishedAt?: unknown;
  alignedTradingDate?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function publishedAtIso(value: unknown): string | undefined {
  const epochMs = typeof value === 'bigint' ? Number(value) : value;
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs <= 0) return undefined;
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function sortTicker360Timeline(
  items: readonly Ticker360TimelineItem[],
): Ticker360TimelineItem[] {
  return [...items].sort((left, right) => {
    const leftTime = left.eventTime ? Date.parse(left.eventTime) : Number.NEGATIVE_INFINITY;
    const rightTime = right.eventTime ? Date.parse(right.eventTime) : Number.NEGATIVE_INFINITY;
    return rightTime - leftTime || left.id.localeCompare(right.id);
  });
}

export function newsEvidenceTimeline(
  headlines: readonly Ticker360HeadlineInput[],
): Ticker360TimelineItem[] {
  return sortTicker360Timeline(headlines.flatMap((headline) => {
    const title = text(headline.title);
    if (!title) return [];
    const source = text(headline.source) || 'Unknown source';
    const eventTime = publishedAtIso(headline.publishedAt);
    const relatedDate = text(headline.alignedTradingDate) || undefined;
    const href = text(headline.link) || undefined;
    return [{
      id: [eventTime ?? '', source, title, href ?? ''].join('|'),
      kind: 'NEWS' as const,
      title,
      source,
      ...(eventTime ? { eventTime } : {}),
      ...(relatedDate ? { relatedDate } : {}),
      ...(href ? { href } : {}),
      status: 'Needs review' as const,
    }];
  }));
}
