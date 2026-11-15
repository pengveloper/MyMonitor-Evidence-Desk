/**
 * Bounded, frozen SEC facts for the owner-only static preview.
 *
 * The payload deliberately uses the existing FilingContextItem/RiskTicket
 * contracts. It is not a live feed and does not claim complete filing
 * coverage; symbols/categories absent here must remain UNAVAILABLE.
 */

import { DATA_US_CORPORATE_ACTION_SCHEMA_VERSION } from '../../../shared/market-data/contracts.ts';
import {
  formatCorporateActionSplit,
  resolveCorporateActionEffectiveTime,
} from '../../../shared/market-data/corporate-action-semantics.ts';
import type { StockResearchRiskEvidence } from './stock-research-overlay.ts';

const FETCHED_AT = '2026-09-08T00:00:00.000Z';
const DATASET = 'PUBLIC_SNAPSHOT · SEC EDGAR 8-K';
// EDGAR filing-index Accepted wall-clock values are normalized from US Eastern
// time to exact UTC instants before entering the PIT contract.

type SnapshotFiling = NonNullable<StockResearchRiskEvidence['filings']>[number];
type SnapshotAction = NonNullable<StockResearchRiskEvidence['corporateActions']>[number];

function secFiling(input: {
  accessionNumber: string;
  cik: string;
  acceptedAt: string;
  filingDate: string;
  items: readonly string[];
}): SnapshotFiling {
  const accessionPath = input.accessionNumber.replace(/-/g, '');
  return {
    accessionNumber: input.accessionNumber,
    form: '8-K',
    acceptedAt: input.acceptedAt,
    filingDate: input.filingDate,
    items: [...input.items],
    offeringEvidence: [],
    provenance: {
      sourceId: `sec:${input.accessionNumber}`,
      provider: 'U.S. Securities and Exchange Commission',
      dataset: DATASET,
      sourceUrl: `https://www.sec.gov/Archives/edgar/data/${input.cik}/${accessionPath}/${input.accessionNumber}-index.htm`,
      sourceTimestamp: input.acceptedAt,
      fetchedAt: FETCHED_AT,
      knowledgeTime: { precision: 'EXACT_TIME', asKnownAt: input.acceptedAt },
      licenseClass: 'PUBLIC_FACTS',
      redistribution: 'COMMIT_ALLOWED',
    },
  };
}

