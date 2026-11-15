import { createHash } from 'node:crypto';

import {
  TOSSINVEST_PROVIDER,
  TOSSINVEST_SCHEMA_VERSION,
  type CanonicalBrokerOrder,
  type CanonicalExecution,
  type CanonicalHoldingsSnapshot,
  type CanonicalOwnerHolding,
  type CanonicalPositionEpisode,
  type CanonicalTradeLedger,
  type DecisionJournalEntry,
  type OutcomeAttribution,
  type OwnerBehaviorAggregates,
  type OwnerLearningAiContext,
  type OwnerUniverseEntry,
  type OwnerUniverseProjection,
  type PositionEpisodeLedger,
  type PositionEpisodeEvent,
  type TossAccountSelection,
  type TossDecimal,
  type TossProviderSyncState,
} from './tossinvest-contract.ts';

const DECIMAL_RE = /^-?\d+(?:\.\d+)?$/;
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const RECENT_TRADE_WINDOW_DAYS = 120;
const DECIMAL_DIVISION_SCALE = 18;
const MAX_DECIMAL_CHARACTERS = 128;

interface DecimalValue {
  coefficient: bigint;
  scale: number;
}

function pow10(value: number): bigint {
  return 10n ** BigInt(value);
}

function parseDecimal(value: unknown): DecimalValue | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (raw.length > MAX_DECIMAL_CHARACTERS || !DECIMAL_RE.test(raw)) return null;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  let coefficient = BigInt(`${whole}${fraction}`);
  if (negative) coefficient = -coefficient;
  return normalizeDecimalValue({ coefficient, scale: fraction.length });
}

