import type { DiscoveryReceipt } from './owner-discovery-contract';
import type { PublicClassificationInput } from './owner-product-classification';
import type { CandidateLedger, CandidateSnapshot } from './owner-candidate-contract';
import type { BenchmarkInput, ContextGroup, InstrumentInputs, UniverseConfig } from './owner-universe';
import type { PublicFredDiscoveryInput, PublicFxDiscoveryInput } from './owner-discovery-contract';
import type { NewsSnapshot, StoredNewsInput } from './owner-news-contract';
export interface ContextItem {
  label?: string;
  role?: 'PRIMARY' | 'PROXY' | 'CORROBORATING';
  canonicalId: string;
  fingerprint: string;
  value: number | null;
  change: number | null;
  unit: string;
  observedAt: string | null;
  fetchedAt: string | null;
  source: string;
  session: string;
  freshness: string;
  reason: string;
  /** Same family is one context, never independent votes. No vote count exists. */
  signalFamily: string;
}
export interface MarketContextSnapshot {
  cutoffAt: string;
  fingerprint: string;
  groups: Array<{ group: ContextGroup; items: ContextItem[]; unknowns: string[] }>;
  contextUniverse: string[];
  benchmark: { input: BenchmarkInput | null; state: 'VERIFIED_MEMBERSHIP_REFERENCE' | 'UNAVAILABLE'; reason: string };
  news: NewsSnapshot;
}
export interface UniverseScanInput {
  requestedAt: string;
  cutoffAt: string;
  assembledAt: string;
  universe: UniverseConfig;
  instruments: Record<string, InstrumentInputs>;
  global: { fx: PublicFxDiscoveryInput | null; macro: PublicFredDiscoveryInput | null; macroReferences?: PublicFredDiscoveryInput[] };
  benchmark: BenchmarkInput | null;
  contextInputs?: Array<{group: ContextGroup; item: ContextItem; receipt: DiscoveryReceipt; capturedAt: string}>;
  contextEntities?: Array<{symbol: string; classification: PublicClassificationInput}>;
  contextUnknowns?: string[];
  newsTranslation?: {method:string;createdAt:string};
  newsReaders: Array<{ sourceKey: string; read: () => Promise<StoredNewsInput | null> }>;
}
export interface UniverseScan {
  version: 'owner-universe-scan/v1';
  requestedAt: string;
  cutoffAt: string;
  assembledAt: string;
  universe: UniverseConfig;
  marketContext: MarketContextSnapshot;
  results: CandidateSnapshot[];
  outcome: 'CANDIDATES_FOR_REVIEW' | 'NO_CANDIDATE';
  fingerprint: string;
  revision: number;
  previousFingerprint: string | null;
  ledgers: Record<string, CandidateLedger>;
}
