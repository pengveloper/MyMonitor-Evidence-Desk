import type { MarketData } from '@/types';
import { assertEvidenceEvaluation, type EvidenceEvaluation, type EvidenceState, type RiskTicketConfidence } from './risk-ticket-model';

export interface EtfIntelligenceItem {
  key: 'ISSUER' | 'LEVERAGE' | 'DAILY_RESET' | 'BENCHMARK' | 'HOLDINGS' | 'CONCENTRATION'
    | 'EXPENSE_RATIO' | 'LIQUIDITY' | 'NAV_PREMIUM_DISCOUNT' | 'SPLIT_HISTORY'
    | 'VOLATILITY' | 'TRACKING' | 'PATH_DEPENDENCY' | 'REBALANCE_SENSITIVITY'
    | 'BENCHMARK_REGIME';
  label: string;
  evaluation: EvidenceEvaluation;
}

export interface EtfAnalysisMetrics {
  volumeRatio5d?: number;
  realizedVolatility?: number;
  maxDrawdown?: number;
  trendStatus?: string;
  priceObservationDate?: string;
  marketDataProvider?: string;
}

export interface EtfIntelligence {
  symbol: string;
  issuer: string;
  leverageMultiple?: number;
  direction: 'BULL' | 'BEAR' | 'UNSPECIFIED';
  benchmarkDescriptor?: string;
  items: EtfIntelligenceItem[];
}

function evaluation(input: {
  state: EvidenceState;
  verdict: string;
  reason: string;
  evidenceIds?: string[];
  confidence?: RiskTicketConfidence;
  observedAt?: string;
  missingEvidence?: string[];
  nextChecks?: string[];
}): EvidenceEvaluation {
  const result: EvidenceEvaluation = {
    state: input.state,
    verdict: input.verdict,
    confidence: input.confidence ?? 'UNRESOLVED',
    evidenceIds: input.evidenceIds ?? [],
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    reason: input.reason,
    counterEvidence: [],
    missingEvidence: input.missingEvidence ?? [],
    nextChecks: input.nextChecks ?? [],
  };
  assertEvidenceEvaluation(result);
  return result;
}