function normalizeDecimalValue(value: DecimalValue): DecimalValue {
  let { coefficient, scale } = value;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function decimalString(value: DecimalValue): TossDecimal {
  const normalized = normalizeDecimalValue(value);
  const negative = normalized.coefficient < 0n;
  const digits = (negative ? -normalized.coefficient : normalized.coefficient).toString();
  if (normalized.scale === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(normalized.scale + 1, '0');
  const whole = padded.slice(0, -normalized.scale);
  const fraction = padded.slice(-normalized.scale);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function canonicalDecimal(value: unknown): TossDecimal | null {
  const parsed = parseDecimal(value);
  return parsed ? decimalString(parsed) : null;
}

function align(left: DecimalValue, right: DecimalValue): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * pow10(scale - left.scale),
    right.coefficient * pow10(scale - right.scale),
    scale,
  ];
}

function add(left: DecimalValue, right: DecimalValue): DecimalValue {
  const [a, b, scale] = align(left, right);
  return normalizeDecimalValue({ coefficient: a + b, scale });
}

function subtract(left: DecimalValue, right: DecimalValue): DecimalValue {
  return add(left, { coefficient: -right.coefficient, scale: right.scale });
}

function multiply(left: DecimalValue, right: DecimalValue): DecimalValue {
  return normalizeDecimalValue({
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  });
}

function divide(left: DecimalValue, right: DecimalValue): DecimalValue | null {
  if (right.coefficient === 0n) return null;
  const numerator = left.coefficient * pow10(right.scale + DECIMAL_DIVISION_SCALE);
  const denominator = right.coefficient * pow10(left.scale);
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  if (remainder * 2n >= absoluteDenominator) quotient += 1n;
  return normalizeDecimalValue({ coefficient: negative ? -quotient : quotient, scale: DECIMAL_DIVISION_SCALE });
}

function quantize(value: DecimalValue, scale: number): DecimalValue {
  if (value.scale <= scale) return value;
  const divisor = pow10(value.scale - scale);
  const negative = value.coefficient < 0n;
  const absoluteCoefficient = negative ? -value.coefficient : value.coefficient;
  let coefficient = absoluteCoefficient / divisor;
  if ((absoluteCoefficient % divisor) * 2n >= divisor) coefficient += 1n;
  return normalizeDecimalValue({ coefficient: negative ? -coefficient : coefficient, scale });
}

function compare(left: DecimalValue, right: DecimalValue): number {
  const [a, b] = align(left, right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function absolute(value: DecimalValue): DecimalValue {
  return value.coefficient < 0n
    ? { coefficient: -value.coefficient, scale: value.scale }
    : value;
}

function minimum(left: DecimalValue, right: DecimalValue): DecimalValue {
  return compare(left, right) <= 0 ? left : right;
}

function decimalOrZero(value: TossDecimal | null | undefined): DecimalValue {
  return parseDecimal(value) ?? { coefficient: 0n, scale: 0 };
}

function sumDecimals(values: Array<TossDecimal | null | undefined>): TossDecimal {
  return decimalString(values.reduce((sum, value) => add(sum, decimalOrZero(value)), decimalOrZero('0')));
}

function ratioToPercent(value: unknown): TossDecimal | null {
  const parsed = parseDecimal(value);
  return parsed ? decimalString(multiply(parsed, decimalOrZero('100'))) : null;
}

function isPositive(value: TossDecimal | null): value is TossDecimal {
  const parsed = parseDecimal(value);
  return Boolean(parsed && parsed.coefficient > 0n);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  return text && Number.isFinite(Date.parse(text)) ? new Date(Date.parse(text)).toISOString() : null;
}

function dateOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function canonicalSymbol(value: unknown): string | null {
  const candidate = stringOrNull(value)?.toUpperCase() ?? '';
  return SYMBOL_RE.test(candidate) ? candidate : null;
}

function economicDecimal(
  value: unknown,
  field: string,
  options: { positive?: boolean } = {},
): TossDecimal | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseDecimal(value);
  if (!parsed || parsed.coefficient < 0n || (options.positive && parsed.coefficient === 0n)) {
    throw new Error(`Toss order ${field} is malformed`);
  }
  return decimalString(parsed);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function roundNumber(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function opaqueTossAccountRef(clientId: string, accountSeq: string): string {
  const digest = createHash('sha256')
    .update(`tossinvest\u0000${clientId}\u0000${accountSeq}`)
    .digest('hex')
    .slice(0, 32);
  return `toss:${digest}`;
}

export function selectTossAccount(input: {
  accounts: unknown;
  configuredAccountSeq?: string | null;
  clientId: string;
}): TossAccountSelection {
  if (!Array.isArray(input.accounts)) throw new Error('Toss accounts response is malformed');
  const eligible = input.accounts.flatMap((value) => {
    const item = record(value);
    const accountSeq = item && (typeof item.accountSeq === 'string' || typeof item.accountSeq === 'number')
      ? String(item.accountSeq)
      : null;
    return item?.accountType === 'BROKERAGE' && accountSeq ? [{ accountSeq }] : [];
  });
  const configured = input.configuredAccountSeq?.trim() || null;
  if (configured) {
    const selected = eligible.find(({ accountSeq }) => accountSeq === configured);
    if (!selected) {
      return {
        state: 'CONFIGURATION_REQUIRED',
        opaqueAccountRef: null,
        accountSeq: null,
        eligibleAccountCount: eligible.length,
      };
    }
    return {
      state: 'ACTIVE',
      opaqueAccountRef: opaqueTossAccountRef(input.clientId, selected.accountSeq),
      accountSeq: selected.accountSeq,
      eligibleAccountCount: eligible.length,
    };
  }
  if (eligible.length === 0) {
    return { state: 'NOT_CONFIGURED', opaqueAccountRef: null, accountSeq: null, eligibleAccountCount: 0 };
  }
  if (eligible.length > 1) {
    return {
      state: 'CONFIGURATION_REQUIRED',
      opaqueAccountRef: null,
      accountSeq: null,
      eligibleAccountCount: eligible.length,
    };
  }
  return {
    state: 'ACTIVE',
    opaqueAccountRef: opaqueTossAccountRef(input.clientId, eligible[0]!.accountSeq),
    accountSeq: eligible[0]!.accountSeq,
    eligibleAccountCount: 1,
  };
}

export function normalizeTossHoldings(input: {
  result: unknown;
  opaqueAccountRef: string;
  fetchedAt: string;
}): CanonicalHoldingsSnapshot {
  const overview = record(input.result);
  if (!overview || !Array.isArray(overview.items)) throw new Error('Toss holdings response is malformed');
  const holdings = overview.items.map((value): CanonicalOwnerHolding => {
    const item = record(value);
    const symbol = canonicalSymbol(item?.symbol);
    if (!item || !symbol) throw new Error('Toss holding item is malformed');
    const marketValue = record(item.marketValue);
    const profitLoss = record(item.profitLoss);
    return {
      provider: TOSSINVEST_PROVIDER,
      opaqueAccountRef: input.opaqueAccountRef,
      symbol,
      marketCountry: stringOrNull(item.marketCountry),
      currency: stringOrNull(item.currency),
      quantity: canonicalDecimal(item.quantity),
      averageAcquisitionPrice: canonicalDecimal(item.averagePurchasePrice),
      currentPrice: canonicalDecimal(item.lastPrice),
      valuationAmount: canonicalDecimal(marketValue?.amount),
      unrealizedPnlAmount: canonicalDecimal(profitLoss?.amount),
      unrealizedPnlPercent: ratioToPercent(profitLoss?.rate),
      observedAt: input.fetchedAt,
      fetchedAt: input.fetchedAt,
      providerFreshness: 'LIVE_RESPONSE',
      providerFields: Object.freeze({
        name: stringOrNull(item.name),
        purchaseAmount: canonicalDecimal(marketValue?.purchaseAmount),
        valuationAfterCost: canonicalDecimal(marketValue?.amountAfterCost),
        unrealizedPnlAfterCost: canonicalDecimal(profitLoss?.amountAfterCost),
        unrealizedPnlRate: canonicalDecimal(profitLoss?.rate),
        unrealizedPnlRateAfterCost: canonicalDecimal(profitLoss?.rateAfterCost),
      }),
    };
  }).sort((left, right) => left.symbol.localeCompare(right.symbol));
  return {
    schemaVersion: TOSSINVEST_SCHEMA_VERSION,
    provider: TOSSINVEST_PROVIDER,
    opaqueAccountRef: input.opaqueAccountRef,
    observedAt: input.fetchedAt,
    fetchedAt: input.fetchedAt,
    holdings,
  };
}

export interface NormalizedTossOrder {
  order: CanonicalBrokerOrder;
  execution: CanonicalExecution | null;
}

export function normalizeTossOrder(input: {
  value: unknown;
  opaqueAccountRef: string;
  seenAt: string;
}): NormalizedTossOrder {
  const item = record(input.value);
  const providerOrderId = stringOrNull(item?.orderId);
  const symbol = canonicalSymbol(item?.symbol);
  const orderedAt = isoOrNull(item?.orderedAt);
  if (!item || !providerOrderId || !symbol || !orderedAt) {
    throw new Error('Toss order item is malformed');
  }
  const execution = record(item.execution);
  const orderedQuantity = economicDecimal(item.quantity, 'quantity', { positive: true });
  const orderedPrice = economicDecimal(item.price, 'price', { positive: true });
  const orderAmount = economicDecimal(item.orderAmount, 'amount');
  const filledQuantity = economicDecimal(execution?.filledQuantity, 'filled quantity');
  const averageFilledPrice = economicDecimal(execution?.averageFilledPrice, 'average filled price', { positive: true });
  const filledAmount = economicDecimal(execution?.filledAmount, 'filled amount');
  const commission = economicDecimal(execution?.commission, 'commission');
  const tax = economicDecimal(execution?.tax, 'tax');
  if (filledQuantity && orderedQuantity
    && compare(decimalOrZero(filledQuantity), decimalOrZero(orderedQuantity)) > 0) {
    throw new Error('Toss order filled quantity exceeds ordered quantity');
  }
  const filledAt = isoOrNull(execution?.filledAt);
  const side = item.side === 'BUY' ? 'BUY' : item.side === 'SELL' ? 'SELL' : 'UNKNOWN';
  const order: CanonicalBrokerOrder = {
    provider: TOSSINVEST_PROVIDER,
    opaqueAccountRef: input.opaqueAccountRef,
    providerOrderId,
    symbol,
    side,
    orderedAt,
    status: stringOrNull(item.status) ?? 'UNKNOWN',
    orderedQuantity,
    orderedPrice,
    orderAmount,
    filledQuantity,
    averageFilledPrice,
    filledAmount,
    commission,
    tax,
    filledAt,
    canceledAt: isoOrNull(item.canceledAt),
    settlementDate: dateOrNull(execution?.settlementDate),
    currency: stringOrNull(item.currency),
    providerFields: Object.freeze({
      orderType: stringOrNull(item.orderType),
      timeInForce: stringOrNull(item.timeInForce),
      status: stringOrNull(item.status),
      price: orderedPrice,
      quantity: orderedQuantity,
      orderAmount,
      filledQuantity,
      averageFilledPrice,
      filledAmount,
      commission,
      tax,
      settlementDate: dateOrNull(execution?.settlementDate),
    }),
    firstSeenAt: input.seenAt,
    lastSeenAt: input.seenAt,
  };
  const canonicalExecution = isPositive(filledQuantity) ? {
    provider: TOSSINVEST_PROVIDER,
    opaqueAccountRef: input.opaqueAccountRef,
    executionId: `${TOSSINVEST_PROVIDER}:${providerOrderId}:aggregate`,
    providerOrderId,
    aggregation: 'PROVIDER_ORDER_AGGREGATE' as const,
    symbol,
    side,
    quantity: filledQuantity,
    price: averageFilledPrice,
    amount: filledAmount,
    commission,
    tax,
    executedAt: filledAt,
    settlementDate: dateOrNull(execution?.settlementDate),
    currency: stringOrNull(item.currency),
    dataQuality: filledAt && averageFilledPrice ? 'COMPLETE' as const : 'INCOMPLETE' as const,
    limitations: sortedUnique([
      ...(!filledAt ? ['EXECUTION_TIMESTAMP_UNAVAILABLE'] : []),
      ...(!averageFilledPrice ? ['EXECUTION_PRICE_UNAVAILABLE'] : []),
    ]),
    lastSeenAt: input.seenAt,
  } satisfies CanonicalExecution : null;
  return { order, execution: canonicalExecution };
}

export function emptyTradeLedger(opaqueAccountRef: string, updatedAt: string): CanonicalTradeLedger {
  return {
    schemaVersion: TOSSINVEST_SCHEMA_VERSION,
    provider: TOSSINVEST_PROVIDER,
    opaqueAccountRef,
    updatedAt,
    orders: [],
    executions: [],
  };
}

export function mergeTossOrderPage(input: {
  ledger: CanonicalTradeLedger;
  orders: unknown[];
  seenAt: string;
}): CanonicalTradeLedger {
  const orderById = new Map(input.ledger.orders.map((order) => [order.providerOrderId, order]));
  const executionByOrderId = new Map(input.ledger.executions.map((execution) => [execution.providerOrderId, execution]));
  for (const value of input.orders) {
    const normalized = normalizeTossOrder({
      value,
      opaqueAccountRef: input.ledger.opaqueAccountRef,
      seenAt: input.seenAt,
    });
    const existing = orderById.get(normalized.order.providerOrderId);
    orderById.set(normalized.order.providerOrderId, {
      ...normalized.order,
      firstSeenAt: existing?.firstSeenAt ?? normalized.order.firstSeenAt,
    });
    if (normalized.execution) {
      executionByOrderId.set(normalized.order.providerOrderId, normalized.execution);
    } else {
      executionByOrderId.delete(normalized.order.providerOrderId);
    }
  }
  return {
    ...input.ledger,
    updatedAt: input.seenAt,
    orders: [...orderById.values()].sort((left, right) => (
      left.orderedAt.localeCompare(right.orderedAt)
      || left.providerOrderId.localeCompare(right.providerOrderId)
    )),
    executions: [...executionByOrderId.values()].sort((left, right) => (
      (left.executedAt ?? '').localeCompare(right.executedAt ?? '')
      || left.executionId.localeCompare(right.executionId)
    )),
  };
}

interface WorkingEpisode {
  episode: CanonicalPositionEpisode;
  quantity: DecimalValue;
  averageCost: DecimalValue | null;
  grossRealized: DecimalValue;
}

function newEpisode(
  execution: CanonicalExecution,
  quantity: DecimalValue,
  direction: 'LONG' | 'SHORT',
  knownBasis: boolean,
  eventKind: PositionEpisodeEvent['kind'] = 'ENTRY',
): WorkingEpisode {
  const price = parseDecimal(execution.price);
  const dataQuality = !knownBasis
    ? 'INSUFFICIENT_HISTORY'
    : price ? 'COMPLETE_EXECUTION_BASIS' : 'MISSING_EXECUTION_PRICE';
  return {
    quantity,
    averageCost: price,
    grossRealized: decimalOrZero('0'),
    episode: {
      episodeId: `${execution.symbol}:${execution.executedAt}:${execution.executionId}`,
      symbol: execution.symbol,
      currency: execution.currency,
      direction,
      openedAt: execution.executedAt,
      closedAt: null,
      entryPrice: execution.price,
      peakAbsoluteQuantity: decimalString(quantity),
      endingQuantity: decimalString(quantity),
      holdingDurationMs: null,
      grossRealizedPnl: null,
      fees: execution.commission ?? '0',
      taxes: execution.tax ?? '0',
      netRealizedPnl: null,
      additionCount: 0,
      partialExitCount: 0,
      directionSwitch: eventKind === 'DIRECTION_SWITCH',
      dataQuality,
      limitations: sortedUnique([
        'PROVIDER_EXPOSES_AGGREGATE_ORDER_EXECUTION_ONLY',
        'CORPORATE_ACTIONS_NOT_MODELED_WITHOUT_CANONICAL_ACTION_DATA',
        ...(!knownBasis ? ['BACKFILL_MAY_BEGIN_AFTER_POSITION_ENTRY'] : []),
        ...(!price ? ['EXECUTION_PRICE_UNAVAILABLE'] : []),
      ]),
      events: [{
        kind: eventKind,
        executionId: execution.executionId,
        occurredAt: execution.executedAt,
        quantity: decimalString(quantity),
        price: execution.price,
      }],
    },
  };
}

function addEpisodeCosts(working: WorkingEpisode, execution: CanonicalExecution): void {
  working.episode.fees = sumDecimals([working.episode.fees, execution.commission]);
  working.episode.taxes = sumDecimals([working.episode.taxes, execution.tax]);
}

function refreshEpisodeDerived(working: WorkingEpisode): void {
  working.episode.endingQuantity = decimalString(working.quantity);
  if (compare(working.quantity, decimalOrZero(working.episode.peakAbsoluteQuantity)) > 0) {
    working.episode.peakAbsoluteQuantity = decimalString(working.quantity);
  }
  if (working.episode.closedAt) {
    working.episode.holdingDurationMs = Math.max(
      0,
      Date.parse(working.episode.closedAt) - Date.parse(working.episode.openedAt),
    );
  }
  if (working.episode.closedAt && working.episode.dataQuality === 'COMPLETE_EXECUTION_BASIS') {
    working.episode.grossRealizedPnl = decimalString(quantize(working.grossRealized, 8));
    working.episode.netRealizedPnl = decimalString(quantize(subtract(
      subtract(working.grossRealized, decimalOrZero(working.episode.fees)),
      decimalOrZero(working.episode.taxes),
    ), 8));
  }
}

export function buildPositionEpisodes(
  ledger: CanonicalTradeLedger,
  generatedAt: string,
): PositionEpisodeLedger {
  const episodes: WorkingEpisode[] = [];
  const currentBySymbol = new Map<string, WorkingEpisode>();
  const excludedExecutionCount = ledger.executions.filter((execution) => !execution.executedAt).length;
  const executions = ledger.executions.filter(
    (execution): execution is CanonicalExecution & { executedAt: string } => Boolean(execution.executedAt),
  ).sort((left, right) => (
    left.executedAt.localeCompare(right.executedAt) || left.executionId.localeCompare(right.executionId)
  ));
  for (const execution of executions) {
    if (execution.side === 'UNKNOWN') continue;
    const executionQuantity = parseDecimal(execution.quantity);
    if (!executionQuantity || executionQuantity.coefficient <= 0n) continue;
    const incomingDirection = execution.side === 'BUY' ? 'LONG' : 'SHORT';
    let current = currentBySymbol.get(execution.symbol);
    if (!current) {
      // A sell at the beginning of a bounded history may be a reduction of a
      // pre-existing long. Retain the episode but do not fabricate its basis.
      current = newEpisode(execution, executionQuantity, incomingDirection, execution.side === 'BUY');
      episodes.push(current);
      currentBySymbol.set(execution.symbol, current);
      continue;
    }
    if (current.episode.direction === incomingDirection) {
      const oldQuantity = current.quantity;
      const nextQuantity = add(oldQuantity, executionQuantity);
      const price = parseDecimal(execution.price);
      if (current.averageCost && price) {
        current.averageCost = divide(
          add(multiply(current.averageCost, oldQuantity), multiply(price, executionQuantity)),
          nextQuantity,
        );
        current.episode.entryPrice = current.averageCost ? decimalString(current.averageCost) : null;
      } else {
        current.averageCost = null;
        current.episode.entryPrice = null;
        current.episode.dataQuality = 'MISSING_EXECUTION_PRICE';
        current.episode.limitations = sortedUnique([...current.episode.limitations, 'EXECUTION_PRICE_UNAVAILABLE']);
      }
      current.quantity = nextQuantity;
      current.episode.additionCount += 1;
      addEpisodeCosts(current, execution);
      current.episode.events.push({
        kind: 'ADDITION',
        executionId: execution.executionId,
        occurredAt: execution.executedAt,
        quantity: execution.quantity,
        price: execution.price,
      });
      refreshEpisodeDerived(current);
      continue;
    }

    const closeQuantity = minimum(current.quantity, executionQuantity);
    const executionPrice = parseDecimal(execution.price);
    if (current.averageCost && executionPrice && current.episode.dataQuality === 'COMPLETE_EXECUTION_BASIS') {
      const perUnit = current.episode.direction === 'LONG'
        ? subtract(executionPrice, current.averageCost)
        : subtract(current.averageCost, executionPrice);
      current.grossRealized = add(current.grossRealized, multiply(perUnit, closeQuantity));
    } else if (!executionPrice) {
      current.episode.dataQuality = 'MISSING_EXECUTION_PRICE';
      current.episode.limitations = sortedUnique([...current.episode.limitations, 'EXECUTION_PRICE_UNAVAILABLE']);
    }
    const remainingCurrent = subtract(current.quantity, closeQuantity);
    const remainingIncoming = subtract(executionQuantity, closeQuantity);
    const switches = remainingIncoming.coefficient > 0n;
    const closes = remainingCurrent.coefficient === 0n;
    current.quantity = remainingCurrent;
    if (!closes) current.episode.partialExitCount += 1;
    if (switches) current.episode.directionSwitch = true;
    addEpisodeCosts(current, execution);
    current.episode.events.push({
      kind: switches ? 'DIRECTION_SWITCH' : closes ? 'EXIT' : 'REDUCTION',
      executionId: execution.executionId,
      occurredAt: execution.executedAt,
      quantity: decimalString(closeQuantity),
      price: execution.price,
    });
    if (closes) {
      current.episode.closedAt = execution.executedAt;
      currentBySymbol.delete(execution.symbol);
    }
    refreshEpisodeDerived(current);
    if (switches) {
      const next = newEpisode(execution, remainingIncoming, incomingDirection, true, 'DIRECTION_SWITCH');
      // Costs are assigned once, to the closing episode. Exact provider fill
      // allocation is unavailable in the aggregate order response.
      next.episode.fees = '0';
      next.episode.taxes = '0';
      episodes.push(next);
      currentBySymbol.set(execution.symbol, next);
    }
  }
  for (const episode of episodes) refreshEpisodeDerived(episode);
  return {
    schemaVersion: TOSSINVEST_SCHEMA_VERSION,
    generatedAt,
    excludedExecutionCount,
    limitations: excludedExecutionCount > 0 ? ['EXECUTION_TIMESTAMP_UNAVAILABLE'] : [],
    episodes: episodes.map(({ episode }) => episode),
  };
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]!
    : Math.round((ordered[middle - 1]! + ordered[middle]!) / 2);
}

function sumByCurrency(
  values: Array<{ currency: string | null; value: TossDecimal | null }>,
): Record<string, TossDecimal> {
  const result = new Map<string, DecimalValue>();
  for (const item of values) {
    const amount = parseDecimal(item.value);
    if (!amount) continue;
    const currency = item.currency ?? 'UNKNOWN';
    result.set(currency, add(result.get(currency) ?? decimalOrZero('0'), absolute(amount)));
  }
  return Object.fromEntries([...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => [currency, decimalString(value)]));
}

function averageDecimalByCurrency(
  values: Array<{ currency: string | null; value: DecimalValue }>,
): Record<string, TossDecimal> {
  const grouped = new Map<string, DecimalValue[]>();
  for (const item of values) {
    const currency = item.currency ?? 'UNKNOWN';
    grouped.set(currency, [...(grouped.get(currency) ?? []), item.value]);
  }
  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, items]) => {
    const total = items.reduce(add, decimalOrZero('0'));
    return [currency, decimalString(divide(total, decimalOrZero(String(items.length))) ?? decimalOrZero('0'))];
  }));
}

