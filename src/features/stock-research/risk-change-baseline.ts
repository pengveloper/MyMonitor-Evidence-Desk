import {
  RISK_TICKET_SCHEMA_VERSION,
  RISK_TICKET_TYPES,
  type RiskTicket,
  type RiskTicketItem,
  type RiskTicketSource,
  type RiskTicketType,
} from './risk-ticket-model.ts';
import type { CorporateActionEffectiveTimePrecision } from '../../../shared/market-data/contracts.ts';

export const RISK_CHANGE_BASELINE_SCHEMA_VERSION = 'ticker-360-risk-change-baseline/v1' as const;

export type RiskEvidenceChangeKind =
  | 'NEW_CONFIRMED_EVIDENCE'
  | 'NEW_INSUFFICIENT'
  | 'UNCHANGED';

export interface RiskEvidenceIdentity {
  /** Stable comparison key. Re-fetch time and delivery mode are intentionally excluded. */
  key: string;
  ticker: string;
  riskType: RiskTicketType;
  evidenceId: string;
  acceptedAt?: string;
  knownAt: string;
  effectiveAt?: string;
  effectiveDate?: string;
  effectiveTimePrecision?: CorporateActionEffectiveTimePrecision;
  form?: string;
  item?: string;
}

export interface RiskEvidenceChange {
  kind: RiskEvidenceChangeKind;
  identity: RiskEvidenceIdentity;
  currentStatus: 'CONFIRMED' | 'INSUFFICIENT';
  previousStatus?: 'CONFIRMED' | 'INSUFFICIENT';
  source: RiskTicketSource;
}

export interface RiskChangeBaseline {
  schemaVersion: typeof RISK_CHANGE_BASELINE_SCHEMA_VERSION;
  ticker: string;
  previousAsKnownAt?: string;
  currentAsKnownAt: string;
  changes: RiskEvidenceChange[];
}

export interface CompareRiskTicketEvidenceInput {
  previous: RiskTicket | null;
  current: RiskTicket;
}

interface ComparableEvidence {
  identity: RiskEvidenceIdentity;
  status: 'CONFIRMED' | 'INSUFFICIENT';
  source: RiskTicketSource;
}

const STATUS_KINDS = new Set(['CONFIRMED', 'INSUFFICIENT']);
const DELIVERY_MODES = new Set(['CANONICAL_RUNTIME', 'CANONICAL_ARTIFACT', 'PUBLIC_SNAPSHOT']);

function exactEpoch(value: string, field: string): number {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new Error(`${field} must be an exact UTC timestamp`);
  }
  return epoch;
}

function requiredText(value: string, field: string, maxLength = 512): string {
  if (value.length === 0 || value !== value.trim() || value.length > maxLength) {
    throw new Error(`${field} must be non-empty, trimmed, and at most ${maxLength} characters`);
  }
  return value;
}

function optionalTimestamp(value: string | undefined, field: string): number | undefined {
  return value === undefined ? undefined : exactEpoch(value, field);
}