function deriveNameFacts(name: string): {
  issuer: string;
  leverageMultiple?: number;
  direction: EtfIntelligence['direction'];
  dailyReset: boolean;
  benchmarkDescriptor?: string;
} {
  const normalized = name.replace(/\s+/g, ' ').trim();
  const issuer = normalized.split(/\bDaily\b|\bETF\b|\bFund\b/i)[0]?.trim() || 'Issuer not identified';
  const leverageMatch = /\b([1-9](?:\.\d+)?)X\b/i.exec(normalized);
  const leverageMultiple = leverageMatch ? Number(leverageMatch[1]) : undefined;
  const direction = /\bBear\b/i.test(normalized) ? 'BEAR' : /\bBull\b/i.test(normalized) ? 'BULL' : 'UNSPECIFIED';
  const dailyReset = /\bDaily\b/i.test(normalized) && Boolean(leverageMultiple && leverageMultiple > 1);
  const benchmarkDescriptor = normalized
    .replace(new RegExp(`^${issuer.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}\\s*`, 'i'), '')
    .replace(/\bDaily\b/gi, '')
    .replace(/\b(?:Bull|Bear)\b/gi, '')
    .replace(/\b[1-9](?:\.\d+)?X\b/gi, '')
    .replace(/\b(?:ETF|Fund|Shares)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || undefined;
  return { issuer, leverageMultiple, direction, dailyReset, benchmarkDescriptor };
}

export function buildEtfIntelligence(
  instrument: Pick<MarketData, 'symbol' | 'name' | 'provider' | 'providerSymbol'>,
  metrics: EtfAnalysisMetrics = {},
): EtfIntelligence {
  const nameEvidenceId = `instrument:${instrument.provider ?? 'watchlist'}:${instrument.providerSymbol ?? instrument.symbol}`;
  const facts = deriveNameFacts(instrument.name || instrument.symbol);
  const derivedIds = [nameEvidenceId];
  const observedAt = metrics.priceObservationDate;
  const marketEvidenceIds = metrics.marketDataProvider && observedAt
    ? [`market:${metrics.marketDataProvider}:${instrument.symbol}:${observedAt}`]
    : [];
  const notWired = (label: string, missing: string): EvidenceEvaluation => evaluation({
    state: 'NOT_WIRED',
    verdict: 'SOURCE_NOT_WIRED',
    reason: `${label} source is not wired for this ETF.`,
    missingEvidence: [missing],
    nextChecks: [`Connect a licensed canonical ${missing.toLowerCase()} source.`],
  });

  const items: EtfIntelligenceItem[] = [
    {
      key: 'ISSUER', label: 'Issuer', evaluation: evaluation({
        state: facts.issuer === 'Issuer not identified' ? 'INSUFFICIENT' : 'CONFIRMED',
        verdict: facts.issuer === 'Issuer not identified' ? 'ISSUER_UNKNOWN' : 'ISSUER_IDENTIFIED_FROM_CANONICAL_NAME',
        reason: facts.issuer,
        evidenceIds: derivedIds,
        confidence: facts.issuer === 'Issuer not identified' ? 'LOW' : 'MEDIUM',
      }),
    },
    {
      key: 'LEVERAGE', label: 'Leverage target', evaluation: facts.leverageMultiple
        ? evaluation({ state: 'CONFIRMED', verdict: 'LEVERAGED_ETF', reason: `${facts.direction} ${facts.leverageMultiple}x stated daily target.`, evidenceIds: derivedIds, confidence: 'HIGH' })
        : evaluation({ state: 'INSUFFICIENT', verdict: 'LEVERAGE_NOT_IDENTIFIED', reason: 'The canonical name does not identify a leverage multiple.', evidenceIds: derivedIds, missingEvidence: ['Official prospectus leverage objective'] }),
    },
    {
      key: 'DAILY_RESET', label: 'Daily reset', evaluation: facts.dailyReset
        ? evaluation({ state: 'CONFIRMED', verdict: 'DAILY_RESET', reason: 'This leveraged ETF targets a DAILY result; multi-day returns are path-dependent and need not equal the target multiple.', evidenceIds: derivedIds, confidence: 'HIGH' })
        : evaluation({ state: 'INSUFFICIENT', verdict: 'RESET_INTERVAL_UNRESOLVED', reason: 'A daily reset objective was not established from the canonical identity.', evidenceIds: derivedIds, missingEvidence: ['Official investment objective'] }),
    },
    {
      key: 'BENCHMARK', label: 'Benchmark / exposure', evaluation: facts.benchmarkDescriptor
        ? evaluation({ state: 'INSUFFICIENT', verdict: 'BENCHMARK_DESCRIPTOR_ONLY', reason: `The canonical name indicates ${facts.benchmarkDescriptor} exposure; the formal benchmark index is not yet sourced.`, evidenceIds: derivedIds, confidence: 'LOW', missingEvidence: ['Official benchmark index'] })
        : notWired('Benchmark', 'Official benchmark index'),
    },
    { key: 'HOLDINGS', label: 'Current holdings / exposure', evaluation: notWired('Current holdings', 'ETF holdings') },
    {
      key: 'CONCENTRATION', label: 'Sector / country concentration', evaluation: facts.benchmarkDescriptor
        ? evaluation({ state: 'INSUFFICIENT', verdict: 'NAME_DERIVED_CONCENTRATION', reason: `${facts.benchmarkDescriptor} is the disclosed exposure descriptor; holdings-based concentration is not wired.`, evidenceIds: derivedIds, confidence: 'LOW', missingEvidence: ['Current holdings weights'] })
        : notWired('Concentration', 'Current holdings weights'),
    },
    { key: 'EXPENSE_RATIO', label: 'Expense ratio', evaluation: notWired('Expense ratio', 'Official fund fee') },
    {
      key: 'LIQUIDITY', label: 'Liquidity / volume', evaluation: typeof metrics.volumeRatio5d === 'number' && metrics.volumeRatio5d > 0
        ? evaluation({ state: 'CONFIRMED', verdict: 'RELATIVE_VOLUME_OBSERVED', reason: `Latest volume is ${metrics.volumeRatio5d.toFixed(2)}x its five-day average.`, evidenceIds: marketEvidenceIds, observedAt, confidence: 'MEDIUM' })
        : evaluation({ state: 'INSUFFICIENT', verdict: 'ABSOLUTE_LIQUIDITY_UNRESOLVED', reason: 'Absolute volume and spread evidence are insufficient for a liquidity judgment.', evidenceIds: marketEvidenceIds, observedAt, missingEvidence: ['Absolute volume', 'Bid-ask spread'] }),
    },
    { key: 'NAV_PREMIUM_DISCOUNT', label: 'NAV premium / discount', evaluation: notWired('NAV premium/discount', 'NAV and market price') },
    { key: 'SPLIT_HISTORY', label: 'Split history', evaluation: notWired('ETF split history', 'Fund corporate actions') },
    {
      key: 'VOLATILITY', label: 'Realized volatility', evaluation: typeof metrics.realizedVolatility === 'number' && metrics.realizedVolatility > 0
        ? evaluation({ state: 'CONFIRMED', verdict: 'REALIZED_VOLATILITY_OBSERVED', reason: `${(metrics.realizedVolatility * 100).toFixed(1)}% annualized realized volatility over the available six-month daily window.`, evidenceIds: marketEvidenceIds, observedAt, confidence: 'HIGH' })
        : evaluation({ state: 'UNAVAILABLE', verdict: 'VOLATILITY_UNAVAILABLE', reason: 'Daily price history was unavailable, so realized volatility could not be calculated.', missingEvidence: ['Daily adjusted candles'] }),
    },
    { key: 'TRACKING', label: 'Tracking behavior', evaluation: notWired('Benchmark tracking', 'Benchmark return series') },
    {
      key: 'PATH_DEPENDENCY', label: 'Path dependency / volatility decay', evaluation: facts.dailyReset
        ? evaluation({ state: 'CONFIRMED', verdict: 'PATH_DEPENDENCY_MATERIAL', reason: 'Daily compounding makes holding-period results path-dependent; higher volatility can increase compounding drag.', evidenceIds: derivedIds, confidence: 'HIGH' })
        : evaluation({ state: 'NOT_APPLICABLE', verdict: 'NO_DAILY_LEVERAGE_ESTABLISHED', reason: 'A leveraged daily objective was not established for this ETF.' }),
    },
    {
      key: 'REBALANCE_SENSITIVITY', label: 'Rebalance sensitivity', evaluation: facts.dailyReset
        ? evaluation({ state: 'CONFIRMED', verdict: 'DAILY_REBALANCE_SENSITIVE', reason: 'The stated daily leveraged target requires frequent exposure reset and is sensitive to late-session moves and volatility.', evidenceIds: derivedIds, confidence: 'MEDIUM' })
        : evaluation({ state: 'NOT_APPLICABLE', verdict: 'NO_DAILY_LEVERAGE_ESTABLISHED', reason: 'Daily leveraged rebalance sensitivity was not established.' }),
    },
    {
      key: 'BENCHMARK_REGIME', label: 'Underlying benchmark regime', evaluation: metrics.trendStatus
        ? evaluation({ state: 'CONFIRMED', verdict: 'PRICE_REGIME_OBSERVED', reason: `Fund-price technical regime: ${metrics.trendStatus}. This is not a substitute for the benchmark series.`, evidenceIds: marketEvidenceIds, observedAt, confidence: 'MEDIUM', missingEvidence: ['Official benchmark return series'] })
        : notWired('Benchmark regime', 'Benchmark return series'),
    },
  ];
  return { symbol: instrument.symbol, issuer: facts.issuer, leverageMultiple: facts.leverageMultiple, direction: facts.direction, benchmarkDescriptor: facts.benchmarkDescriptor, items };
}
