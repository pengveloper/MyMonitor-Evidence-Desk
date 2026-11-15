import type { PublicClassificationInput, PublicClassificationSnapshot } from './owner-product-classification';
import type { OwnerInstrumentProfile } from './owner-intelligence-contract';
import type {
  PublicDiscoveryInput, PublicDiscoverySnapshot, PublicFxDiscoveryInput, PublicFxDiscoverySnapshot,
  PublicQuoteDiscoveryInput, PublicQuoteDiscoverySnapshot, PublicFredDiscoveryInput, PublicFredDiscoverySnapshot,
} from './owner-discovery-contract';

export type CandidateSlotState = 'ELIGIBLE' | 'STALE' | 'MISSING' | 'UNSUPPORTED' | 'NOT_APPLICABLE' | 'EXCLUDED';
export type CandidateSlotKey = 'quote' | 'sec' | 'fx' | 'macro';
export type CandidateOutcome = 'CANDIDATE_FOR_REVIEW' | 'NO_CANDIDATE';
export type CandidateRole = 'DECISION_CRITICAL' | 'SUPPORTING_CONTEXT' | 'OPTIONAL' | 'NOT_APPLICABLE';
export interface CandidateRequest {
  instrument: { symbol: string; assetClass: OwnerInstrumentProfile['assetClass'] };
  classification?: PublicClassificationInput;
  dataMode: 'SANITIZED_PRODUCTION_SNAPSHOT' | 'PUBLIC_PROVIDER_READ_THROUGH' | 'SYNTHETIC_TEST';
  requestedAt: string;
  cutoffAt: string;
  assembledAt: string;
  /** Existing projections and receipts only. No fetching and no owner portfolio input. */
  evidence: {
    quote?: PublicQuoteDiscoveryInput | null;
    sec?: PublicDiscoveryInput | null;
    fx?: PublicFxDiscoveryInput | null;
    macro?: PublicFredDiscoveryInput | null;
  };
}
export type CandidateCanonicalSnapshot = PublicDiscoverySnapshot | PublicQuoteDiscoverySnapshot | PublicFxDiscoverySnapshot | PublicFredDiscoverySnapshot;
export interface CandidateEvidenceReference {
  slot: CandidateSlotKey;
  canonicalId: string;
  fingerprint: string;
}
export interface CandidateSlot {
  key: CandidateSlotKey;
  scope: 'INSTRUMENT' | 'GLOBAL_CONTEXT';
  role: CandidateRole;
  state: CandidateSlotState;
  reference: CandidateEvidenceReference | null;
  canonical: CandidateCanonicalSnapshot | null;
  reason: string;
  blocksOutcome: boolean;
}
export interface CandidateReason {
  reference: CandidateEvidenceReference;
  fact: string;
  relevance: string;
}
export interface CandidateSnapshot {
  schemaVersion: 'owner-candidate/v1';
  rulesVersion: 'review-readiness/v1' | 'review-readiness/v2';
  classification?: PublicClassificationSnapshot;
  hypothesis: 'CURRENT_EVIDENCE_READINESS_FOR_REVIEW';
  instrument: CandidateRequest['instrument'];
  dataMode: CandidateRequest['dataMode'];
  requestedAt: string;
  cutoffAt: string;
  assembledAt: string;
  frozenInputs: CandidateRequest['evidence'];
  slots: CandidateSlot[];
  outcome: CandidateOutcome;
  blockers: string[];
  reasons: CandidateReason[];
  counterevidence: CandidateReason[];
  unresolved: string[];
  reconsiderWhen: string[];
  bundleFingerprint: string;
}
export interface CandidateRevision {
  revision: number;
  previousFingerprint: string | null;
  snapshot: CandidateSnapshot;
}
export interface CandidateLedger {
  schemaVersion: 'owner-candidate-ledger/v1';
  revisions: CandidateRevision[];
}