function optionalDate(value: string | undefined, field: string): void {
  if (value === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a real ISO calendar date`);
  }
}

function sourceClassification(source: RiskTicketSource): { form?: string; item?: string } {
  const provenanceText = `${source.provider} ${source.dataset}`.toUpperCase();
  const form = provenanceText.match(/(?:^|[^A-Z0-9])((?:8-K|6-K|10-K|10-Q|S-1|S-3|424B[1-9]))(?:$|[^A-Z0-9])/)?.[1];
  const item = provenanceText.match(/(?:^|[^A-Z0-9])ITEM\s+(\d{1,2}\.\d{2})(?:$|[^A-Z0-9])/)?.[1];
  return {
    ...(form ? { form } : {}),
    ...(item ? { item: `Item ${item}` } : {}),
  };
}

function stableKey(ticker: string, riskType: RiskTicketType, evidenceId: string): string {
  // evidenceId is the canonical accession/action/fact/document identity. Temporal
  // and delivery metadata remain visible below but do not make a re-fetch NEW.
  return [ticker, riskType, evidenceId]
    .map((part) => `${part.length}:${part}`)
    .join('|');
}

function sourceOrderKey(source: RiskTicketSource): string {
  return [
    source.evidenceId,
    source.acceptedAt ?? '',
    source.sourceTimestamp ?? '',
    source.fetchedAt ?? '',
    source.provider,
    source.dataset,
    source.deliveryProvenance,
    source.href ?? '',
  ].map((part) => `${part.length}:${part}`).join('|');
}

function validateSource(
  source: RiskTicketSource,
  item: RiskTicketItem,
  ticker: string,
  ticketAsKnownAtMs: number,
  sourceIndex: number,
): RiskEvidenceIdentity {
  const prefix = `${item.riskType}.sources[${sourceIndex}]`;
  const evidenceId = requiredText(source.evidenceId, `${prefix}.evidenceId`);
  requiredText(source.provider, `${prefix}.provider`);
  requiredText(source.dataset, `${prefix}.dataset`);
  if (!DELIVERY_MODES.has(source.deliveryProvenance)) {
    throw new Error(`${prefix}.deliveryProvenance is invalid`);
  }

  const knownAt = requiredText(item.knownAt ?? '', `${item.riskType}.knownAt`);
  const knownAtMs = exactEpoch(knownAt, `${item.riskType}.knownAt`);
  if (knownAtMs > ticketAsKnownAtMs) throw new Error(`${item.riskType}.knownAt exceeds ticket asKnownAt`);

  const acceptedAtMs = optionalTimestamp(source.acceptedAt, `${prefix}.acceptedAt`);
  const sourceTimestampMs = optionalTimestamp(source.sourceTimestamp, `${prefix}.sourceTimestamp`);
  const fetchedAtMs = optionalTimestamp(source.fetchedAt, `${prefix}.fetchedAt`);
  optionalTimestamp(item.effectiveAt, `${item.riskType}.effectiveAt`);
  optionalDate(item.effectiveDate, `${item.riskType}.effectiveDate`);
  if (item.effectiveTimePrecision === 'EXACT_TIMESTAMP' && !item.effectiveAt) {
    throw new Error(`${item.riskType} exact effective-time precision requires effectiveAt`);
  }
  if (item.effectiveTimePrecision === 'DATE_ONLY' && (!item.effectiveDate || item.effectiveAt)) {
    throw new Error(`${item.riskType} date-only effective-time precision requires only effectiveDate`);
  }
  if (item.effectiveTimePrecision === 'UNKNOWN' && (item.effectiveDate || item.effectiveAt)) {
    throw new Error(`${item.riskType} unknown effective-time precision must not include an effective time`);
  }
  if (acceptedAtMs !== undefined && acceptedAtMs > knownAtMs) {
    throw new Error(`${prefix}.acceptedAt exceeds evidence knownAt`);
  }
  if (sourceTimestampMs !== undefined && sourceTimestampMs > knownAtMs) {
    throw new Error(`${prefix}.sourceTimestamp exceeds evidence knownAt`);
  }
  const sourceKnownMs = Math.max(acceptedAtMs ?? Number.NEGATIVE_INFINITY, sourceTimestampMs ?? Number.NEGATIVE_INFINITY);
  if (fetchedAtMs !== undefined && fetchedAtMs < sourceKnownMs) {
    throw new Error(`${prefix}.fetchedAt precedes its source timestamp`);
  }
  if (fetchedAtMs !== undefined && fetchedAtMs > ticketAsKnownAtMs) {
    throw new Error(`${prefix}.fetchedAt exceeds ticket asKnownAt`);
  }

  const classification = sourceClassification(source);
  return {
    key: stableKey(ticker, item.riskType, evidenceId),
    ticker,
    riskType: item.riskType,
    evidenceId,
    ...(source.acceptedAt ? { acceptedAt: source.acceptedAt } : {}),
    knownAt,
    ...(item.effectiveAt ? { effectiveAt: item.effectiveAt } : {}),
    ...(item.effectiveDate ? { effectiveDate: item.effectiveDate } : {}),
    ...(item.effectiveTimePrecision ? { effectiveTimePrecision: item.effectiveTimePrecision } : {}),
    ...classification,
  };
}

function comparableEvidence(ticket: RiskTicket): ComparableEvidence[] {
  if (ticket.schemaVersion !== RISK_TICKET_SCHEMA_VERSION) {
    throw new Error('risk ticket schema version is unsupported');
  }
  const ticker = requiredText(ticket.ticker, 'risk ticket ticker', 15);
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) throw new Error('risk ticket ticker is invalid');
  const ticketAsKnownAtMs = exactEpoch(ticket.asKnownAt, 'risk ticket asKnownAt');
  const seenTypes = new Set<RiskTicketType>();
  const evidence = new Map<string, ComparableEvidence>();

  for (const item of ticket.items) {
    if (!RISK_TICKET_TYPES.includes(item.riskType)) throw new Error('risk ticket contains an invalid category');
    if (seenTypes.has(item.riskType)) throw new Error(`risk ticket contains duplicate ${item.riskType} items`);
    seenTypes.add(item.riskType);

    if (!STATUS_KINDS.has(item.status)) {
      if (item.sources.length > 0) throw new Error(`${item.riskType} has sources without an evidence status`);
      continue;
    }
    if (item.sources.length === 0) throw new Error(`${item.riskType} evidence has no source`);
    const status = item.status as ComparableEvidence['status'];
    [...item.sources]
      .sort((left, right) => sourceOrderKey(left).localeCompare(sourceOrderKey(right)))
      .forEach((source, sourceIndex) => {
        const identity = validateSource(source, item, ticker, ticketAsKnownAtMs, sourceIndex);
        const existing = evidence.get(identity.key);
        if (!existing) {
          evidence.set(identity.key, { identity, status, source });
          return;
        }
        // Duplicate retrieval of one canonical evidence object is one baseline row.
        // Conflicting metadata for that identity is rejected rather than guessed.
        if (existing.status !== status
          || existing.identity.knownAt !== identity.knownAt
          || existing.identity.acceptedAt !== identity.acceptedAt
          || existing.identity.effectiveAt !== identity.effectiveAt
          || existing.identity.effectiveDate !== identity.effectiveDate
          || existing.identity.effectiveTimePrecision !== identity.effectiveTimePrecision) {
          throw new Error(`conflicting duplicate risk evidence identity: ${identity.key}`);
        }
      });
  }

  return [...evidence.values()].sort((left, right) => left.identity.key.localeCompare(right.identity.key));
}

function changeKind(
  current: ComparableEvidence,
  previous: ComparableEvidence | undefined,
): RiskEvidenceChangeKind {
  if (previous?.status === current.status) return 'UNCHANGED';
  return current.status === 'CONFIRMED' ? 'NEW_CONFIRMED_EVIDENCE' : 'NEW_INSUFFICIENT';
}

function assertStableDocumentMetadata(current: ComparableEvidence, previous: ComparableEvidence): void {
  const pairs: Array<[string, string | undefined, string | undefined]> = [
    ['acceptedAt', current.identity.acceptedAt, previous.identity.acceptedAt],
    ['knownAt', current.identity.knownAt, previous.identity.knownAt],
    ['effectiveAt', current.identity.effectiveAt, previous.identity.effectiveAt],
    ['effectiveDate', current.identity.effectiveDate, previous.identity.effectiveDate],
    ['effectiveTimePrecision', current.identity.effectiveTimePrecision, previous.identity.effectiveTimePrecision],
  ];
  for (const [field, currentValue, previousValue] of pairs) {
    if (currentValue !== undefined && previousValue !== undefined && currentValue !== previousValue) {
      throw new Error(`conflicting ${field} for risk evidence identity: ${current.identity.key}`);
    }
  }
}

export function compareRiskTicketEvidence(input: CompareRiskTicketEvidenceInput): RiskChangeBaseline {
  const current = comparableEvidence(input.current);
  const previous = input.previous ? comparableEvidence(input.previous) : [];
  if (input.previous && input.previous.ticker !== input.current.ticker) {
    throw new Error('risk change baseline cannot compare different tickers');
  }
  const previousAsKnownAtMs = input.previous
    ? exactEpoch(input.previous.asKnownAt, 'previous risk ticket asKnownAt')
    : undefined;
  const currentAsKnownAtMs = exactEpoch(input.current.asKnownAt, 'current risk ticket asKnownAt');
  if (previousAsKnownAtMs !== undefined && currentAsKnownAtMs < previousAsKnownAtMs) {
    throw new Error('current risk ticket predates previous baseline');
  }

  const previousByIdentity = new Map(previous.map((evidence) => [evidence.identity.key, evidence]));
  const changes = current.map((evidence): RiskEvidenceChange => {
    const prior = previousByIdentity.get(evidence.identity.key);
    if (prior) assertStableDocumentMetadata(evidence, prior);
    return {
      kind: changeKind(evidence, prior),
      identity: evidence.identity,
      currentStatus: evidence.status,
      ...(prior ? { previousStatus: prior.status } : {}),
      source: evidence.source,
    };
  }).sort((left, right) => left.identity.key.localeCompare(right.identity.key)
    || left.kind.localeCompare(right.kind));

  return {
    schemaVersion: RISK_CHANGE_BASELINE_SCHEMA_VERSION,
    ticker: input.current.ticker,
    ...(input.previous ? { previousAsKnownAt: input.previous.asKnownAt } : {}),
    currentAsKnownAt: input.current.asKnownAt,
    changes,
  };
}
