import type {
  CorporateAction,
  CorporateActionEffectiveTimePrecision,
  FundamentalSnapshot,
} from '../../../shared/market-data/contracts.ts';
import {
  formatCorporateActionSplit,
  resolveCorporateActionEffectiveTime,
} from '../../../shared/market-data/corporate-action-semantics.ts';
import type {
  ContextSnapshot,
  CorporateActionContextItem,
  FilingContextItem,
} from './signal-lab-contract.ts';
import { contextKnownAt } from './signal-lab-core.ts';
import type {
  CompanySignal,
  ListCompanySignalsResponse,
} from '@/generated/client/worldmonitor/intelligence/v1/service_client';

export const RISK_TICKET_SCHEMA_VERSION = 'ticker-360-risk-ticket/v2' as const;

export const RISK_TICKET_TYPES = [
  'ATM',
  'OFFERING',
  'DILUTION',
  'SHARES_OUTSTANDING',
  'REVERSE_SPLIT',
  'LISTING_COMPLIANCE',
  'WARRANT_OR_PREFERRED',
] as const;

export type RiskTicketType = (typeof RISK_TICKET_TYPES)[number];
export const EVIDENCE_STATES = [
  'CONFIRMED',
  'NOT_FOUND',
  'NOT_WIRED',
  'STALE',
  'UNAVAILABLE',
  'INSUFFICIENT',
  'NOT_APPLICABLE',
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];
export type RiskTicketStatus = EvidenceState;
export type RiskTicketConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';
export type RiskEvidenceCoverage = 'COMPLETE' | 'NOT_WIRED' | 'STALE' | 'UNAVAILABLE' | 'INSUFFICIENT';
export type RiskEvidenceDomain = 'FILINGS' | 'FUNDAMENTALS' | 'CORPORATE_ACTIONS' | 'RECENT_SEC_FILINGS';
export type RiskEvidenceDelivery = 'CANONICAL_RUNTIME' | 'CANONICAL_ARTIFACT' | 'PUBLIC_SNAPSHOT';

export interface EvidenceEvaluation {
  state: EvidenceState;
  verdict: string;
  confidence: RiskTicketConfidence;
  evidenceIds: string[];
  observedAt?: string;
  reason: string;
  counterEvidence: string[];
  missingEvidence: string[];
  nextChecks: string[];
}

export interface RiskTicketSource {
  evidenceId: string;
  provider: string;
  dataset: string;
  deliveryProvenance: RiskEvidenceDelivery;
  acceptedAt?: string;
  sourceTimestamp?: string;
  fetchedAt?: string;
  href?: string;
  form?: string;
  items?: string[];
  accessionNumber?: string;
  originalTitle?: string;
  originalExcerpt?: string;
}

export interface RiskMaterialValue {
  display: string;
  numericValue?: number;
  unit?: string;
  evidenceId: string;
}

export interface RiskMaterialDiff {
  field: string;
  before?: RiskMaterialValue;
  after: RiskMaterialValue;
  knownAt: string;
  effectiveAt?: string;
  effectiveDate?: string;
  effectiveTimePrecision?: CorporateActionEffectiveTimePrecision;
  source: RiskTicketSource;
  status: 'CONFIRMED' | 'INSUFFICIENT';
  confidence: RiskTicketConfidence;
}

export interface RiskTicketItem {
  riskType: RiskTicketType;
  label: string;
  status: RiskTicketStatus;
  summary: string;
  whyItMatters: string;
  knownAt?: string;
  effectiveAt?: string;
  effectiveDate?: string;
  effectiveTimePrecision?: CorporateActionEffectiveTimePrecision;
  sources: RiskTicketSource[];
  materialDiff?: RiskMaterialDiff;
  /** Canonical source for both status and explanatory copy. */
  evaluation: EvidenceEvaluation;
}

export interface RiskTicket {
  schemaVersion: typeof RISK_TICKET_SCHEMA_VERSION;
  ticker: string;
  instrumentId?: string;
  asKnownAt: string;
  items: RiskTicketItem[];
}

export interface BuildRiskTicketInput {
  ticker: string;
  asKnownAt: string;
  instrumentId?: string;
  filings?: readonly FilingContextItem[];
  contextSnapshot?: ContextSnapshot;
  fundamentals?: FundamentalSnapshot;
  corporateActions?: readonly CorporateAction[];
  companySignals?: ListCompanySignalsResponse;
  coverage?: Partial<Record<RiskEvidenceDomain, RiskEvidenceCoverage>>;
  deliveryProvenance?: RiskEvidenceDelivery;
  assetClass?: 'EQUITY' | 'ETF' | 'FUND' | 'INDEX' | 'UNKNOWN';
}

interface EvidenceCandidate {
  riskType: RiskTicketType;
  summary: string;
  knownAt: string;
  effectiveAt?: string;
  effectiveDate?: string;
  effectiveTimePrecision?: CorporateActionEffectiveTimePrecision;
  source: RiskTicketSource;
  status: 'CONFIRMED' | 'INSUFFICIENT';
  confidence: RiskTicketConfidence;
  supersedesEvidenceIds?: string[];
  materialDiff?: RiskMaterialDiff;
}

const TYPE_META: Record<RiskTicketType, { label: string; whyItMatters: string }> = {
  ATM: {
    label: 'ATM facility',
    whyItMatters: 'An at-the-market facility can add sale capacity and change near-term dilution risk.',
  },
  OFFERING: {
    label: 'Offering',
    whyItMatters: 'A new or amended offering can change cash runway, float, and supply pressure.',
  },
  DILUTION: {
    label: 'Dilution evidence',
    whyItMatters: 'New equity or a rising share count can reduce each existing share’s ownership percentage.',
  },
  SHARES_OUTSTANDING: {
    label: 'Shares outstanding',
    whyItMatters: 'A point-in-time share-count change helps distinguish capital-structure change from price action.',
  },
  REVERSE_SPLIT: {
    label: 'Reverse split',
    whyItMatters: 'A reverse split changes share units and can be associated with listing-compliance remediation.',
  },
  LISTING_COMPLIANCE: {
    label: 'Listing compliance',
    whyItMatters: 'A deficiency, delisting notice, or regained-compliance event can materially affect tradability.',
  },
  WARRANT_OR_PREFERRED: {
    label: 'Warrant / preferred',
    whyItMatters: 'Convertible or exercisable securities can change future common-share supply and priority claims.',
  },
};