export function buildOwnerBehavior(
  ledger: CanonicalTradeLedger,
  positionLedger: PositionEpisodeLedger,
  generatedAt: string,
): OwnerBehaviorAggregates {
  const timedExecutions = ledger.executions.filter(
    (execution): execution is CanonicalExecution & { executedAt: string } => Boolean(execution.executedAt),
  ).sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  const executionSpanDays = timedExecutions.length > 1
    ? Math.max(30, (Date.parse(timedExecutions.at(-1)!.executedAt) - Date.parse(timedExecutions[0]!.executedAt)) / 86_400_000)
    : 30;
  const completeClosed = positionLedger.episodes.filter((episode) => (
    episode.closedAt && episode.dataQuality === 'COMPLETE_EXECUTION_BASIS' && episode.netRealizedPnl !== null
  ));
  const durations = completeClosed.flatMap((episode) => episode.holdingDurationMs ?? []);
  const wins = completeClosed.filter((episode) => decimalOrZero(episode.netRealizedPnl).coefficient > 0n);
  const losses = completeClosed.filter((episode) => decimalOrZero(episode.netRealizedPnl).coefficient < 0n);
  const expectancyValues = completeClosed.map((episode) => ({
    currency: episode.currency,
    value: decimalOrZero(episode.netRealizedPnl),
  }));
  const profitFactorCurrencies = sortedUnique(completeClosed.map((episode) => episode.currency ?? 'UNKNOWN'));
  const profitFactorByCurrency = Object.fromEntries(profitFactorCurrencies.map((currency) => {
    const matching = completeClosed.filter((episode) => (episode.currency ?? 'UNKNOWN') === currency);
    const profit = matching.reduce((sum, episode) => {
      const value = decimalOrZero(episode.netRealizedPnl);
      return value.coefficient > 0n ? add(sum, value) : sum;
    }, decimalOrZero('0'));
    const loss = matching.reduce((sum, episode) => {
      const value = decimalOrZero(episode.netRealizedPnl);
      return value.coefficient < 0n ? add(sum, absolute(value)) : sum;
    }, decimalOrZero('0'));
    return [currency, loss.coefficient > 0n ? decimalString(divide(profit, loss)!) : null];
  }));
  const bySymbol = new Map<string, CanonicalPositionEpisode[]>();
  for (const episode of positionLedger.episodes) {
    bySymbol.set(episode.symbol, [...(bySymbol.get(episode.symbol) ?? []), episode]);
  }
  const reentryCount = [...bySymbol.values()].reduce((sum, episodes) => sum + Math.max(0, episodes.length - 1), 0);
  let lossFollowedByReentryCount = 0;
  for (const episodes of bySymbol.values()) {
    const ordered = [...episodes].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const outcome = parseDecimal(ordered[index]!.netRealizedPnl);
      if (outcome && outcome.coefficient < 0n) lossFollowedByReentryCount += 1;
    }
  }
  const leveragedSwitches = positionLedger.episodes
    .filter((episode) => episode.symbol === 'SOXL' || episode.symbol === 'SOXS')
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  let soxlSoxsSwitchCount = 0;
  for (let index = 1; index < leveragedSwitches.length; index += 1) {
    if (leveragedSwitches[index - 1]!.symbol !== leveragedSwitches[index]!.symbol) soxlSoxsSwitchCount += 1;
  }
  const entryNotionals = positionLedger.episodes.flatMap((episode) => {
    const price = parseDecimal(episode.entryPrice);
    const quantity = parseDecimal(episode.peakAbsoluteQuantity);
    return price && quantity ? [{ currency: episode.currency, value: absolute(multiply(price, quantity)) }] : [];
  });
  return {
    schemaVersion: 'owner-behavior/v1',
    generatedAt,
    basis: {
      orderCount: ledger.orders.length,
      executionCount: ledger.executions.length,
      completeClosedEpisodeCount: completeClosed.length,
    },
    tradeFrequencyPer30Days: timedExecutions.length === ledger.executions.length && timedExecutions.length
      ? roundNumber(timedExecutions.length / executionSpanDays * 30)
      : null,
    turnoverByCurrency: sumByCurrency(ledger.executions.map((execution) => ({
      currency: execution.currency,
      value: execution.amount ?? (execution.price && execution.quantity
        ? decimalString(multiply(decimalOrZero(execution.price), decimalOrZero(execution.quantity)))
        : null),
    }))),
    averageHoldingDurationMs: average(durations),
    medianHoldingDurationMs: median(durations),
    averageEntryNotionalByCurrency: averageDecimalByCurrency(entryNotionals),
    addToPositionCount: positionLedger.episodes.reduce((sum, episode) => sum + episode.additionCount, 0),
    partialExitCount: positionLedger.episodes.reduce((sum, episode) => sum + episode.partialExitCount, 0),
    reentryCount,
    directionSwitchCount: positionLedger.episodes.filter((episode) => episode.directionSwitch).length,
    directionSwitchFrequency: positionLedger.episodes.length
      ? roundNumber(positionLedger.episodes.filter((episode) => episode.directionSwitch).length / positionLedger.episodes.length)
      : null,
    cancelRatio: ledger.orders.length
      ? roundNumber(ledger.orders.filter((order) => order.status === 'CANCELED').length / ledger.orders.length)
      : null,
    replaceRatio: ledger.orders.length
      ? roundNumber(ledger.orders.filter((order) => order.status === 'REPLACED').length / ledger.orders.length)
      : null,
    wins: completeClosed.length ? wins.length : null,
    losses: completeClosed.length ? losses.length : null,
    realizedExpectancyByCurrency: averageDecimalByCurrency(expectancyValues),
    profitFactorByCurrency,
    mae: null,
    mfe: null,
    postExitDrift: null,
    benchmarkRelativeOutcome: null,
    soxlSoxsSwitchCount,
    lossFollowedByReentryCount,
    winnerAverageHoldingDurationMs: average(wins.flatMap((episode) => episode.holdingDurationMs ?? [])),
    loserAverageHoldingDurationMs: average(losses.flatMap((episode) => episode.holdingDurationMs ?? [])),
    dataQuality: {
      defensibleRealizedEpisodeCount: completeClosed.length,
      excludedEpisodeCount: positionLedger.excludedExecutionCount + positionLedger.episodes.filter((episode) => (
        episode.closedAt && episode.dataQuality !== 'COMPLETE_EXECUTION_BASIS'
      )).length,
      marketHistoryAvailable: false,
      limitations: sortedUnique([
        'AGGREGATE_ORDER_EXECUTIONS_ONLY',
        'CORPORATE_ACTIONS_REQUIRE_CANONICAL_ACTION_DATA',
        'MAE_MFE_POST_EXIT_AND_BENCHMARK_REQUIRE_CANONICAL_MARKET_HISTORY',
        'TRANSACTIONS_DESCRIBE_ACTIONS_NOT_MOTIVATIONS',
        ...positionLedger.limitations,
      ]),
    },
  };
}

