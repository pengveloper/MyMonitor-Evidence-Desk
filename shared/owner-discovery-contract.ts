import type { SecProvenanceInspection } from './public-sec-provenance';
import type { EvidenceState, OwnerIntelligenceEvidence } from './owner-intelligence-contract';
import type { OwnerFxReference, OwnerFxStoragePath } from './owner-fx-reference';

/** Existing discovery receipt. Scope of contentHash is always the exact supplied evidence. */
export interface DiscoveryReceipt {
  bundleId: string;
  contentHash: string;
  firstSeenAt: string;
  revisionKnownAt: string;
}

/** Public projection, never a complete owner bundle or a screening candidate. */
export type PublicCanonicalEvidence = Pick<OwnerIntelligenceEvidence,
  'schemaVersion' | 'symbol' | 'fingerprint' | 'collectedAt' | 'secState' | 'events'>;

/** Existing owner canonical market shape plus its existing dependency fingerprint. */
export type PublicQuoteCanonicalEvidence = Pick<OwnerIntelligenceEvidence,
  'schemaVersion' | 'symbol' | 'collectedAt' | 'market'> & {
    dependencies: { market: string };
  };

/** Exact minimal projection of economic:fred:v1:<series>:0. */
export interface PublicFredSeriesRecord {
  series: {
    seriesId: string;
    title: string;
    units: string;
    frequency: string;
    observations: Array<{ date: string; value: number | string | null }>;
  };
}

/** Exact existing seed-meta projection. This is liveness metadata, not an observation clock. */
export interface PublicFredSeedMeta {
  fetchedAt: number;
  recordCount: number;
}

export interface DiscoveryReadOnlyInput<T> {
  evidence: T | null;
  receipt: DiscoveryReceipt | null;
  capturedAt: string;
  sourceKey: string;
  /** Only for an explicitly authorized public provider read; never a Redis receipt. */
  providerRead?: { sourceUrl: string; fetchedAt: string; responseHash: string };
}

export interface PublicDiscoveryInput extends DiscoveryReadOnlyInput<PublicCanonicalEvidence> {}

export interface PublicFxDiscoveryInput extends DiscoveryReadOnlyInput<OwnerFxReference> {
  storagePath: OwnerFxStoragePath;
  currentKeyState: 'PRESENT' | 'MISSING';
  receiptScope: 'EXTRACTION_ONLY';
  inspectionByteHash: string;
}

export interface PublicFxDiscoverySnapshot {
  dataMode: 'SANITIZED_PRODUCTION_SNAPSHOT';
  knowledgePolicy: 'SYSTEM_KNOWN_BY_CUTOFF';
  cutoffAt: string;
  input: PublicFxDiscoveryInput;
  contentHash: string | null;
  materialFingerprint: string | null;
  state: EvidenceState;
  eligibility: 'EVIDENCE_ONLY' | 'EXCLUDED';
  reason: string;
  provenanceLevel: 'DERIVED_REFERENCE_ONLY_RAW_LEGS_NOT_STORED';
}

export interface PublicQuoteDiscoveryInput extends DiscoveryReadOnlyInput<PublicQuoteCanonicalEvidence> {
  receiptScope: 'EXTRACTION_ONLY' | 'PROVIDER_READ_THROUGH';
}

export interface PublicQuoteDiscoverySnapshot {
  dataMode: 'SANITIZED_PRODUCTION_SNAPSHOT' | 'PUBLIC_PROVIDER_READ_THROUGH';
  knowledgePolicy: 'SYSTEM_KNOWN_BY_CUTOFF';
  cutoffAt: string;
  input: PublicQuoteDiscoveryInput;
  contentHash: string | null;
  materialFingerprint: string | null;
  state: EvidenceState;
  eligibility: 'EVIDENCE_ONLY' | 'EXCLUDED';
  reason: string;
  provenanceLevel: 'CANONICAL_MARKET_PROJECTION_HISTORY_NOT_STORED';
  coverage: {
    previousClose: 'NOT_STORED';
    comparisonBasis: 'NOT_STORED';
    dailyHistory: 'NOT_STORED';
    adjustmentStatus: 'UNKNOWN';
    sourceUrl: 'NOT_STORED';
  };
}

export interface PublicFredDiscoveryInput extends DiscoveryReadOnlyInput<PublicFredSeriesRecord> {
  metaKey: string;
  seedMeta: PublicFredSeedMeta | null;
  receiptScope: 'EXTRACTION_ONLY' | 'PROVIDER_READ_THROUGH';
}

export interface PublicFredDiscoverySnapshot {
  dataMode: 'SANITIZED_PRODUCTION_SNAPSHOT' | 'PUBLIC_PROVIDER_READ_THROUGH';
  knowledgePolicy: 'SYSTEM_KNOWN_BY_CUTOFF';
  cutoffAt: string;
  input: PublicFredDiscoveryInput;
  contentHash: string | null;
  materialFingerprint: string | null;
  state: EvidenceState;
  eligibility: 'EVIDENCE_ONLY' | 'EXCLUDED';
  reason: string;
  provenanceLevel: 'CURRENT_READBACK_OF_HISTORICAL_OBSERVATION';
  transportFreshness: 'LATEST_SEED_WITHIN_EXISTING_WINDOW' | 'SEED_STALE' | 'SEED_META_UNAVAILABLE';
  observationFreshness: 'LATEST_STORED_NOT_REALTIME';
  observation: { date: string; value: number; unit: string } | null;
  coverage: {
    publicationTime: 'NOT_STORED';
    firstObservedAt: 'NOT_STORED';
    vintageIdentity: 'NOT_STORED';
    realtimeStart: 'NOT_STORED';
    realtimeEnd: 'NOT_STORED';
    immutableRawReceipt: 'NOT_STORED';
    sourceUrl: 'NOT_STORED';
    fallbackState: 'NOT_STORED';
    holidayAwareObservationFreshness: 'NOT_STORED';
  };
}

export interface PublicDiscoverySnapshot {
  secProvenance?: SecProvenanceInspection;
  fxReference?: PublicFxDiscoverySnapshot;
  quoteReference?: PublicQuoteDiscoverySnapshot;
  macroReference?: PublicFredDiscoverySnapshot;
  dataMode: 'SANITIZED_PRODUCTION_SNAPSHOT' | 'PUBLIC_PROVIDER_READ_THROUGH';
  knowledgePolicy: 'SYSTEM_KNOWN_BY_CUTOFF';
  cutoffAt: string;
  input: PublicDiscoveryInput;
  contentHash: string | null;
  materialFingerprint: string | null;
  state: OwnerIntelligenceEvidence['secState'];
  eligibility: 'EVIDENCE_ONLY' | 'EXCLUDED';
  reason: string;
}