const NO_DISCLOSURE_RE = /\b(no|none|not)\b.{0,36}\b(atm|offering|dilution|warrant|preferred|issuance)\b/i;

function exactEpoch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/.exec(value);
  if (!match) return undefined;
  const parsed = Date.parse(value);
  const canonical = `${match[1]}.${match[2] ?? '000'}Z`;
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonical ? parsed : undefined;
}

function requiredExactEpoch(value: string, label: string): number {
  const parsed = exactEpoch(value);
  if (parsed === undefined) throw new Error(`${label} must be an exact UTC ISO timestamp`);
  return parsed;
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isOfficialSecUrl(value: string | undefined): boolean {
  if (!value) return false;
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return url.protocol === 'https:' && (host === 'sec.gov' || host.endsWith('.sec.gov'));
}

function filingUrlMatchesAccession(href: string | undefined, accessionNumber: string): boolean {
  if (!href || !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber)) return false;
  const match = /^\/Archives\/edgar\/data\/\d+\/(\d{18})\/(\d{10}-\d{2}-\d{6})-index\.html?$/i
    .exec(new URL(href).pathname);
  return match?.[1] === accessionNumber.replace(/-/g, '') && match[2] === accessionNumber;
}

function filingUrlCik(href: string | undefined): string | undefined {
  if (!href || !isOfficialSecUrl(href)) return undefined;
  const match = /^\/Archives\/edgar\/data\/(\d+)\/\d{18}\/\d{10}-\d{2}-\d{6}-index\.html?$/i
    .exec(new URL(href).pathname);
  return match?.[1]?.padStart(10, '0');
}

function sourceForFiling(
  filing: FilingContextItem,
  cutoffMs: number,
  deliveryProvenance: RiskEvidenceDelivery,
): { source: RiskTicketSource; malformed: boolean } {
  const rawHref = filing.provenance.sourceUrl;
  const href = safeHttpUrl(rawHref);
  const officialHref = href && isOfficialSecUrl(href) ? href : undefined;
  const acceptedMs = exactEpoch(filing.acceptedAt);
  const fetchedMs = exactEpoch(filing.provenance.fetchedAt);
  const knowledgeMs = filing.provenance.knowledgeTime.precision === 'EXACT_TIME'
    ? exactEpoch(filing.provenance.knowledgeTime.asKnownAt)
    : undefined;
  const publicSnapshotMalformed = deliveryProvenance === 'PUBLIC_SNAPSHOT' && (
    filing.provenance.sourceId !== `sec:${filing.accessionNumber}`
    || filing.provenance.provider !== 'U.S. Securities and Exchange Commission'
    || !filing.provenance.dataset.startsWith('PUBLIC_SNAPSHOT')
    || exactEpoch(filing.provenance.sourceTimestamp) !== acceptedMs
    || filing.provenance.licenseClass !== 'PUBLIC_FACTS'
    || filing.provenance.redistribution !== 'COMMIT_ALLOWED'
  );
  const malformed = !filing.provenance.sourceId.trim()
    || !filing.provenance.provider.trim()
    || !filing.provenance.dataset.trim()
    || !href
    || !isOfficialSecUrl(href)
    || !filingUrlMatchesAccession(href, filing.accessionNumber)
    || acceptedMs === undefined
    || knowledgeMs === undefined
    || fetchedMs === undefined
    || fetchedMs < Math.max(acceptedMs ?? 0, knowledgeMs ?? 0)
    || fetchedMs > cutoffMs
    || publicSnapshotMalformed;
  return {
    source: {
      evidenceId: filing.accessionNumber,
      provider: filing.provenance.provider || 'Unknown provider',
      dataset: filing.provenance.dataset || 'Unknown dataset',
      deliveryProvenance,
      ...(filing.acceptedAt ? { acceptedAt: filing.acceptedAt, sourceTimestamp: filing.acceptedAt } : {}),
      ...(filing.provenance.fetchedAt ? { fetchedAt: filing.provenance.fetchedAt } : {}),
      ...(officialHref ? { href: officialHref } : {}),
      form: filing.form,
      items: [...filing.items],
      accessionNumber: filing.accessionNumber,
      originalTitle: `SEC ${filing.form} filing`,
      ...(filing.offeringEvidence.length ? { originalExcerpt: filing.offeringEvidence.join('\n') } : {}),
    },
    malformed,
  };
}

function sourceForAction(
  action: CorporateAction,
  cutoffMs: number,
  deliveryProvenance: RiskEvidenceDelivery,
): { source: RiskTicketSource; malformed: boolean } {
  const rawHref = action.provenance.sourceUrl;
  const href = safeHttpUrl(rawHref);
  const acceptedMs = exactEpoch(action.asKnownAt);
  const fetchedMs = exactEpoch(action.fetchedAt);
  let effectiveTimeMalformed = false;
  try {
    resolveCorporateActionEffectiveTime(action);
  } catch {
    effectiveTimeMalformed = true;
  }
  const publicSnapshotMalformed = deliveryProvenance === 'PUBLIC_SNAPSHOT' && (
    !href
    || !isOfficialSecUrl(href)
    || !filingUrlMatchesAccession(href, action.sourceActionId)
    || !/^\d{10}-\d{2}-\d{6}$/.test(action.sourceActionId)
    || !action.issuerCik
    || action.issuerCik !== filingUrlCik(href)
    || action.provenance.provider !== 'U.S. Securities and Exchange Commission'
    || action.provenance.source !== 'sec_edgar'
    || !action.provenance.dataset.startsWith('PUBLIC_SNAPSHOT')
    || action.provenance.derivation !== 'DERIVED'
    || action.provenance.licenseClass !== 'PUBLIC_FACTS'
    || action.provenance.redistribution !== 'COMMIT_ALLOWED'
    || action.knowledgeTimePrecision !== 'EXACT_TIMESTAMP'
    || action.effectiveTimePrecision !== 'EXACT_TIMESTAMP'
    || !action.effectiveAt
    || !action.effectiveLocalDateTime
    || !action.effectiveTimeZone
    || acceptedMs === undefined
    || exactEpoch(action.sourceTimestamp) !== acceptedMs
    || exactEpoch(action.provenance.asKnownAt) !== acceptedMs
    || exactEpoch(action.provenance.sourceTimestamp) !== acceptedMs
    || fetchedMs === undefined
    || exactEpoch(action.provenance.fetchedAt) !== fetchedMs
    || fetchedMs < (acceptedMs ?? 0)
    || fetchedMs > cutoffMs
  );
  const malformed = !action.provenance.provider.trim()
    || !action.provenance.dataset.trim()
    || !action.provenance.source.trim()
    || Boolean(rawHref && !href)
    || effectiveTimeMalformed
    || publicSnapshotMalformed;
  const officialHref = deliveryProvenance === 'PUBLIC_SNAPSHOT'
    ? href && isOfficialSecUrl(href) ? href : undefined
    : href;
  return {
    source: {
      evidenceId: deliveryProvenance === 'PUBLIC_SNAPSHOT' ? action.sourceActionId : action.actionId,
      provider: action.provenance.provider || 'Unknown provider',
      dataset: action.provenance.dataset || 'Unknown dataset',
      deliveryProvenance,
      ...(action.asKnownAt ? { acceptedAt: action.asKnownAt, sourceTimestamp: action.asKnownAt } : {}),
      ...(action.provenance.fetchedAt ? { fetchedAt: action.provenance.fetchedAt } : {}),
      ...(officialHref ? { href: officialHref } : {}),
      form: '8-K',
      accessionNumber: action.sourceActionId,
      originalTitle: `SEC 8-K corporate action filing`,
    },
    malformed,
  };
}