function sizeBuckets(snapshot: CanonicalHoldingsSnapshot | null): Map<string, OwnerUniverseEntry['positionSizeBucket']> {
  const result = new Map<string, OwnerUniverseEntry['positionSizeBucket']>();
  if (!snapshot) return result;
  const totals = new Map<string, DecimalValue>();
  for (const holding of snapshot.holdings) {
    const amount = parseDecimal(holding.valuationAmount);
    if (!amount) continue;
    const currency = holding.currency ?? 'UNKNOWN';
    totals.set(currency, add(totals.get(currency) ?? decimalOrZero('0'), absolute(amount)));
  }
  for (const holding of snapshot.holdings) {
    const amount = parseDecimal(holding.valuationAmount);
    const total = totals.get(holding.currency ?? 'UNKNOWN');
    if (!amount || !total || total.coefficient === 0n) {
      result.set(holding.symbol, 'UNKNOWN');
      continue;
    }
    const share = divide(absolute(amount), total);
    if (!share) result.set(holding.symbol, 'UNKNOWN');
    else if (compare(share, decimalOrZero('0.5')) >= 0) result.set(holding.symbol, 'HIGH');
    else if (compare(share, decimalOrZero('0.2')) >= 0) result.set(holding.symbol, 'MEDIUM');
    else result.set(holding.symbol, 'LOW');
  }
  return result;
}

