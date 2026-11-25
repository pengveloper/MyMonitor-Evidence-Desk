import {
  AUTONOMOUS_LEARNING_HORIZONS,
  AUTONOMOUS_LEARNING_SCHEMA_VERSION,
  type AutonomousLearningProjection,
  type LearningAssetClass,
  type LearningCaseStatus,
  type LearningHorizon,
} from './autonomous-learning-contract.ts';

export const LEARNING_STATUS_SCHEMA_VERSION = 'autonomous-learning-status/v1' as const;
/** The production scheduler runs the outcome job hourly; a longer gap is shown as late, never hidden. */
export const LEARNING_RUN_CADENCE_MINUTES = 60;
const MAX_SYMBOLS = 60;
const DAY_MS = 86_400_000;

type HorizonCounts = Record<LearningHorizon, number>;

export interface LearningStatusSymbol {
  symbol: string;
  assetClass: LearningAssetClass;
  caseCount: number;
  firstEventAt: string;
  lastEventAt: string;
  /** Outcomes whose whole price path to that horizon was observed. */
  confirmedByHorizon: HorizonCounts;
}

/**
 * Counts and dates only. No case text, evidence, posture, price or account field leaves the
 * stored state through this shape, so the status screen can never show more than a tally.
 */
export interface LearningStatus {
  schemaVersion: typeof LEARNING_STATUS_SCHEMA_VERSION;
  generatedAt: string;
  caseCount: number;
  symbolCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  firstCaseCreatedAt: string | null;
  lastCaseCreatedAt: string | null;
  statusCounts: Record<LearningCaseStatus, number>;
  confirmedByHorizon: HorizonCounts;
  /** A horizon reached with gaps in the observed path. Counted apart; never added to confirmed. */
  partialByHorizon: HorizonCounts;
  casesWithoutOutcome: number;
  createdWithinDays: { 1: number; 7: number; 30: number };
  lastOutcomeEvaluatedAt: string | null;
  run: {
    lastRunAt: string | null;
    lastSuccessfulRunAt: string | null;
    totalRuns: number;
    degradedSymbolCount: number;
    cadenceMinutes: number;
  };
  symbols: LearningStatusSymbol[];
  symbolsTruncated: boolean;
}