function contextActionKnownAt(action: CorporateActionContextItem): string | undefined {
  if (!action.announcedAt || action.provenance.knowledgeTime.precision !== 'EXACT_TIME') return undefined;
  const announced = exactEpoch(action.announcedAt);
  const knowledge = exactEpoch(action.provenance.knowledgeTime.asKnownAt);
  if (announced === undefined || knowledge === undefined) return undefined;
  return announced >= knowledge ? action.announcedAt : action.provenance.knowledgeTime.asKnownAt;
}

function sourceForContextAction(
  action: CorporateActionContextItem,
  knownAt: string,
): { source: RiskTicketSource; malformed: boolean } {
  const rawHref = action.provenance.sourceUrl;
  const href = safeHttpUrl(rawHref);
  const malformed = !action.provenance.sourceId.trim()
    || !action.provenance.provider.trim()
    || !action.provenance.dataset.trim()
    || Boolean(rawHref && !href);
  return {
    source: {
      evidenceId: action.actionId,
      provider: action.provenance.provider || 'Unknown provider',
      dataset: action.provenance.dataset || 'Unknown dataset',
      deliveryProvenance: 'CANONICAL_ARTIFACT',
      sourceTimestamp: knownAt,
      fetchedAt: action.provenance.fetchedAt,
      ...(href ? { href } : {}),
    },
    malformed,
  };
}

function accessionFromSecFilingIndex(href: string | undefined): string | undefined {
  if (!href || !isOfficialSecUrl(href)) return undefined;
  const match = /^\/Archives\/edgar\/data\/\d+\/(\d{18})\/(\d{10}-\d{2}-\d{6})-index\.html?$/i
    .exec(new URL(href).pathname);
  if (!match) return undefined;
  return match[1] === match[2]?.replace(/-/g, '') ? match[2] : undefined;
}

function sourceForSignal(
  signal: CompanySignal,
  fetchedAt: string | undefined,
): { source: RiskTicketSource; malformed: boolean } {
  const href = safeHttpUrl(signal.url);
  const officialHref = href && isOfficialSecUrl(href) ? href : undefined;
  const accession = accessionFromSecFilingIndex(href);
  const timestamp = Number.isFinite(signal.timestampMs) && signal.timestampMs > 0
    ? new Date(signal.timestampMs).toISOString()
    : undefined;
  const fetchedMs = exactEpoch(fetchedAt);
  return {
    source: {
      evidenceId: accession ?? [signal.source, signal.type, signal.timestampMs, signal.url].join('|'),
      provider: signal.source || 'Unknown provider',
      dataset: 'Recent SEC filing evidence',
      deliveryProvenance: 'CANONICAL_RUNTIME',
      ...(timestamp ? { acceptedAt: timestamp, sourceTimestamp: timestamp } : {}),
      ...(fetchedAt ? { fetchedAt } : {}),
      ...(officialHref ? { href: officialHref } : {}),
      ...(signal.form ? { form: signal.form } : {}),
      ...(signal.accessionNumber ? { accessionNumber: signal.accessionNumber } : {}),
      ...(signal.title ? { originalTitle: signal.title } : {}),
      ...(signal.evidenceExcerpt ? { originalExcerpt: signal.evidenceExcerpt } : {}),
    },
    malformed: signal.source !== 'sec_edgar'
      || signal.sourceTier !== 1
      || !timestamp
      || !accession
      || (signal.accessionNumber && signal.accessionNumber !== accession)
      || fetchedMs === undefined
      || fetchedMs < signal.timestampMs,
  };
}

function latestKnowledgeTime(filing: FilingContextItem): string | undefined {
  if (!filing.acceptedAt || filing.provenance.knowledgeTime.precision !== 'EXACT_TIME') return undefined;
  const accepted = exactEpoch(filing.acceptedAt);
  const knowledge = exactEpoch(filing.provenance.knowledgeTime.asKnownAt);
  if (accepted === undefined || knowledge === undefined) return undefined;
  return accepted >= knowledge ? filing.acceptedAt : filing.provenance.knowledgeTime.asKnownAt;
}

function classifyOfferingEvidence(value: string): RiskTicketType[] {
  if (!value.trim() || NO_DISCLOSURE_RE.test(value)) return [];
  const types: RiskTicketType[] = [];
  if (/\b(atm|at[- ]the[- ]market)\b/i.test(value)) types.push('ATM');
  if (/\b(offering|registered direct|public sale|private placement)\b/i.test(value)) types.push('OFFERING');
  if (/\b(dilution|dilutive|issued shares|equity issuance|unregistered sale)\b/i.test(value)) types.push('DILUTION');
  if (/\b(warrant|preferred (?:stock|share|equity)|convertible preferred)\b/i.test(value)) {
    types.push('WARRANT_OR_PREFERRED');
  }
  return [...new Set(types)];
}

