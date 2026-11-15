import { apiFetch } from './api-fetch';
import type { OwnerDiscoveryRead } from '../../shared/owner-discovery-read-contract';

/** One read on mount or explicit retry. No provider refresh, polling, AI or writes. */
export async function fetchOwnerDiscovery(signal?: AbortSignal): Promise<OwnerDiscoveryRead> {
  const response = await apiFetch('/api/autonomous-learning?discovery=1', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw Error(response.status === 401 ? 'OWNER_AUTH_REQUIRED' : 'DISCOVERY_READ_FAILED');
  const body = await response.json() as OwnerDiscoveryRead;
  if (body.mode !== 'STORED_CANONICAL_READ_ONLY' || !body.scan || !body.discovery
    || body.scan.version !== 'owner-universe-scan/v1' || body.scan.results.length !== 5
    || body.scan.fingerprint !== body.discovery.sourceScanFingerprint) throw Error('DISCOVERY_CONTRACT_INVALID');
  return body;
}