export function buildOwnerUniverse(input: {
  holdings: CanonicalHoldingsSnapshot | null;
  ledger: CanonicalTradeLedger;
  positions: PositionEpisodeLedger;
  manualWatchlist: Array<{ symbol: string; assetClass?: 'EQUITY' | 'ETF' }>;
  fallbackUniverse?: Array<{ symbol: string; assetClass?: 'EQUITY' | 'ETF' }>;
  generatedAt: string;
  recentTradeWindowDays?: number;
  maxEntries?: number;
}): OwnerUniverseProjection {
  const recentTradeWindowDays = input.recentTradeWindowDays ?? RECENT_TRADE_WINDOW_DAYS;
  const cutoff = Date.parse(input.generatedAt) - recentTradeWindowDays * 86_400_000;
  const actualSymbols = new Set(input.holdings?.holdings.map((holding) => holding.symbol) ?? []);
  const recentSymbols = new Set(input.ledger.executions
    .filter((execution) => execution.executedAt !== null && Date.parse(execution.executedAt) >= cutoff)
    .map((execution) => execution.symbol));
  const manualBySymbol = new Map(input.manualWatchlist.flatMap((item) => {
    const symbol = canonicalSymbol(item.symbol);
    return symbol ? [[symbol, item] as const] : [];
  }));
  const fallbackBySymbol = new Map((input.fallbackUniverse ?? []).flatMap((item) => {
    const symbol = canonicalSymbol(item.symbol);
    return symbol ? [[symbol, item] as const] : [];
  }));
  const symbols = sortedUnique([
    ...actualSymbols,
    ...recentSymbols,
    ...manualBySymbol.keys(),
    ...fallbackBySymbol.keys(),
  ]);
  const episodesBySymbol = new Map<string, CanonicalPositionEpisode[]>();
  for (const episode of input.positions.episodes) {
    episodesBySymbol.set(episode.symbol, [...(episodesBySymbol.get(episode.symbol) ?? []), episode]);
  }
  const buckets = sizeBuckets(input.holdings);
  const entries = symbols.map((symbol): OwnerUniverseEntry => {
    const actualHolding = actualSymbols.has(symbol);
    const recentlyTraded = recentSymbols.has(symbol);
    const manual = manualBySymbol.get(symbol);
    const fallback = fallbackBySymbol.get(symbol);
    const reasons = [
      ...(actualHolding ? ['ACTUAL_HOLDING' as const] : []),
      ...(recentlyTraded ? ['RECENTLY_TRADED' as const] : []),
      ...(manual ? ['MANUAL_WATCHLIST' as const] : []),
      ...(!actualHolding && !recentlyTraded && !manual && fallback ? ['FALLBACK_UNIVERSE' as const] : []),
    ];
    const priority = actualHolding ? 1 : recentlyTraded ? 2 : manual ? 3 : 4;
    const episodes = (episodesBySymbol.get(symbol) ?? []).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    const openEpisode = episodes.findLast((episode) => !episode.closedAt);
    const latestClosed = episodes.findLast((episode) => Boolean(episode.closedAt));
    const safeEntry = openEpisode?.dataQuality === 'COMPLETE_EXECUTION_BASIS';
    return {
      symbol,
      priority,
      reasons,
      assetClass: manual?.assetClass ?? fallback?.assetClass ?? 'UNKNOWN',
      actualHolding,
      recentlyTraded,
      positionState: actualHolding || openEpisode ? 'OPEN' : episodes.length ? 'FLAT' : 'UNKNOWN',
      entryTimestamp: safeEntry ? openEpisode?.openedAt ?? null : null,
      entryPrice: safeEntry ? openEpisode?.entryPrice ?? null : null,
      positionSizeBucket: actualHolding ? buckets.get(symbol) ?? 'UNKNOWN' : 'NONE',
      realizedOutcome: latestClosed?.dataQuality === 'COMPLETE_EXECUTION_BASIS'
        ? latestClosed.netRealizedPnl
        : null,
      systemDecisionAtTrade: 'NOT_AVAILABLE',
    };
  }).sort((left, right) => left.priority - right.priority || left.symbol.localeCompare(right.symbol));
  return {
    schemaVersion: 'owner-universe/v1',
    generatedAt: input.generatedAt,
    recentTradeWindowDays,
    entries: entries.slice(0, input.maxEntries ?? 100),
  };
}

