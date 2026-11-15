import type { RiskTicket, RiskTicketType } from './risk-ticket-model';
import type { EtfIntelligence } from './etf-intelligence-model';
import type { InstrumentLearningSummary } from '../../../shared/autonomous-learning-contract.ts';

export type DecisionPosture =
  | 'OPPORTUNITY_CANDIDATE'
  | 'WATCH'
  | 'INVESTIGATE'
  | 'WAIT_FOR_CONFIRMATION'
  | 'RISK_REDUCE_CANDIDATE'
  | 'AVOID_CANDIDATE'
  | 'NO_ACTION';

export interface TickerDecision {
  posture: DecisionPosture;
  confidence: number;
  confirmedFacts: string[];
  interpretation: string[];
  counterEvidence: string[];
  unknowns: string[];
  decisionDrivers: string[];
  changeConditions: string[];
  nextChecks: string[];
  signalTags: string[];
  rawConfidence?: number;
  learning?: InstrumentLearningSummary;
}

/** Apply empirical calibration only after the published minimum-n gate passes. */
export function applyLearningToDecision(
  decision: TickerDecision,
  learning: InstrumentLearningSummary | null,
): TickerDecision {
  if (!learning) return decision;
  const calibration = learning.calibration;
  const sharedSignals = learning.basisSignals.filter((signal) => decision.signalTags.includes(signal));
  const applyCalibration = calibration.applied
    && calibration.sampleCount >= Math.max(10, calibration.minimumSampleSize)
    && calibration.observedAccuracy !== undefined
    && Number.isFinite(calibration.observedAccuracy)
    && calibration.observedAccuracy >= 0 && calibration.observedAccuracy <= 1
    && sharedSignals.length > 0;
  const adjustedConfidence = applyCalibration
    ? Math.round(((decision.confidence + calibration.observedAccuracy!) / 2) * 1_000_000) / 1_000_000
    : decision.confidence;
  return {
    ...decision,
    // Expose an adjusted-vs-raw comparison only when an adjustment actually
    // happened. During cold start the UI shows one deterministic confidence,
    // not a misleading "adjusted" value that merely equals the raw value.
    rawConfidence: applyCalibration ? decision.confidence : undefined,
    // Recompute from the CURRENT rule score. The stored adjusted value belongs
    // to the captured PIT case and must not replace a different live score.
    confidence: adjustedConfidence,
    learning,
    decisionDrivers: [
      ...decision.decisionDrivers,
      ...(applyCalibration
        ? [`Historical calibration applied for ${sharedSignals.join(' + ')} from n=${calibration.sampleCount}.`]
        : sharedSignals.length === 0
          ? ['Historical calibration withheld because the current deterministic signals do not match its basis.']
          : [`Historical calibration withheld below n=${calibration.minimumSampleSize}.`]),
    ],
  };
}

const RISK_WEIGHT: Partial<Record<RiskTicketType, number>> = {
  ATM: 3,
  DILUTION: 3,
  OFFERING: 2,
  REVERSE_SPLIT: 2,
  LISTING_COMPLIANCE: 3,
  WARRANT_OR_PREFERRED: 2,
};