function filingCandidates(input: BuildRiskTicketInput, cutoffMs: number): EvidenceCandidate[] {
  const dedup = new Map<string, { filing: FilingContextItem; text: string }>();
  const conflicts = new Set<string>();
  const signaturesByAccession = new Map<string, Set<string>>();
  for (const filing of input.filings ?? []) {
    const knownAt = latestKnowledgeTime(filing);
    const knownMs = exactEpoch(knownAt);
    if (knownMs === undefined || knownMs > cutoffMs) continue;
    const signature = JSON.stringify({
      form: filing.form.trim().toUpperCase(),
      acceptedAt: filing.acceptedAt,
      items: [...filing.items].map((value) => value.trim()).filter(Boolean).sort(),
      offeringEvidence: [...filing.offeringEvidence].map((value) => value.trim()).filter(Boolean).sort(),
      sourceUrl: filing.provenance.sourceUrl,
    });
    const signatures = signaturesByAccession.get(filing.accessionNumber) ?? new Set<string>();
    signatures.add(signature);
    signaturesByAccession.set(filing.accessionNumber, signatures);
    for (const raw of filing.offeringEvidence) {
      const evidence = raw.trim();
      if (!evidence) continue;
      const key = `${filing.accessionNumber}|${evidence.toLowerCase()}`;
      if (!dedup.has(key)) dedup.set(key, { filing, text: evidence });
    }
  }

  for (const [accession, signatures] of signaturesByAccession) {
    if (signatures.size > 1) conflicts.add(accession);
  }

  const candidates: EvidenceCandidate[] = [];
  const structured = new Map<string, FilingContextItem>();
  for (const filing of input.filings ?? []) {
    const knownAt = latestKnowledgeTime(filing);
    const knownMs = exactEpoch(knownAt);
    if (knownMs === undefined || knownMs > cutoffMs || !/^8-K(?:\/A)?$/i.test(filing.form.trim())) continue;
    const itemCodes = new Set(filing.items.map((item) => item.trim().replace(/^Item\s+/i, '')));
    if (!itemCodes.has('3.01') && !itemCodes.has('3.02')) continue;
    if (!structured.has(filing.accessionNumber)) structured.set(filing.accessionNumber, filing);
  }
  for (const filing of structured.values()) {
    const knownAt = latestKnowledgeTime(filing)!;
    const { source, malformed } = sourceForFiling(
      filing,
      cutoffMs,
      input.deliveryProvenance ?? 'CANONICAL_ARTIFACT',
    );
    const conflicted = conflicts.has(filing.accessionNumber);
    const status = malformed || conflicted ? 'INSUFFICIENT' as const : 'CONFIRMED' as const;
    const confidence = status === 'CONFIRMED' ? 'HIGH' as const : 'UNRESOLVED' as const;
    const itemCodes = new Set(filing.items.map((item) => item.trim().replace(/^Item\s+/i, '')));
    if (itemCodes.has('3.01')) {
      candidates.push({
        riskType: 'LISTING_COMPLIANCE',
        summary: 'SEC Form 8-K Item 3.01 reports a notice or failure involving a continued-listing rule.',
        knownAt,
        source,
        status,
        confidence,
      });
    }
    if (itemCodes.has('3.02')) {
      candidates.push({
        riskType: 'DILUTION',
        summary: 'SEC Form 8-K Item 3.02 reports an unregistered sale of equity securities.',
        knownAt,
        source,
        status,
        confidence,
      });
    }
  }
  for (const { filing, text } of dedup.values()) {
    const knownAt = latestKnowledgeTime(filing)!;
    const { source } = sourceForFiling(
      filing,
      cutoffMs,
      input.deliveryProvenance ?? 'CANONICAL_ARTIFACT',
    );
    // Free text remains useful context, but keywords are not a reviewed
    // classification basis and therefore never establish CONFIRMED evidence.
    for (const riskType of classifyOfferingEvidence(text)) {
      candidates.push({
        riskType,
        summary: text,
        knownAt,
        source,
        status: 'INSUFFICIENT',
        confidence: 'UNRESOLVED',
        ...(filing.amendmentOf ? { supersedesEvidenceIds: [filing.amendmentOf] } : {}),
      });
    }
  }
  return candidates;
}

