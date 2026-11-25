import type { OwnerEvent } from './owner-intelligence-contract';
import type { DiscoveryReceipt } from './owner-discovery-contract';
export interface StoredNewsInput {
  provider: 'EODHD' | 'SEC' | 'FEDERAL_RESERVE' | 'OFFICIAL' | 'OWNER_CANONICAL';
  sourceKey: string;
  events: OwnerEvent[];
  receipt: DiscoveryReceipt;
  capturedAt: string;
  fetchedAt: string | null;
  /** Only a stored per-event observation clock, never inferred from extraction. */
  firstObservedAt: Record<string, string | null>;
}
export interface NewsEvent {
  event: OwnerEvent;
  fingerprint: string;
  relevance: 'DIRECT' | 'BENCHMARK_MEMBER' | 'MARKET_CONTEXT';
  affectedInstruments: string[];
  topics: string[];
  freshness: 'RECENT_PUBLICATION' | 'HISTORICAL' | 'UNKNOWN_PUBLICATION_TIME';
  provenance: Array<{ canonicalId: string; factFingerprint: string; provider: StoredNewsInput['provider']; sourceKey: string;
    publishedAt: string | null; firstObservedAt: string | null; fetchedAt: string | null; capturedAt: string; receipt: DiscoveryReceipt }>;
}
export interface NewsSnapshot {
  translation?: {method:string;createdAt:string};
  cutoffAt: string;
  events: NewsEvent[];
  sources: Array<{ sourceKey: string; state: 'AVAILABLE' | 'FAILED' | 'EXCLUDED'; reason: string }>;
  fingerprint: string;
}
