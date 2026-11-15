import type { CandidateRequest } from './owner-candidate-contract';
import type { DiscoveryReceipt } from './owner-discovery-contract';

export const CONTEXT_GROUPS = ['SEMICONDUCTOR_DIRECT', 'SEMICONDUCTOR_LEADERS', 'BROAD_MARKET', 'RATES', 'FX', 'VOLATILITY', 'COMMODITY', 'EVENTS'] as const;
export type ContextGroup = typeof CONTEXT_GROUPS[number];
export interface UniverseConfig {
  version: 'owner-universe/v1';
  source: 'OWNER_SETTINGS';
  trade: string[];
  discovery: string[];
  regressionFixtures: string[];
}
/** Settings, never a classification claim or index-constituent list. */
export const DEFAULT_UNIVERSE: UniverseConfig = {
  version: 'owner-universe/v1', source: 'OWNER_SETTINGS',
  trade: ['SOXL', 'SOXS'], discovery: ['SOXL', 'SOXS', 'SPY', 'QQQ', 'SMH'],
  regressionFixtures: ['CISS', 'C3IS', 'KORU'],
};
export function validateUniverse(input: UniverseConfig): UniverseConfig {
  const normalize = (rows: string[]) => [...new Set(rows.map(s => s.trim().toUpperCase()))].sort();
  if (input.version !== 'owner-universe/v1' || input.source !== 'OWNER_SETTINGS') throw Error('UNIVERSE_CONTRACT');
  const value = { ...input, trade: normalize(input.trade), discovery: normalize(input.discovery), regressionFixtures: normalize(input.regressionFixtures) };
  if ([...value.trade, ...value.discovery, ...value.regressionFixtures].some(s => !/^[A-Z][A-Z0-9.-]{0,19}$/.test(s))) throw Error('INVALID_SYMBOL');
  if (value.discovery.length < 5 || value.discovery.length > 20 || value.trade.length > 20) throw Error('UNIVERSE_SIZE');
  if ([...value.trade, ...value.discovery].some(s => ['CISS', 'C3IS', 'KORU', ...value.regressionFixtures].includes(s))) throw Error('REGRESSION_ONLY_INSTRUMENT');
  return value;
}
/** A receipt-backed official constituent snapshot; absence means no inferred leaders. */
export interface BenchmarkMembership {
  benchmarkId: string;
  sourceUrl: string;
  referenceDate: string;
  fetchedAt: string;
  members: Array<{ symbol: string; weightPercent: number | null }>;
}
export interface BenchmarkInput { evidence: BenchmarkMembership; receipt: DiscoveryReceipt; }
export type InstrumentInputs = Pick<CandidateRequest, 'classification' | 'evidence' | 'dataMode'>;
