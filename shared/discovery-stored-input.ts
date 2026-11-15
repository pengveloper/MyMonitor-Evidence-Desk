/** Durable copies of the existing public provider receipt, separate from 60s cache-aside keys. */
export const DISCOVERY_SYMBOLS = ['SOXL', 'SOXS', 'SPY', 'QQQ', 'SMH'] as const;
export type DiscoverySlot = 'quote' | 'classification' | 'history';
export interface StoredDiscoveryInput {
  status: 'READ_OK'; sourceUrl: string; fetchedAt: string; responseHash: string; data: unknown;
}
export const discoveryStoredKey = (slot: DiscoverySlot, symbol: string) => `owner:discovery:${slot}:v1:${symbol}`;
export const DISCOVERY_RETENTION_SECONDS = 8 * 86400;
export const GENERAL_FIELDS = ['Code','Type','Name','Exchange','CurrencyCode','CountryName','UpdatedAt','ISIN'] as const;
export const HISTORY_FIELDS = ['date','open','high','low','close','adjusted_close','volume'] as const;
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const pick = (v: unknown, keys: readonly string[]) => Object.fromEntries(keys.filter(k => k in obj(v)).map(k => [k, obj(v)[k]]));
export function publicDiscoveryProjection(slot: DiscoverySlot, data: unknown): unknown {
  if (slot === 'quote') return pick(data, ['code','close','change_p','timestamp']);
  // filter=General returns the section itself; full/legacy responses wrap it.
  // An explicit invalid General must fail, not fall back to unrelated top-level fields.
  if (slot === 'classification') return { General: pick('General' in obj(data) ? obj(data).General : data, GENERAL_FIELDS) };
  return Array.isArray(data) ? data.map(r => pick(r, HISTORY_FIELDS)) : null;
}
/** Hash of the exact persisted public projection, not a claim about unretained HTTP bytes. */
export async function storedProjectionHash(data: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export async function validStoredDiscoveryInput(value: unknown, slot: DiscoverySlot, symbol: string, cutoff: string): Promise<boolean> {
  const e = obj(value), fetched = Date.parse(String(e.fetchedAt)), end = Date.parse(cutoff);
  if (!(DISCOVERY_SYMBOLS as readonly string[]).includes(symbol) || e.status !== 'READ_OK'
    || typeof e.fetchedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(e.fetchedAt)
    || !Number.isFinite(fetched) || !Number.isFinite(end) || fetched > end || typeof e.responseHash !== 'string' || !/^[a-f0-9]{64}$/.test(e.responseHash)) return false;
  try {
    const u = new URL(String(e.sourceUrl));
    if (u.origin !== 'https://eodhd.com' || u.username || u.password || u.hash) return false;
    if (slot === 'quote') {
      const first = /^\/api\/real-time\/([A-Z]+)\.US$/.exec(u.pathname)?.[1];
      const symbols = [first, ...(u.searchParams.get('s') ?? '').split(',').filter(Boolean).map(s => s.endsWith('.US') ? s.slice(0,-3) : '')];
      if (!symbols.includes(symbol) || symbols.some(s => !(DISCOVERY_SYMBOLS as readonly (string | undefined)[]).includes(s))
        || new Set(symbols).size !== symbols.length || [...u.searchParams.keys()].some(k => k !== 's')) return false;
    } else {
      const path = slot === 'classification' ? `/api/v1.1/fundamentals/${symbol}.US` : `/api/eod/${symbol}.US`;
      const allowed = slot === 'classification' ? ['filter'] : ['from','to','period','order'];
      if (u.pathname !== path || [...u.searchParams.keys()].some(k => !allowed.includes(k))) return false;
      if (slot === 'classification' && u.searchParams.has('filter') && u.searchParams.get('filter') !== 'General') return false;
    }
    if (JSON.stringify(e.data) !== JSON.stringify(publicDiscoveryProjection(slot, e.data)) || JSON.stringify(e.data).length > 150_000
      || await storedProjectionHash(e.data) !== e.responseHash) return false;
    const raw = obj(e.data);
    if (slot === 'quote') return raw.code === symbol + '.US' && typeof raw.close === 'number' && raw.close > 0 && Number.isFinite(raw.close)
      && typeof raw.timestamp === 'number' && raw.timestamp > 0 && raw.timestamp * 1000 <= fetched
      && (raw.change_p == null || typeof raw.change_p === 'number' && Number.isFinite(raw.change_p));
    if (slot === 'classification') {
      const g = obj(raw.General);
      return g.Code === symbol && ['ETF','EXCHANGE TRADED FUND','EXCHANGE-TRADED FUND','COMMON STOCK','EQUITY','STOCK','ADR'].includes(String(g.Type).toUpperCase())
        && ['Name','Exchange','CurrencyCode','CountryName'].every(k => typeof g[k] === 'string' && String(g[k]).length > 0 && String(g[k]).length < 300)
        && g.CurrencyCode === 'USD' && ['USA','US','UNITED STATES'].includes(String(g.CountryName).toUpperCase())
        && (g.UpdatedAt == null || typeof g.UpdatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.UpdatedAt)
          && new Date(g.UpdatedAt).toISOString().slice(0,10) === g.UpdatedAt && g.UpdatedAt <= String(e.fetchedAt).slice(0,10))
        && (g.ISIN == null || typeof g.ISIN === 'string');
    }
    if (!Array.isArray(e.data) || e.data.length < 65 || e.data.length > 260) return false;
    const dates = new Set<string>();
    return e.data.every(v => {
      const r = obj(v), date = r.date;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10) !== date
        || date > String(e.fetchedAt).slice(0,10) || dates.has(date)) return false;
      dates.add(date);
      return ['open','high','low','close','adjusted_close'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]) && Number(r[k]) > 0)
        && Number(r.high) >= Math.max(Number(r.open),Number(r.close),Number(r.low))
        && Number(r.low) <= Math.min(Number(r.open),Number(r.close),Number(r.high))
        && typeof r.volume === 'number' && Number.isFinite(r.volume) && r.volume >= 0;
    });
  } catch { return false; }
}