export function createDecisionJournalEntry(input: Omit<
  DecisionJournalEntry,
  'schemaVersion' | 'userRationale' | 'systemDecisionAtTrade'
> & { userRationale?: string | null; historicalImport?: boolean }): DecisionJournalEntry {
  return {
    schemaVersion: 'owner-decision-journal/v1',
    journalId: input.journalId,
    tradeOrPositionRef: input.tradeOrPositionRef,
    systemPosture: input.historicalImport ? null : input.systemPosture,
    systemConfidence: input.historicalImport ? null : input.systemConfidence,
    confirmedEvidence: input.historicalImport ? [] : sortedUnique(input.confirmedEvidence),
    counterevidence: input.historicalImport ? [] : sortedUnique(input.counterevidence),
    marketRegime: input.historicalImport ? null : input.marketRegime,
    macroContext: input.historicalImport ? [] : sortedUnique(input.macroContext),
    tickerContext: input.historicalImport ? [] : sortedUnique(input.tickerContext),
    ownerExposure: input.ownerExposure,
    decisionVersion: input.historicalImport ? null : input.decisionVersion,
    timestamp: input.timestamp,
    systemDecisionAtTrade: input.historicalImport ? 'NOT_AVAILABLE' : 'CAPTURED',
    userRationale: typeof input.userRationale === 'string' && input.userRationale.trim()
      ? input.userRationale.trim()
      : null,
  };
}

