import type { CoverageInput } from './discovery-coverage';
import type { ContextItem } from './owner-universe-scan-contract';

/** Existing canonical items, not an AI-created numeric schema. Unknowns stay unknown. */
export function marketEvidenceDetails(input: CoverageInput): ContextItem[] {
  const cutoff = Date.parse(input.cutoffAt), seen = new Map<string, ContextItem>();
  if (!Number.isFinite(cutoff) || input.marketContext.cutoffAt !== input.cutoffAt) throw Error('MARKET_EVIDENCE_CUTOFF');
  for (const group of input.marketContext.groups) for (const item of group.items) {
    try {
      const source = new URL(item.source);
      if (source.protocol !== 'https:' || source.username || source.password
        || [...source.searchParams.keys()].some(k => /token|key|secret/i.test(k))) throw Error('UNSAFE_SOURCE');
    } catch { throw Error('MARKET_EVIDENCE_SOURCE'); }
    const stamp = (value: string | null) => {
      if (value === null) return null;
      const time = Date.parse(value);
      if (!Number.isFinite(time) || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value)
        || new Date(time).toISOString().slice(0, 10) !== value.slice(0, 10)) throw Error('MARKET_EVIDENCE_TIME');
      return time;
    };
    const observed = stamp(item.observedAt), fetched = stamp(item.fetchedAt);
    if (!item.canonicalId || !/^[a-f0-9]{64}$/.test(item.fingerprint) || !/^https:\/\//.test(item.source)
      || !item.session || !item.freshness || (item.value !== null && !Number.isFinite(item.value))
      || (item.change !== null && !Number.isFinite(item.change))) throw Error('MARKET_EVIDENCE_IDENTITY');
    if ((observed !== null && observed > cutoff) || (fetched !== null && fetched > cutoff)
      || (observed !== null && fetched !== null && observed > fetched)
      || (item.session === 'DAILY_REFERENCE' && !/^\d{4}-\d{2}-\d{2}$/.test(item.observedAt ?? ''))
      || (['FRESH', 'AVAILABLE'].includes(item.freshness) && (observed === null || fetched === null))) throw Error('MARKET_EVIDENCE_TIME');
    const prior = seen.get(item.canonicalId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) throw Error('MARKET_EVIDENCE_CONFLICT');
    seen.set(item.canonicalId, structuredClone(item));
  }
  return [...seen.values()];
}