export function buildEquityDecision(ticket: RiskTicket | null): TickerDecision {
  if (!ticket) return {
    posture: 'WAIT_FOR_CONFIRMATION', confidence: 0.2, confirmedFacts: [], interpretation: ['Authoritative risk evidence has not completed.'], counterEvidence: [], unknowns: ['SEC risk evaluation'], decisionDrivers: [], changeConditions: ['Complete the authoritative evidence query.'], nextChecks: ['Retry SEC evidence refresh.'], signalTags: [],
  };
  const confirmed = ticket.items.filter((item) => item.evaluation.state === 'CONFIRMED');
  const score = confirmed.reduce((sum, item) => sum + (RISK_WEIGHT[item.riskType] ?? 0), 0);
  const insufficient = ticket.items.filter((item) => item.evaluation.state === 'INSUFFICIENT');
  const unavailable = ticket.items.filter((item) => ['UNAVAILABLE', 'NOT_WIRED', 'STALE'].includes(item.evaluation.state));
  const posture: DecisionPosture = score >= 7 ? 'AVOID_CANDIDATE'
    : score >= 3 ? 'RISK_REDUCE_CANDIDATE'
      : insufficient.length ? 'INVESTIGATE'
        : unavailable.length ? 'WAIT_FOR_CONFIRMATION'
          : 'WATCH';
  const signalTags = confirmed.flatMap((item): string[] => {
    switch (item.riskType) {
      case 'ATM': return ['ATM_ACTIVE'];
      case 'OFFERING': return ['OFFERING'];
      case 'DILUTION': return ['DILUTION'];
      case 'SHARES_OUTSTANDING': return ['SHARES_OUTSTANDING_CHANGE'];
      case 'REVERSE_SPLIT': return ['RECENT_REVERSE_SPLIT'];
      case 'LISTING_COMPLIANCE': return ['LISTING_COMPLIANCE_EVENT'];
      case 'WARRANT_OR_PREFERRED': return ['PREFERRED_CONVERSION_OVERHANG', 'WARRANT_EXERCISE'];
    }
  });
  return {
    posture,
    confidence: Math.min(0.9, Math.max(0.25, 0.45 + confirmed.length * 0.08 - unavailable.length * 0.05)),
    confirmedFacts: confirmed.map((item) => item.evaluation.reason),
    interpretation: score >= 3 ? ['The current structure belongs to an elevated dilution/capital-structure risk group.'] : ['No high-weight capital-structure risk cluster is confirmed in the bounded window.'],
    counterEvidence: ticket.items.filter((item) => item.evaluation.state === 'NOT_FOUND').map((item) => item.evaluation.reason),
    unknowns: [...insufficient, ...unavailable].map((item) => `${item.label}: ${item.evaluation.state}`),
    decisionDrivers: confirmed.filter((item) => (RISK_WEIGHT[item.riskType] ?? 0) > 0).map((item) => item.riskType),
    changeConditions: ['New authoritative filings that close current unknowns.', 'Material reduction or completion of confirmed issuance capacity.'],
    nextChecks: ticket.items.flatMap((item) => item.evaluation.nextChecks).filter((value, index, all) => all.indexOf(value) === index).slice(0, 4),
    signalTags: [...new Set(signalTags)].sort(),
  };
}

export function buildEtfDecision(intelligence: EtfIntelligence): TickerDecision {
  const leverage = intelligence.items.find((item) => item.key === 'LEVERAGE')?.evaluation;
  const volatility = intelligence.items.find((item) => item.key === 'VOLATILITY')?.evaluation;
  const leveraged = Boolean(intelligence.leverageMultiple && intelligence.leverageMultiple > 1);
  const regime = intelligence.items.find((item) => item.key === 'BENCHMARK_REGIME')?.evaluation;
  const observed = regime?.state === 'CONFIRMED' && Boolean(regime.observedAt);
  const bearish = observed && /(?:weak |strong )?bear/i.test(regime.reason);
  const unknownCount = intelligence.items.filter((item) => ['NOT_WIRED', 'INSUFFICIENT', 'UNAVAILABLE', 'STALE'].includes(item.evaluation.state)).length;
  return {
    posture: !observed ? 'WAIT_FOR_CONFIRMATION' : leveraged && bearish ? 'RISK_REDUCE_CANDIDATE' : leveraged ? 'INVESTIGATE' : 'WATCH',
    // Evidence-completeness score, never a calibrated probability of profit.
    confidence: !observed ? 0.2 : Math.max(0.25, 0.65 - unknownCount * 0.03),
    confirmedFacts: intelligence.items.filter((item) => item.evaluation.state === 'CONFIRMED').map((item) => item.evaluation.reason),
    interpretation: leveraged
      ? ['This is a tactical daily-reset instrument; path dependency and volatility regime dominate long-horizon holding risk.']
      : ['No daily leverage multiple is confirmed from the current canonical identity.'],
    counterEvidence: ['Fund-price trend alone does not establish the underlying benchmark trend or the cause of a move.', 'Daily-reset product structure does not establish a near-term buy or sell signal.'],
    unknowns: intelligence.items.filter((item) => ['NOT_WIRED', 'INSUFFICIENT', 'UNAVAILABLE'].includes(item.evaluation.state)).map((item) => `${item.label}: ${item.evaluation.state}`),
    decisionDrivers: [leverage?.verdict, volatility?.verdict].filter((value): value is string => Boolean(value)),
    changeConditions: ['A change in the underlying trend/volatility regime.', 'Official issuer notice or prospectus objective change.'],
    nextChecks: ['Refresh daily price regime.', 'Review issuer prospectus/notices when the canonical source is wired.'],
    signalTags: leveraged ? [
      ...(observed ? ['LEVERAGED_ETF_TREND_ALIGNMENT'] : []),
      ...(volatility?.state === 'CONFIRMED' && volatility.observedAt ? ['LEVERAGED_ETF_VOLATILITY_REGIME'] : []),
    ] : [],
  };
}