function shareCandidates(input: BuildRiskTicketInput, cutoffMs: number): EvidenceCandidate[] {
  const snapshot = input.fundamentals;
  if (!snapshot || exactEpoch(snapshot.asKnownAt) === undefined || exactEpoch(snapshot.asKnownAt)! > cutoffMs) return [];
  const shareFacts = snapshot.selectedFacts
    .filter((fact) => fact.canonicalMetric === 'SHARES_OUTSTANDING')
    .filter((fact) => {
      const known = exactEpoch(fact.factAsKnownAt);
      return known !== undefined && known <= cutoffMs;
    });
  const shareFactIds = new Set(shareFacts.map((fact) => fact.factId));
  const missingShares = snapshot.missingMetrics.includes('SHARES_OUTSTANDING');
  const unitConflict = shareFacts.some((fact) =>
    fact.unit !== 'shares' || !Number.isFinite(fact.value) || fact.value <= 0)
    || snapshot.conflicts.some((conflict) =>
      ['INCOMPATIBLE_UNITS', 'CANONICAL_MAPPING_CONFLICT', 'CONFLICTING_DUPLICATE'].includes(conflict.code)
      && (conflict.field === 'unit' || conflict.field === 'value')
      && (conflict.recordIds.some((recordId) => shareFactIds.has(recordId))
        || (shareFacts.length === 0 && missingShares)));
  const unique = new Map<string, (typeof shareFacts)[number]>();
  let duplicateConflict = false;
  for (const fact of shareFacts) {
    const prior = unique.get(fact.factId);
    if (prior && (prior.value !== fact.value || prior.unit !== fact.unit || prior.factAsKnownAt !== fact.factAsKnownAt)) {
      duplicateConflict = true;
    } else if (!prior) unique.set(fact.factId, fact);
  }
  const facts = [...unique.values()];
  const byPeriod = new Map<string, typeof facts>();
  for (const fact of facts) {
    const period = byPeriod.get(fact.periodEnd) ?? [];
    period.push(fact);
    byPeriod.set(fact.periodEnd, period);
  }
  let contradictory = false;
  const periodFacts = [...byPeriod.values()].map((period) => {
    const sorted = [...period].sort((left, right) =>
      requiredExactEpoch(left.factAsKnownAt, 'factAsKnownAt') - requiredExactEpoch(right.factAsKnownAt, 'factAsKnownAt')
      || left.factId.localeCompare(right.factId));
    const latestFact = sorted[sorted.length - 1]!;
    const latestKnownMs = requiredExactEpoch(latestFact.factAsKnownAt, 'factAsKnownAt');
    if (new Set(sorted
      .filter((fact) => requiredExactEpoch(fact.factAsKnownAt, 'factAsKnownAt') === latestKnownMs)
      .map((fact) => fact.value)).size > 1) contradictory = true;
    return latestFact;
  }).sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)
    || requiredExactEpoch(left.factAsKnownAt, 'factAsKnownAt') - requiredExactEpoch(right.factAsKnownAt, 'factAsKnownAt')
    || left.factId.localeCompare(right.factId));
  if (!facts.length && (unitConflict || snapshot.unresolvedKnowledgeFactIds.length > 0)) {
    return [{
      riskType: 'SHARES_OUTSTANDING',
      summary: 'Shares-outstanding evidence is present but cannot be selected safely.',
      knownAt: snapshot.asKnownAt,
      source: {
        evidenceId: snapshot.snapshotId,
        provider: 'Canonical fundamental snapshot',
        dataset: 'DATA-US SEC fundamentals',
        deliveryProvenance: 'CANONICAL_ARTIFACT',
        sourceTimestamp: snapshot.asKnownAt,
      },
      status: 'INSUFFICIENT',
      confidence: 'UNRESOLVED',
    }];
  }
  if (!periodFacts.length) return [];
  const current = periodFacts[periodFacts.length - 1]!;
  const previous = [...periodFacts].reverse().slice(1)
    .find((fact) => fact.value !== current.value || fact.unit !== current.unit);
  const source: RiskTicketSource = {
    evidenceId: current.factId,
    provider: 'U.S. Securities and Exchange Commission',
    dataset: `SEC companyfacts · ${current.accessionNumber}`,
    deliveryProvenance: 'CANONICAL_ARTIFACT',
    sourceTimestamp: current.factAsKnownAt,
  };
  const needsReview = unitConflict || duplicateConflict || contradictory
    || current.revisionStatus === 'UNKNOWN';
  const materialDiff = previous && !needsReview ? {
    field: 'sharesOutstanding',
    before: {
      display: `${previous.value.toLocaleString('en-US')} shares (${previous.revisionStatus})`,
      numericValue: previous.value,
      unit: previous.unit,
      evidenceId: previous.factId,
    },
    after: {
      display: `${current.value.toLocaleString('en-US')} shares (${current.revisionStatus})`,
      numericValue: current.value,
      unit: current.unit,
      evidenceId: current.factId,
    },
    knownAt: current.factAsKnownAt,
    source,
    status: 'CONFIRMED' as const,
    confidence: 'HIGH' as const,
  } : undefined;
  const candidates: EvidenceCandidate[] = [{
    riskType: 'SHARES_OUTSTANDING',
    summary: needsReview
      ? 'Conflicting or unit-incompatible shares-outstanding evidence requires review.'
      : previous
        ? `Shares outstanding changed from ${previous.value.toLocaleString('en-US')} to ${current.value.toLocaleString('en-US')} (${current.revisionStatus}).`
        : `${current.value.toLocaleString('en-US')} shares outstanding (${current.revisionStatus}); no comparable prior selected fact is available.`,
    knownAt: current.factAsKnownAt,
    source,
    status: needsReview ? 'INSUFFICIENT' : 'CONFIRMED',
    confidence: needsReview ? 'UNRESOLVED' : previous ? 'HIGH' : 'MEDIUM',
    ...(materialDiff ? { materialDiff } : {}),
  }];
  if (previous && current.value > previous.value && !needsReview) {
    const dilutionDiff: RiskMaterialDiff = {
      ...materialDiff!,
      status: 'INSUFFICIENT',
      confidence: 'UNRESOLVED',
    };
    candidates.push({
      riskType: 'DILUTION',
      summary: `Reported shares outstanding increased by ${(((current.value / previous.value) - 1) * 100).toFixed(1)}%; issuance or split reconciliation is still required.`,
      knownAt: current.factAsKnownAt,
      source,
      status: 'INSUFFICIENT',
      confidence: 'UNRESOLVED',
      materialDiff: dilutionDiff,
    });
  }
  return candidates;
}

