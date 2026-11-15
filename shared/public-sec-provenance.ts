import type { ListCompanySignalsResponse } from '../src/generated/server/worldmonitor/intelligence/v1/service_server';
import type { PublicDiscoveryInput } from './owner-discovery-contract';
import type { EvidenceState } from './owner-intelligence-contract';

/** Minimal projection of the stored canonical response; no invented per-filing clocks. */
export type StoredSecReadback = Pick<PublicDiscoveryInput, 'capturedAt' | 'sourceKey' | 'receipt'> & {
  evidence: Pick<ListCompanySignalsResponse, 'cik' | 'discoveredAtMs' | 'signals'>;
};
export interface SecProvenanceInspection {
  input: StoredSecReadback | null;
  contentHash: string | null;
  materialFingerprint: string | null;
  state: EvidenceState;
  level: 'REPLAY_MATCH' | 'CLUSTER_LEVEL_ONLY' | 'EXCLUDED';
  reason: string;
}