function secReverseSplit(input: {
  accessionNumber: string;
  cik: string;
  ticker: string;
  acceptedAt: string;
  announcementDate: string;
  effectiveLocalDateTime: string;
  effectiveTimeZone: string;
  fromQuantity: number;
  toQuantity: number;
}): SnapshotAction {
  // Ratio/effective-time values are reviewed facts from the linked filing,
  // then expressed through the existing canonical corporate-action contract.
  const effectiveTime = resolveCorporateActionEffectiveTime({
    effectiveLocalDateTime: input.effectiveLocalDateTime,
    effectiveTimeZone: input.effectiveTimeZone,
  });
  const accessionPath = input.accessionNumber.replace(/-/g, '');
  const instrumentId = `us-instrument:v1:${input.ticker.toLowerCase()}`;
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${input.cik}/${accessionPath}/${input.accessionNumber}-index.htm`;
  return {
    schemaVersion: DATA_US_CORPORATE_ACTION_SCHEMA_VERSION,
    actionId: `sec-reverse-split:${input.accessionNumber}`,
    sourceActionId: input.accessionNumber,
    instrumentId,
    issuerCik: input.cik.padStart(10, '0'),
    actionType: 'REVERSE_SPLIT',
    rawActionType: 'REVERSE_SPLIT',
    announcementDate: input.announcementDate,
    effectiveDate: effectiveTime.effectiveDate,
    effectiveAt: effectiveTime.effectiveAt,
    effectiveTimePrecision: effectiveTime.precision,
    effectiveLocalDateTime: input.effectiveLocalDateTime,
    effectiveTimeZone: input.effectiveTimeZone,
    splitRatio: { fromQuantity: input.fromQuantity, toQuantity: input.toQuantity },
    relatedInstrumentIds: [],
    status: 'CONFIRMED',
    supersedesActionIds: [],
    barAdjustmentTreatment: 'SPLIT_LEDGER_CANDIDATE',
    sourceTimestamp: input.acceptedAt,
    fetchedAt: FETCHED_AT,
    asKnownAt: input.acceptedAt,
    knowledgeTimePrecision: 'EXACT_TIMESTAMP',
    quality: 'GOOD',
    conflicts: [],
    provenance: {
      provider: 'U.S. Securities and Exchange Commission',
      source: 'sec_edgar',
      dataset: DATASET,
      sourceUrl: filingUrl,
      sourceTimestamp: input.acceptedAt,
      fetchedAt: FETCHED_AT,
      asKnownAt: input.acceptedAt,
      availabilityBasis: 'SOURCE_PUBLICATION',
      derivation: 'DERIVED',
      licenseClass: 'PUBLIC_FACTS',
      redistribution: 'COMMIT_ALLOWED',
      degradationEvidence: [],
    },
  };
}

const SNAPSHOTS = {
  JUNS: {
    asKnownAt: FETCHED_AT,
    deliveryProvenance: 'PUBLIC_SNAPSHOT',
    filings: [secFiling({
      accessionNumber: '0001493152-26-040577', cik: '1679628',
      acceptedAt: '2026-08-28T20:05:28.000Z', filingDate: '2026-08-28', items: ['3.01', '9.01'],
    })],
  },
  CORZ: {
    asKnownAt: FETCHED_AT,
    deliveryProvenance: 'PUBLIC_SNAPSHOT',
    filings: [secFiling({
      accessionNumber: '0001839341-26-000012', cik: '1839341',
      acceptedAt: '2026-07-28T11:00:58.000Z', filingDate: '2026-07-28', items: ['1.01', '3.02', '9.01'],
    })],
  },
  AUID: {
    asKnownAt: FETCHED_AT,
    deliveryProvenance: 'PUBLIC_SNAPSHOT',
    filings: [secFiling({
      accessionNumber: '0001213900-26-092659', cik: '1534154',
      acceptedAt: '2026-08-21T21:00:26.000Z', filingDate: '2026-08-21', items: ['3.01', '9.01'],
    })],
  },
  NCPL: {
    asKnownAt: FETCHED_AT,
    deliveryProvenance: 'PUBLIC_SNAPSHOT',
    filings: [secFiling({
      accessionNumber: '0001493152-26-040478', cik: '1414767',
      acceptedAt: '2026-08-28T10:05:36.000Z', filingDate: '2026-08-28', items: ['3.01', '9.01'],
    })],
  },
  CHGA: {
    asKnownAt: FETCHED_AT,
    deliveryProvenance: 'PUBLIC_SNAPSHOT',
    filings: [secFiling({
      accessionNumber: '0001213900-26-085714', cik: '1630212',
      acceptedAt: '2026-08-05T20:37:09.000Z', filingDate: '2026-08-05', items: ['3.02'],
    })],
  },
  SMTK: {
    asKnownAt: FETCHED_AT,
    deliveryProvenance: 'PUBLIC_SNAPSHOT',
    corporateActions: [secReverseSplit({
      accessionNumber: '0001104659-26-099673', cik: '1817760', ticker: 'SMTK',
      acceptedAt: '2026-08-21T20:05:19.000Z', announcementDate: '2026-08-20',
      effectiveLocalDateTime: '2026-08-20T17:00:00', effectiveTimeZone: 'America/New_York',
      fromQuantity: 50, toQuantity: 1,
    })],
  },
} as const satisfies Readonly<Record<string, StockResearchRiskEvidence>>;

function exactUtcMs(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : undefined;
}

function validateSnapshot(): void {
  for (const [ticker, rawEvidence] of Object.entries(SNAPSHOTS)) {
    const evidence: StockResearchRiskEvidence = rawEvidence;
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) throw new Error('public risk snapshot ticker is invalid');
    const cutoff = exactUtcMs(evidence.asKnownAt);
    if (cutoff === undefined) throw new Error(`${ticker} public risk snapshot cutoff is invalid`);
    for (const filing of evidence.filings ?? []) {
      const accepted = exactUtcMs(filing.acceptedAt ?? '');
      const fetched = exactUtcMs(filing.provenance.fetchedAt);
      const knowledge = filing.provenance.knowledgeTime.precision === 'EXACT_TIME'
        ? exactUtcMs(filing.provenance.knowledgeTime.asKnownAt)
        : undefined;
      const href = new URL(filing.provenance.sourceUrl ?? 'about:blank');
      const accessionMatch = /^\/Archives\/edgar\/data\/\d+\/(\d{18})\/(\d{10}-\d{2}-\d{6})-index\.html?$/i
        .exec(href.pathname);
      if (!/^\d{10}-\d{2}-\d{6}$/.test(filing.accessionNumber)
        || href.protocol !== 'https:'
        || (href.hostname !== 'sec.gov' && !href.hostname.endsWith('.sec.gov'))
        || accessionMatch?.[1] !== filing.accessionNumber.replace(/-/g, '')
        || accessionMatch?.[2] !== filing.accessionNumber
        || accepted === undefined
        || knowledge !== accepted
        || fetched === undefined
        || fetched < accepted
        || fetched > cutoff
        || filing.provenance.dataset !== DATASET
        || filing.provenance.licenseClass !== 'PUBLIC_FACTS'
        || filing.provenance.redistribution !== 'COMMIT_ALLOWED') {
        throw new Error(`${ticker} public SEC snapshot failed provenance validation`);
      }
    }
    for (const action of evidence.corporateActions ?? []) {
      let effectiveTimeValid = false;
      let splitRatioValid = false;
      try {
        const effectiveTime = resolveCorporateActionEffectiveTime(action);
        effectiveTimeValid = effectiveTime.precision === 'EXACT_TIMESTAMP'
          && effectiveTime.effectiveAt === action.effectiveAt
          && effectiveTime.effectiveDate === action.effectiveDate;
      } catch {
        effectiveTimeValid = false;
      }
      try {
        if (action.actionType === 'REVERSE_SPLIT' && action.splitRatio) {
          formatCorporateActionSplit(action.actionType, action.splitRatio);
          splitRatioValid = true;
        }
      } catch {
        splitRatioValid = false;
      }
      const accepted = exactUtcMs(action.asKnownAt ?? '');
      const fetched = exactUtcMs(action.fetchedAt);
      const sourceTimestamp = exactUtcMs(action.sourceTimestamp ?? '');
      const provenanceAccepted = exactUtcMs(action.provenance.asKnownAt ?? '');
      const provenanceFetched = exactUtcMs(action.provenance.fetchedAt);
      const href = new URL(action.provenance.sourceUrl ?? 'about:blank');
      const accessionMatch = /^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/(\d{10}-\d{2}-\d{6})-index\.html?$/i
        .exec(href.pathname);
      if (action.actionType !== 'REVERSE_SPLIT'
        || !accessionMatch
        || action.sourceActionId !== accessionMatch[3]
        || accessionMatch[2] !== action.sourceActionId.replace(/-/g, '')
        || action.issuerCik !== accessionMatch[1]?.padStart(10, '0')
        || href.protocol !== 'https:'
        || (href.hostname !== 'sec.gov' && !href.hostname.endsWith('.sec.gov'))
        || accepted === undefined
        || sourceTimestamp !== accepted
        || provenanceAccepted !== accepted
        || fetched === undefined
        || provenanceFetched !== fetched
        || fetched < accepted
        || fetched > cutoff
        || action.knowledgeTimePrecision !== 'EXACT_TIMESTAMP'
        || action.quality !== 'GOOD'
        || action.status !== 'CONFIRMED'
        || action.conflicts.length > 0
        || !effectiveTimeValid
        || !splitRatioValid
        || action.provenance.source !== 'sec_edgar'
        || action.provenance.dataset !== DATASET
        || action.provenance.licenseClass !== 'PUBLIC_FACTS'
        || action.provenance.redistribution !== 'COMMIT_ALLOWED') {
        throw new Error(`${ticker} public SEC corporate-action snapshot failed provenance validation`);
      }
    }
  }
}

validateSnapshot();

export function publicRiskEvidenceForSymbol(symbol: string): StockResearchRiskEvidence | undefined {
  return SNAPSHOTS[symbol.trim().toUpperCase() as keyof typeof SNAPSHOTS];
}