function actionCandidates(input: BuildRiskTicketInput, cutoffMs: number): EvidenceCandidate[] {
  const grouped = new Map<string, CorporateAction[]>();
  for (const action of input.corporateActions ?? []) {
    const knownMs = exactEpoch(action.asKnownAt);
    if (knownMs === undefined || knownMs > cutoffMs) continue;
    if (input.instrumentId && action.instrumentId !== input.instrumentId
      && !action.relatedInstrumentIds.includes(input.instrumentId)) continue;
    const group = grouped.get(action.actionId) ?? [];
    group.push(action);
    grouped.set(action.actionId, group);
  }
  const candidates: EvidenceCandidate[] = [];
  for (const actions of grouped.values()) {
    const action = actions[0]!;
    const duplicateConflict = actions.some((candidate) =>
      candidate.actionType !== action.actionType
      || candidate.status !== action.status
      || candidate.asKnownAt !== action.asKnownAt
      || JSON.stringify(candidate.splitRatio) !== JSON.stringify(action.splitRatio));
    const { source, malformed } = sourceForAction(
      action,
      cutoffMs,
      input.deliveryProvenance ?? 'CANONICAL_ARTIFACT',
    );
    let effectiveTime: ReturnType<typeof resolveCorporateActionEffectiveTime> | undefined;
    try {
      effectiveTime = resolveCorporateActionEffectiveTime(action);
    } catch {
      effectiveTime = undefined;
    }
    const effectiveFields = effectiveTime ? {
      effectiveTimePrecision: effectiveTime.precision,
      ...(effectiveTime.effectiveAt ? { effectiveAt: effectiveTime.effectiveAt } : {}),
      ...(effectiveTime.effectiveDate ? { effectiveDate: effectiveTime.effectiveDate } : {}),
    } : { effectiveTimePrecision: 'UNKNOWN' as const };
    const baseNeedsReview = duplicateConflict || malformed || !effectiveTime || action.status === 'UNKNOWN'
      || action.quality !== 'GOOD'
      || action.conflicts.some((conflict) => conflict.resolution !== 'DETERMINISTIC_PRECEDENCE');
    if (action.actionType === 'REVERSE_SPLIT') {
      const ratio = action.splitRatio;
      let formattedRatio: ReturnType<typeof formatCorporateActionSplit> | undefined;
      try {
        formattedRatio = ratio ? formatCorporateActionSplit('REVERSE_SPLIT', ratio) : undefined;
      } catch {
        formattedRatio = undefined;
      }
      const invalidRatio = !formattedRatio;
      const needsReview = baseNeedsReview || invalidRatio;
      const after = formattedRatio
        ? `${formattedRatio.conversionLabel} (${formattedRatio.ratioLabel}; ${action.status})`
        : `Ratio unavailable (${action.status})`;
      candidates.push({
        riskType: 'REVERSE_SPLIT',
        summary: formattedRatio
          ? `Reverse split ${formattedRatio.ratioLabel} (${action.status}). ${formattedRatio.conversionLabel}.`
          : `Reverse split ${after}.`,
        knownAt: action.asKnownAt!,
        ...effectiveFields,
        source,
        status: needsReview ? 'INSUFFICIENT' : 'CONFIRMED',
        confidence: needsReview ? 'UNRESOLVED' : 'HIGH',
        ...(action.supersedesActionIds.length
          ? { supersedesEvidenceIds: [...action.supersedesActionIds] }
          : {}),
        materialDiff: {
          field: 'reverseSplit',
          after: { display: after, evidenceId: action.actionId },
          knownAt: action.asKnownAt!,
          ...effectiveFields,
          source,
          status: needsReview ? 'INSUFFICIENT' : 'CONFIRMED',
          confidence: needsReview ? 'UNRESOLVED' : 'HIGH',
        },
      });
    }
    if (action.actionType === 'DELISTING' || action.actionType === 'LISTING') {
      const needsReview = baseNeedsReview;
      candidates.push({
        riskType: 'LISTING_COMPLIANCE',
        summary: `${action.actionType === 'DELISTING' ? 'Delisting' : 'Listing'} event is ${action.status.toLowerCase()}.`,
        knownAt: action.asKnownAt!,
        ...effectiveFields,
        source,
        status: needsReview ? 'INSUFFICIENT' : 'CONFIRMED',
        confidence: needsReview ? 'UNRESOLVED' : 'HIGH',
        ...(action.supersedesActionIds.length
          ? { supersedesEvidenceIds: [...action.supersedesActionIds] }
          : {}),
      });
    }
  }
  return candidates;
}

function contextActionCandidates(actions: readonly CorporateActionContextItem[]): EvidenceCandidate[] {
  return actions.flatMap((action): EvidenceCandidate[] => {
    const knownAt = contextActionKnownAt(action);
    if (!knownAt) return [];
    const { source, malformed } = sourceForContextAction(action, knownAt);
    if (action.type === 'REVERSE_SPLIT') {
      return [{
        riskType: 'REVERSE_SPLIT',
        summary: action.details,
        knownAt,
        ...(action.effectiveDate ? {
          effectiveDate: action.effectiveDate,
          effectiveTimePrecision: 'DATE_ONLY' as const,
        } : {}),
        source,
        status: malformed ? 'INSUFFICIENT' : 'CONFIRMED',
        confidence: malformed ? 'UNRESOLVED' : 'HIGH',
      }];
    }
    if (action.type === 'LISTING' || action.type === 'DELISTING') {
      return [{
        riskType: 'LISTING_COMPLIANCE',
        summary: action.details,
        knownAt,
        ...(action.effectiveDate ? {
          effectiveDate: action.effectiveDate,
          effectiveTimePrecision: 'DATE_ONLY' as const,
        } : {}),
        source,
        status: malformed ? 'INSUFFICIENT' : 'CONFIRMED',
        confidence: malformed ? 'UNRESOLVED' : 'HIGH',
      }];
    }
    return [];
  });
}

function companySignalCandidates(input: BuildRiskTicketInput, cutoffMs: number): EvidenceCandidate[] {
  if (!input.companySignals || input.companySignals.unavailable || !input.companySignals.cik) return [];
  const signals = input.companySignals?.signals ?? [];
  const dedup = new Map<string, CompanySignal>();
  const conflictKeys = new Set<string>();
  for (const signal of signals) {
    if (!Number.isFinite(signal.timestampMs) || signal.timestampMs <= 0 || signal.timestampMs > cutoffMs) continue;
    if (![
      'Delisting Risk',
      'Equity Issuance Evidence',
      'ATM Facility',
      'Offering Evidence',
      'Dilution Evidence',
      'Preferred Conversion Evidence',
      'Warrant Exercise Evidence',
      'Shares Outstanding Change',
      'Reverse Split',
      'Listing Compliance',
    ].includes(signal.type)) continue;
    const key = [signal.source, signal.url, signal.timestampMs, signal.type].join('|');
    const prior = dedup.get(key);
    if (prior && prior.title !== signal.title) conflictKeys.add(key);
    else if (!prior) dedup.set(key, signal);
  }
  const fetchedAt = Number.isFinite(input.companySignals.discoveredAtMs)
    && input.companySignals.discoveredAtMs > 0
    ? new Date(input.companySignals.discoveredAtMs).toISOString()
    : undefined;
  return [...dedup.entries()].flatMap(([key, signal]): EvidenceCandidate[] => {
    const { source, malformed } = sourceForSignal(signal, fetchedAt);
    const structuredItem = signal.type === 'Delisting Risk' || signal.type === 'Equity Issuance Evidence';
    const needsReview = malformed || conflictKeys.has(key) || (!structuredItem && !signal.evidenceExcerpt?.trim());
    const riskTypes: RiskTicketType[] = (() => {
      switch (signal.type) {
        case 'Delisting Risk':
        case 'Listing Compliance': return ['LISTING_COMPLIANCE'];
        case 'Equity Issuance Evidence':
        case 'Dilution Evidence': return ['DILUTION'];
        case 'ATM Facility': return ['ATM', 'OFFERING', 'DILUTION'];
        case 'Offering Evidence': return ['OFFERING', 'DILUTION'];
        case 'Preferred Conversion Evidence':
        case 'Warrant Exercise Evidence': return ['WARRANT_OR_PREFERRED', 'DILUTION'];
        case 'Shares Outstanding Change': return ['SHARES_OUTSTANDING'];
        case 'Reverse Split': return ['REVERSE_SPLIT'];
        default: return [];
      }
    })();
    const form = signal.form || 'SEC filing';
    const summary = structuredItem
      ? signal.type === 'Delisting Risk'
        ? 'SEC Form 8-K Item 3.01 reports a notice or failure involving a continued-listing rule.'
        : 'SEC Form 8-K Item 3.02 reports an unregistered sale of equity securities.'
      : `${form} contains filing evidence classified as ${signal.type}: ${signal.evidenceExcerpt}`;
    return riskTypes.map((riskType) => ({
      riskType,
      summary,
      knownAt: new Date(signal.timestampMs).toISOString(),
      source,
      status: needsReview ? 'INSUFFICIENT' : 'CONFIRMED',
      confidence: needsReview ? 'UNRESOLVED' : 'HIGH',
    }));
  });
}

