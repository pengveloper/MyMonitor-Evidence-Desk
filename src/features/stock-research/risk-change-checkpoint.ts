import {
  compareRiskTicketEvidence,
  type RiskEvidenceChange,
} from './risk-change-baseline.ts';
import type { RiskTicket, RiskTicketStatus, RiskTicketType } from './risk-ticket-model.ts';

export const RISK_CHANGE_CHECKPOINT_SCHEMA_VERSION = 'ticker-360-risk-checkpoint/v1' as const;
const STORAGE_KEY_PREFIX = 'mymonitor:risk-checkpoint:v1:';

type EvidenceStatus = Extract<RiskTicketStatus, 'CONFIRMED' | 'INSUFFICIENT'>;

export interface RiskChangeCheckpointEvidence {
  key: string;
  riskType: RiskTicketType;
  evidenceId: string;
  status: EvidenceStatus;
}

export interface RiskChangeCheckpoint {
  schemaVersion: typeof RISK_CHANGE_CHECKPOINT_SCHEMA_VERSION;
  symbol: string;
  baselineCapturedAt: string;
  evidence: RiskChangeCheckpointEvidence[];
}

export interface RiskChangeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RiskChangeCheckpointView =
  | {
    state: 'FIRST_CHECK';
    symbol: string;
    currentEvidence: RiskEvidenceChange[];
  }
  | {
    state: 'COMPARED';
    symbol: string;
    lastCheckedAt: string;
    newConfirmed: RiskEvidenceChange[];
    newNeedsReview: RiskEvidenceChange[];
    unchanged: RiskEvidenceChange[];
  };

const RISK_TYPES = new Set<RiskTicketType>([
  'ATM',
  'OFFERING',
  'DILUTION',
  'SHARES_OUTSTANDING',
  'REVERSE_SPLIT',
  'LISTING_COMPLIANCE',
  'WARRANT_OR_PREFERRED',
]);

function storageKey(symbol: string): string {
  return `${STORAGE_KEY_PREFIX}${symbol}`;
}

function exactTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function normalizedSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error('risk checkpoint symbol is invalid');
  return symbol;
}

function currentEvidence(ticket: RiskTicket): RiskEvidenceChange[] {
  return compareRiskTicketEvidence({ previous: null, current: ticket }).changes;
}

function parseCheckpoint(raw: string | null, expectedSymbol: string): RiskChangeCheckpoint | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== RISK_CHANGE_CHECKPOINT_SCHEMA_VERSION
      || record.symbol !== expectedSymbol
      || !exactTimestamp(record.baselineCapturedAt)
      || !Array.isArray(record.evidence)) return null;
    const evidence: RiskChangeCheckpointEvidence[] = [];
    const keys = new Set<string>();
    for (const rawEntry of record.evidence) {
      if (!rawEntry || typeof rawEntry !== 'object') return null;
      const entry = rawEntry as Record<string, unknown>;
      if (typeof entry.key !== 'string' || !entry.key || entry.key.length > 2048
        || typeof entry.evidenceId !== 'string' || !entry.evidenceId || entry.evidenceId.length > 512
        || !RISK_TYPES.has(entry.riskType as RiskTicketType)
        || (entry.status !== 'CONFIRMED' && entry.status !== 'INSUFFICIENT')
        || keys.has(entry.key)) return null;
      keys.add(entry.key);
      evidence.push({
        key: entry.key,
        riskType: entry.riskType as RiskTicketType,
        evidenceId: entry.evidenceId,
        status: entry.status,
      });
    }
    return {
      schemaVersion: RISK_CHANGE_CHECKPOINT_SCHEMA_VERSION,
      symbol: expectedSymbol,
      baselineCapturedAt: record.baselineCapturedAt,
      evidence: evidence.sort((left, right) => left.key.localeCompare(right.key)),
    };
  } catch {
    return null;
  }
}

export function readRiskChangeCheckpoint(
  storage: RiskChangeStorage | null,
  rawSymbol: string,
): RiskChangeCheckpoint | null {
  if (!storage) return null;
  const symbol = normalizedSymbol(rawSymbol);
  try {
    return parseCheckpoint(storage.getItem(storageKey(symbol)), symbol);
  } catch {
    return null;
  }
}

export function saveRiskChangeCheckpoint(
  storage: RiskChangeStorage | null,
  ticket: RiskTicket,
  capturedAt = new Date().toISOString(),
): boolean {
  if (!storage || !exactTimestamp(capturedAt)) return false;
  try {
    const symbol = normalizedSymbol(ticket.ticker);
    const evidence = currentEvidence(ticket).map((change): RiskChangeCheckpointEvidence => ({
      key: change.identity.key,
      riskType: change.identity.riskType,
      evidenceId: change.identity.evidenceId,
      status: change.currentStatus,
    }));
    const checkpoint: RiskChangeCheckpoint = {
      schemaVersion: RISK_CHANGE_CHECKPOINT_SCHEMA_VERSION,
      symbol,
      baselineCapturedAt: capturedAt,
      evidence,
    };
    storage.setItem(storageKey(symbol), JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

export function riskChangeCheckpointView(
  storage: RiskChangeStorage | null,
  ticket: RiskTicket,
): RiskChangeCheckpointView {
  const symbol = normalizedSymbol(ticket.ticker);
  const current = currentEvidence(ticket);
  const checkpoint = readRiskChangeCheckpoint(storage, symbol);
  if (!checkpoint) return { state: 'FIRST_CHECK', symbol, currentEvidence: current };

  const previous = new Map(checkpoint.evidence.map((entry) => [entry.key, entry]));
  const newConfirmed: RiskEvidenceChange[] = [];
  const newNeedsReview: RiskEvidenceChange[] = [];
  const unchanged: RiskEvidenceChange[] = [];
  for (const evidence of current) {
    const prior = previous.get(evidence.identity.key);
    if (prior?.status === evidence.currentStatus) {
      unchanged.push({ ...evidence, kind: 'UNCHANGED', previousStatus: prior.status });
    } else if (evidence.currentStatus === 'CONFIRMED') {
      newConfirmed.push({
        ...evidence,
        kind: 'NEW_CONFIRMED_EVIDENCE',
        ...(prior ? { previousStatus: prior.status } : {}),
      });
    } else {
      newNeedsReview.push({
        ...evidence,
        kind: 'NEW_INSUFFICIENT',
        ...(prior ? { previousStatus: prior.status } : {}),
      });
    }
  }
  return {
    state: 'COMPARED',
    symbol,
    lastCheckedAt: checkpoint.baselineCapturedAt,
    newConfirmed,
    newNeedsReview,
    unchanged,
  };
}
