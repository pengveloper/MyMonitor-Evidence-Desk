import type { UniverseScan } from './owner-universe-scan-contract';
import type { DiscoveryV2 } from './owner-discovery-v2';
import type { HistoryState } from './owner-discovery-v2';
import type { StoredDiscoveryInput } from './discovery-stored-input';

/** Authenticated, public-field-only view of stored canonical data. No saved AI prose. */
export interface OwnerDiscoveryRead {
  mode: 'STORED_CANONICAL_READ_ONLY';
  readAt: string;
  state: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED';
  reads: Array<{ slot: string; state: 'PRESENT' | 'MISSING' | 'FAILED' | 'INVALID' }>;
  scan: UniverseScan;
  discovery: DiscoveryV2;
  histories?: Record<string, HistoryState>;
  storedProvenance?: Record<string, Pick<StoredDiscoveryInput, 'sourceUrl' | 'fetchedAt' | 'responseHash'>>;
}