function noEvidenceStatus(
  type: RiskTicketType,
  coverage: BuildRiskTicketInput['coverage'],
  assetClass: BuildRiskTicketInput['assetClass'],
): RiskTicketStatus {
  if (assetClass === 'ETF' || assetClass === 'FUND' || assetClass === 'INDEX') return 'NOT_APPLICABLE';
  const states = (domains: RiskEvidenceDomain[]): RiskEvidenceCoverage[] => domains
    .map((domain) => coverage?.[domain] ?? 'NOT_WIRED');
  const decide = (domains: RiskEvidenceDomain[]): RiskTicketStatus => {
    const available = states(domains);
    if (available.every((state) => state === 'COMPLETE')) return 'NOT_FOUND';
    if (available.includes('STALE')) return 'STALE';
    if (available.includes('UNAVAILABLE')) return 'UNAVAILABLE';
    if (available.includes('INSUFFICIENT')) return 'INSUFFICIENT';
    if (available.includes('COMPLETE')) return 'INSUFFICIENT';
    return 'NOT_WIRED';
  };
  // Some concepts can be decided by any one authoritative source family.
  // A completed SEC filing window, for example, is sufficient to say that no
  // filing-based reverse-split disclosure was found even when a separate
  // corporate-actions feed is not wired.
  const decideAny = (domains: RiskEvidenceDomain[]): RiskTicketStatus => {
    const available = states(domains);
    if (available.includes('COMPLETE')) return 'NOT_FOUND';
    if (available.includes('STALE')) return 'STALE';
    if (available.includes('UNAVAILABLE')) return 'UNAVAILABLE';
    if (available.includes('INSUFFICIENT')) return 'INSUFFICIENT';
    return 'NOT_WIRED';
  };
  switch (type) {
    case 'ATM':
    case 'OFFERING':
    case 'WARRANT_OR_PREFERRED':
      return decide(['FILINGS']);
    case 'SHARES_OUTSTANDING':
      return decide(['FUNDAMENTALS']);
    case 'REVERSE_SPLIT':
      return decideAny(['CORPORATE_ACTIONS', 'RECENT_SEC_FILINGS']);
    case 'LISTING_COMPLIANCE':
      return decideAny(['CORPORATE_ACTIONS', 'FILINGS', 'RECENT_SEC_FILINGS']);
    case 'DILUTION':
      return decide(['FILINGS', 'FUNDAMENTALS']);
  }
}

function emptySummary(type: RiskTicketType, status: RiskTicketStatus): string {
  switch (status) {
    case 'NOT_FOUND':
      return type === 'LISTING_COMPLIANCE'
        ? 'The bounded authoritative source query succeeded; no listing-compliance disclosure was found.'
        : 'The bounded authoritative source query succeeded; no supporting disclosure was found.';
    case 'NOT_WIRED': return 'The required source or parser is not wired for this evaluation.';
    case 'STALE': return 'The available evidence is too old for the requested judgment.';
    case 'UNAVAILABLE': return 'The required provider or authoritative source could not be reached.';
    case 'INSUFFICIENT': return 'Some relevant evidence was available, but it was insufficient to decide.';
    case 'NOT_APPLICABLE': return 'This corporate risk concept does not apply to this asset class.';
    case 'CONFIRMED': throw new Error('confirmed evidence requires a concrete reason');
  }
}

function evaluationFor(input: {
  riskType: RiskTicketType;
  state: EvidenceState;
  reason: string;
  confidence?: RiskTicketConfidence;
  sources: RiskTicketSource[];
  observedAt?: string;
}): EvidenceEvaluation {
  const evidenceIds = input.sources.map((source) => source.evidenceId)
    .filter((value, index, all) => all.indexOf(value) === index);
  const evaluation: EvidenceEvaluation = {
    state: input.state,
    verdict: input.state === 'CONFIRMED'
      ? `EVIDENCE_SUPPORTS_${input.riskType}`
      : input.state,
    confidence: input.confidence ?? 'UNRESOLVED',
    evidenceIds,
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    reason: input.reason,
    counterEvidence: [],
    missingEvidence: input.state === 'INSUFFICIENT' || input.state === 'NOT_WIRED'
      ? [`Additional authoritative ${input.riskType.toLowerCase().replace(/_/g, ' ')} evidence`]
      : [],
    nextChecks: ['Refresh the bounded authoritative source window when new evidence arrives.'],
  };
  assertEvidenceEvaluation(evaluation);
  return evaluation;
}

export function assertEvidenceEvaluation(evaluation: EvidenceEvaluation): void {
  if (!EVIDENCE_STATES.includes(evaluation.state)) throw new Error('invalid evidence state');
  if (!evaluation.reason.trim() || !evaluation.verdict.trim()) throw new Error('evidence evaluation requires verdict and reason');
  if (evaluation.state === 'CONFIRMED' && evaluation.evidenceIds.length === 0) {
    throw new Error('CONFIRMED evidence evaluation requires evidenceIds');
  }
  if (!['CONFIRMED', 'INSUFFICIENT'].includes(evaluation.state)
    && /\b(?:confirmed|evidence supports)\b|확인됐|확인됨/i.test(evaluation.reason)) {
    throw new Error(`${evaluation.state} evidence reason cannot claim confirmation`);
  }
}

