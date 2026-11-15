import type { OwnerIntelligenceResponse } from '../../shared/owner-intelligence-contract';
import { apiFetch } from './api-fetch';
import type { AutonomousLearningProjection } from '../../shared/autonomous-learning-contract';
import type { OwnerUniverseProjection, TossOwnerHealthProjection } from '../../shared/tossinvest-contract';

export interface OwnerContext {
  snapshot: AutonomousLearningProjection | null;
  ownerUniverse: OwnerUniverseProjection | null;
  providerHealth: TossOwnerHealthProjection | null;
}
export class OwnerContextError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? 'OWNER_AUTH_REQUIRED' : 'OWNER_CONTEXT_UNAVAILABLE');
  }
}
let generation = 0;
let pending: Promise<OwnerContext> | null = null;
let cached: { value: OwnerContext; at: number } | null = null;
export const OWNER_CONTEXT_CHANGED = 'mymonitor-owner-context-changed';
export function resetOwnerContext(): void {
  generation += 1;
  pending = null;
  cached = null;
}
export async function fetchOwnerContext(force = false): Promise<OwnerContext> {
  if (!force && cached && Date.now() - cached.at < 15_000) return cached.value;
  if (pending) return pending;
  const started = generation;
  const request = (async (): Promise<OwnerContext> => {
    const response = await apiFetch('/api/autonomous-learning', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new OwnerContextError(response.status);
    const body = await response.json() as OwnerContext;
    if (started !== generation) throw new OwnerContextError(409);
    const value: OwnerContext = {
      snapshot: body.snapshot?.schemaVersion === 'autonomous-learning/v1' ? body.snapshot : null,
      ownerUniverse: body.ownerUniverse?.schemaVersion === 'owner-universe/v1' && Array.isArray(body.ownerUniverse.entries) ? body.ownerUniverse : null,
      providerHealth: body.providerHealth?.schemaVersion === 'tossinvest-owner-portfolio/v1' ? body.providerHealth : null,
    };
    cached = { value, at: Date.now() };
    return value;
  })();
  pending = request;
  try { return await request; } finally { if (pending === request) pending = null; }
}

export async function fetchOwnerIntelligence(symbol: string, mode: 'refresh' | 'deep' | 'status', fingerprint?: string): Promise<OwnerIntelligenceResponse> {
  if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)) throw new OwnerContextError(400);
  const started = generation;
  const headers: Record<string, string> = {};
  if (fingerprint) headers['X-MyMonitor-Evidence-Id'] = fingerprint;
  const query = new URLSearchParams({ intelligence: '1', symbol, mode });
  const response = await apiFetch(`/api/autonomous-learning?${query}`, {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers, signal: AbortSignal.timeout(mode === 'deep' ? 110_000 : 60_000),
  });
  if (!response.ok) throw new OwnerContextError(response.status);
  const body = await response.json() as OwnerIntelligenceResponse;
  if (started !== generation) throw new OwnerContextError(409);
  return body;
}