/** What the learning screen reads: the stored tally plus the projection the analysis already uses. */
export interface LearningRead {
  status: LearningStatus | null;
  /** MISSING: no stored state yet. UNSUPPORTED: a state this build cannot tally. */
  store: 'READ' | 'MISSING' | 'UNSUPPORTED';
  snapshot: AutonomousLearningProjection | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const instant = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const horizonCounts = (): HorizonCounts => ({ 1: 0, 5: 0, 20: 0, 60: 0 });
const earliest = (current: string | null, next: string) => current === null || next < current ? next : current;
const latest = (current: string | null, next: string) => current === null || next > current ? next : current;
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const STATUSES: readonly LearningCaseStatus[] = ['OPEN', 'PARTIALLY_RESOLVED', 'RESOLVED', 'INVALIDATED'];

/**
 * Tally of the stored learning state at `now`. Returns null for anything that is not the
 * current state schema: an unreadable store must read as "not confirmed", never as zero cases.
 */
export function summarizeLearningState(value: unknown, now: string): LearningStatus | null {
  const nowMs = Date.parse(now);
  if (!isRecord(value) || value.schemaVersion !== AUTONOMOUS_LEARNING_SCHEMA_VERSION || !Array.isArray(value.cases)
    || !isRecord(value.outcomes) || !Number.isFinite(nowMs)) return null;
  const outcomes = value.outcomes;
  const statusCounts = Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<LearningCaseStatus, number>;
  const confirmedByHorizon = horizonCounts(), partialByHorizon = horizonCounts();
  const createdWithinDays = { 1: 0, 7: 0, 30: 0 };
  const bySymbol = new Map<string, LearningStatusSymbol>();
  let firstEventAt: string | null = null, lastEventAt: string | null = null;
  let firstCaseCreatedAt: string | null = null, lastCaseCreatedAt: string | null = null;
  let lastOutcomeEvaluatedAt: string | null = null, caseCount = 0, casesWithoutOutcome = 0;
  for (const item of value.cases) {
    if (!isRecord(item)) return null;
    const symbol = typeof item.symbol === 'string' && SYMBOL_RE.test(item.symbol) ? item.symbol : null;
    const eventAt = instant(item.eventAt), createdAt = instant(item.caseCreatedAt);
    const status = STATUSES.find(candidate => candidate === item.status);
    const assetClass = item.assetClass === 'ETF' || item.assetClass === 'EQUITY' ? item.assetClass : null;
    if (!symbol || !eventAt || !createdAt || !status || !assetClass || typeof item.caseId !== 'string') return null;
    caseCount += 1;
    statusCounts[status] += 1;
    firstEventAt = earliest(firstEventAt, eventAt); lastEventAt = latest(lastEventAt, eventAt);
    firstCaseCreatedAt = earliest(firstCaseCreatedAt, createdAt); lastCaseCreatedAt = latest(lastCaseCreatedAt, createdAt);
    const ageMs = nowMs - Date.parse(createdAt);
    if (ageMs >= 0) for (const days of [1, 7, 30] as const) if (ageMs <= days * DAY_MS) createdWithinDays[days] += 1;
    const row = bySymbol.get(symbol) ?? { symbol, assetClass, caseCount: 0, firstEventAt: eventAt, lastEventAt: eventAt, confirmedByHorizon: horizonCounts() };
    row.caseCount += 1; row.firstEventAt = earliest(row.firstEventAt, eventAt)!; row.lastEventAt = latest(row.lastEventAt, eventAt)!;
    bySymbol.set(symbol, row);
    const outcome = outcomes[item.caseId];
    if (!isRecord(outcome) || !isRecord(outcome.horizons)) { casesWithoutOutcome += 1; continue; }
    const evaluated = instant(outcome.lastEvaluatedAt);
    if (evaluated) lastOutcomeEvaluatedAt = latest(lastOutcomeEvaluatedAt, evaluated);
    for (const horizon of AUTONOMOUS_LEARNING_HORIZONS) {
      const resolved = outcome.horizons[String(horizon)];
      if (!isRecord(resolved)) continue;
      if (resolved.pathCoverage === 'COMPLETE') { confirmedByHorizon[horizon] += 1; row.confirmedByHorizon[horizon] += 1; }
      else partialByHorizon[horizon] += 1;
    }
  }
  const checkpoint = isRecord(value.checkpoint) ? value.checkpoint : {};
  const symbols = [...bySymbol.values()].sort((a, b) => b.caseCount - a.caseCount || a.symbol.localeCompare(b.symbol));
  return {
    schemaVersion: LEARNING_STATUS_SCHEMA_VERSION,
    generatedAt: new Date(nowMs).toISOString(),
    caseCount,
    symbolCount: symbols.length,
    firstEventAt, lastEventAt, firstCaseCreatedAt, lastCaseCreatedAt,
    statusCounts, confirmedByHorizon, partialByHorizon, casesWithoutOutcome, createdWithinDays, lastOutcomeEvaluatedAt,
    run: {
      lastRunAt: instant(checkpoint.lastRunAt),
      lastSuccessfulRunAt: instant(checkpoint.lastSuccessfulRunAt),
      totalRuns: Number.isSafeInteger(checkpoint.totalRuns) && Number(checkpoint.totalRuns) >= 0 ? Number(checkpoint.totalRuns) : 0,
      degradedSymbolCount: Array.isArray(checkpoint.lastDegradedSymbols) ? checkpoint.lastDegradedSymbols.length : 0,
      cadenceMinutes: LEARNING_RUN_CADENCE_MINUTES,
    },
    symbols: symbols.slice(0, MAX_SYMBOLS),
    symbolsTruncated: symbols.length > MAX_SYMBOLS,
  };
}

/** Browser-side guard for the same shape; anything else is treated as not read. */
export function isLearningStatus(value: unknown): value is LearningStatus {
  if (!isRecord(value) || value.schemaVersion !== LEARNING_STATUS_SCHEMA_VERSION) return false;
  const counts = (v: unknown) => isRecord(v) && AUTONOMOUS_LEARNING_HORIZONS.every(h => Number.isSafeInteger(v[String(h)]) && Number(v[String(h)]) >= 0);
  return Number.isSafeInteger(value.caseCount) && Number(value.caseCount) >= 0 && instant(value.generatedAt) !== null
    && counts(value.confirmedByHorizon) && counts(value.partialByHorizon) && isRecord(value.statusCounts) && isRecord(value.createdWithinDays)
    && isRecord(value.run) && Array.isArray(value.symbols)
    && value.symbols.every(row => isRecord(row) && typeof row.symbol === 'string' && SYMBOL_RE.test(row.symbol)
      && Number.isSafeInteger(row.caseCount) && counts(row.confirmedByHorizon));
}