export function buildRiskTicket(input: BuildRiskTicketInput): RiskTicket {
  const cutoffMs = requiredExactEpoch(input.asKnownAt, 'risk ticket asKnownAt');
  const ticker = input.ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(ticker)) throw new Error('risk ticket ticker is invalid');
  const knownContext = input.contextSnapshot
    ? contextKnownAt(input.contextSnapshot, input.asKnownAt)
    : undefined;
  const effectiveInput: BuildRiskTicketInput = knownContext ? {
    ...input,
    filings: [...(input.filings ?? []), ...knownContext.filings],
  } : input;
  const inferredCoverage: BuildRiskTicketInput['coverage'] = {
    ...input.coverage,
    ...(input.companySignals
      ? input.companySignals.unavailable
        ? { RECENT_SEC_FILINGS: 'UNAVAILABLE' as const, FILINGS: 'UNAVAILABLE' as const }
        : input.companySignals.cik
          ? {
            RECENT_SEC_FILINGS: input.companySignals.filingEvidenceState === 'UNAVAILABLE'
              ? 'UNAVAILABLE' as const
              : input.companySignals.filingEvidenceState === 'INSUFFICIENT'
                ? 'INSUFFICIENT' as const
                : 'COMPLETE' as const,
            FILINGS: input.companySignals.filingEvidenceState === 'UNAVAILABLE'
              ? 'UNAVAILABLE' as const
              : input.companySignals.filingEvidenceState === 'INSUFFICIENT'
                ? 'INSUFFICIENT' as const
                : 'COMPLETE' as const,
          }
          : {}
      : {}),
  };
  const candidates = [
    ...filingCandidates(effectiveInput, cutoffMs),
    ...shareCandidates(effectiveInput, cutoffMs),
    ...actionCandidates(effectiveInput, cutoffMs),
    ...contextActionCandidates(knownContext?.corporateActions ?? []),
    ...companySignalCandidates(effectiveInput, cutoffMs),
  ];
  const items = RISK_TICKET_TYPES.map((riskType): RiskTicketItem => {
    const meta = TYPE_META[riskType];
    const matching = candidates.filter((candidate) => candidate.riskType === riskType)
      .sort((left, right) => requiredExactEpoch(right.knownAt, 'candidate knownAt')
        - requiredExactEpoch(left.knownAt, 'candidate knownAt')
        || left.source.evidenceId.localeCompare(right.source.evidenceId));
    if (!matching.length) {
      const status = noEvidenceStatus(riskType, inferredCoverage, input.assetClass);
      const summary = emptySummary(riskType, status);
      return {
        riskType,
        label: meta.label,
        status,
        summary,
        whyItMatters: meta.whyItMatters,
        sources: [],
        evaluation: evaluationFor({ riskType, state: status, reason: summary, sources: [] }),
      };
    }
    const latest = matching[0]!;
    const needsReview = matching.some((candidate) => candidate.status === 'INSUFFICIENT');
    const prior = matching.find((candidate) =>
      latest.supersedesEvidenceIds?.includes(candidate.source.evidenceId));
    const materialDiff = latest.materialDiff ?? (prior ? {
      field: riskType,
      before: { display: prior.summary, evidenceId: prior.source.evidenceId },
      after: { display: latest.summary, evidenceId: latest.source.evidenceId },
      knownAt: latest.knownAt,
      ...(latest.effectiveAt ? { effectiveAt: latest.effectiveAt } : {}),
      ...(latest.effectiveDate ? { effectiveDate: latest.effectiveDate } : {}),
      ...(latest.effectiveTimePrecision ? { effectiveTimePrecision: latest.effectiveTimePrecision } : {}),
      source: latest.source,
      status: needsReview ? 'INSUFFICIENT' as const : 'CONFIRMED' as const,
      confidence: needsReview ? 'UNRESOLVED' as const : latest.confidence,
    } : undefined);
    const sources = matching.map((candidate) => candidate.source)
      .filter((source, index, all) => all.findIndex((item) => item.evidenceId === source.evidenceId) === index);
    const state = needsReview ? 'INSUFFICIENT' : 'CONFIRMED';
    return {
      riskType,
      label: meta.label,
      status: state,
      summary: latest.summary,
      whyItMatters: meta.whyItMatters,
      knownAt: latest.knownAt,
      ...(latest.effectiveAt ? { effectiveAt: latest.effectiveAt } : {}),
      ...(latest.effectiveDate ? { effectiveDate: latest.effectiveDate } : {}),
      ...(latest.effectiveTimePrecision ? { effectiveTimePrecision: latest.effectiveTimePrecision } : {}),
      sources,
      ...(materialDiff ? { materialDiff } : {}),
      evaluation: evaluationFor({
        riskType,
        state,
        reason: latest.summary,
        confidence: needsReview ? 'UNRESOLVED' : latest.confidence,
        sources,
        observedAt: latest.knownAt,
      }),
    };
  }).sort((left, right) => {
    const rank: Record<RiskTicketStatus, number> = {
      INSUFFICIENT: 0,
      CONFIRMED: 1,
      NOT_FOUND: 2,
      STALE: 3,
      UNAVAILABLE: 4,
      NOT_WIRED: 5,
      NOT_APPLICABLE: 6,
    };
    return rank[left.status] - rank[right.status]
      || (exactEpoch(right.knownAt) ?? Number.NEGATIVE_INFINITY)
        - (exactEpoch(left.knownAt) ?? Number.NEGATIVE_INFINITY)
      || RISK_TICKET_TYPES.indexOf(left.riskType) - RISK_TICKET_TYPES.indexOf(right.riskType);
  });
  const ticket: RiskTicket = {
    schemaVersion: RISK_TICKET_SCHEMA_VERSION,
    ticker,
    ...(input.instrumentId ? { instrumentId: input.instrumentId } : {}),
    asKnownAt: input.asKnownAt,
    items,
  };
  for (const item of ticket.items) {
    assertEvidenceEvaluation(item.evaluation);
    if (item.status !== item.evaluation.state || item.summary !== item.evaluation.reason) {
      throw new Error(`${item.riskType} status and copy must derive from one evaluation`);
    }
  }
  return ticket;
}
