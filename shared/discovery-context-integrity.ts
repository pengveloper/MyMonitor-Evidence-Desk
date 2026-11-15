import type { ContextItem } from './owner-universe-scan-contract';

/** Observation age is evaluated at the frozen cutoff, never at a new retrieval clock.
 * Reuses existing reference (5 days) and delayed-context (30 minutes) bounds.
 * AVAILABLE daily data does not become a live observation. */
export function contextObservationUsable(item:ContextItem,cutoff:string):boolean {
  if(!['AVAILABLE','FRESH'].includes(item.freshness)||!item.observedAt||!item.fetchedAt)return false;
  const observed=Date.parse(item.observedAt),fetched=Date.parse(item.fetchedAt),at=Date.parse(cutoff);
  if(![observed,fetched,at].every(Number.isFinite)||observed>fetched||fetched>at)return false;
  const daily=['DAILY_REFERENCE','DAILY_MACRO'].includes(item.session);
  if(daily&&/^\d{4}-\d{2}-\d{2}$/.test(item.observedAt)
    &&new Date(observed).toISOString().slice(0,10)!==item.observedAt)return false;
  if(!daily&&!['REGULAR','PRE_MARKET','AFTER_HOURS'].includes(item.session))return false;
  // Macro cadence is already validated by its source-specific freshness contract.
  return item.session==='DAILY_MACRO'||at-observed<=(daily?5*86400000:30*60000);
}