export function buildOutcomeAttribution(input: {
  fact: string;
  concurrentSignals?: readonly string[];
  candidateChannels?: readonly string[];
  attributionConfidence?: OutcomeAttribution['attributionConfidence'];
}): OutcomeAttribution {
  return {
    schemaVersion: 'owner-outcome-attribution/v1',
    fact: input.fact,
    concurrentSignals: sortedUnique(input.concurrentSignals ?? []),
    candidateChannels: sortedUnique(input.candidateChannels ?? []),
    attributionConfidence: input.attributionConfidence ?? 'NONE',
    causalClaim: null,
  };
}

export function serializeOwnerLearningContextForAi(
  universe: OwnerUniverseProjection,
  behavior: OwnerBehaviorAggregates,
): OwnerLearningAiContext {
  // This is a runtime allowlist, not a TypeScript-only denylist. Schema drift
  // or an unsafe producer must not copy unexpected brokerage fields into AI
  // context merely because they are enumerable.
  const safeBehavior: OwnerLearningAiContext['behavior'] = {
    schemaVersion: behavior.schemaVersion,
    generatedAt: behavior.generatedAt,
    basis: {
      orderCount: behavior.basis.orderCount,
      executionCount: behavior.basis.executionCount,
      completeClosedEpisodeCount: behavior.basis.completeClosedEpisodeCount,
    },
    tradeFrequencyPer30Days: behavior.tradeFrequencyPer30Days,
    averageHoldingDurationMs: behavior.averageHoldingDurationMs,
    medianHoldingDurationMs: behavior.medianHoldingDurationMs,
    addToPositionCount: behavior.addToPositionCount,
    partialExitCount: behavior.partialExitCount,
    reentryCount: behavior.reentryCount,
    directionSwitchCount: behavior.directionSwitchCount,
    directionSwitchFrequency: behavior.directionSwitchFrequency,
    cancelRatio: behavior.cancelRatio,
    replaceRatio: behavior.replaceRatio,
    wins: behavior.wins,
    losses: behavior.losses,
    profitFactorByCurrency: { ...behavior.profitFactorByCurrency },
    mae: null,
    mfe: null,
    postExitDrift: null,
    benchmarkRelativeOutcome: null,
    soxlSoxsSwitchCount: behavior.soxlSoxsSwitchCount,
    lossFollowedByReentryCount: behavior.lossFollowedByReentryCount,
    winnerAverageHoldingDurationMs: behavior.winnerAverageHoldingDurationMs,
    loserAverageHoldingDurationMs: behavior.loserAverageHoldingDurationMs,
    dataQuality: {
      defensibleRealizedEpisodeCount: behavior.dataQuality.defensibleRealizedEpisodeCount,
      excludedEpisodeCount: behavior.dataQuality.excludedEpisodeCount,
      marketHistoryAvailable: false,
      limitations: [...behavior.dataQuality.limitations],
    },
  };
  return {
    schemaVersion: 'owner-learning-ai-context/v1',
    symbols: universe.entries.map((entry) => ({
      symbol: entry.symbol,
      actualHolding: entry.actualHolding,
      recentTrade: entry.recentlyTraded,
      ownerExposurePriority: entry.priority,
      ownerExposureReasons: entry.reasons,
      positionState: entry.positionState,
      entryTimestamp: entry.entryTimestamp,
      entryPrice: entry.entryPrice,
      positionSizeBucket: entry.positionSizeBucket,
      realizedOutcome: entry.realizedOutcome,
      systemDecisionAtTrade: 'NOT_AVAILABLE',
    })),
    behavior: safeBehavior,
  };
}

export function emptyTossSyncState(now: string): TossProviderSyncState {
  return {
    schemaVersion: TOSSINVEST_SCHEMA_VERSION,
    provider: TOSSINVEST_PROVIDER,
    opaqueAccountRef: null,
    accountState: 'NOT_CONFIGURED',
    backfill: {
      state: 'NOT_STARTED',
      from: null,
      to: null,
      nextCursor: null,
      pagesCommitted: 0,
      uniqueOrders: 0,
      startedAt: null,
      lastPageCommittedAt: null,
      completedAt: null,
    },
    incremental: {
      state: 'WAITING_FOR_BACKFILL',
      overlapDays: 14,
      windowFrom: null,
      windowTo: null,
      nextCursor: null,
      latestOrderedAt: null,
      lastPageCommittedAt: null,
      lastCompletedAt: null,
    },
    lastSuccessfulHoldingsSyncAt: null,
    lastProviderErrorCategory: null,
    updatedAt: now,
  };
}
