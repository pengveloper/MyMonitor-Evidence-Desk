import type { OpenOutcomeArtifact } from '../../src/features/stock-research/open-history-contract';
/** The synthetic demo never redistributes the private checkout's historical observations. */
export function loadOpenOutcomeArtifact(): Promise<OpenOutcomeArtifact> {
  return Promise.reject(new Error('SYNTHETIC_DEMO_HISTORY_NOT_CONNECTED'));
}
