import type {
  CorporateActionEffectiveTimePrecision,
  CorporateActionSplitRatio,
  CorporateActionType,
} from './contracts.ts';

export interface CorporateActionEffectiveTimeInput {
  effectiveDate?: string;
  effectiveAt?: string;
  effectiveTimePrecision?: CorporateActionEffectiveTimePrecision;
  effectiveLocalDateTime?: string;
  effectiveTimeZone?: string;
}

export interface ResolvedCorporateActionEffectiveTime {
  precision: CorporateActionEffectiveTimePrecision;
  effectiveDate?: string;
  effectiveAt?: string;
  effectiveLocalDateTime?: string;
  effectiveTimeZone?: string;
}

export interface FormattedCorporateActionSplit {
  /** Market convention: post-action shares for pre-action shares. */
  ratioLabel: string;
  /** Direction-explicit wording that cannot be mistaken for a price ratio. */
  conversionLabel: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function exactUtcTimestamp(value: string, label: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new Error(`${label} must be an exact UTC ISO timestamp`);
  }
  return value;
}

function exactDate(value: string, label: string): string {
  const match = DATE_RE.exec(value);
  if (!match) throw new Error(`${label} must be an ISO calendar date`);
  const epoch = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real ISO calendar date`);
  }
  return value;
}

function localParts(value: string): [number, number, number, number, number, number] {
  const match = LOCAL_TIME_RE.exec(value);
  if (!match) throw new Error('effectiveLocalDateTime must be YYYY-MM-DDTHH:mm:ss without an offset');
  const parts = match.slice(1).map(Number) as [number, number, number, number, number, number];
  const [year, month, day, hour, minute, second] = parts;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (check.getUTCFullYear() !== year
    || check.getUTCMonth() + 1 !== month
    || check.getUTCDate() !== day
    || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute
    || check.getUTCSeconds() !== second) {
    throw new Error('effectiveLocalDateTime is not a real local wall-clock time');
  }
  return parts;
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  if (!timeZone || timeZone !== timeZone.trim()) throw new Error('effectiveTimeZone must be a trimmed IANA timezone');
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    });
    if (formatter.resolvedOptions().timeZone !== timeZone) {
      throw new Error('effectiveTimeZone must be a canonical supported IANA timezone');
    }
    return formatter;
  } catch {
    throw new Error('effectiveTimeZone must be a canonical supported IANA timezone');
  }
}

function formattedParts(formatter: Intl.DateTimeFormat, epoch: number): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
}

function offsetMs(parts: Record<string, string>): number | undefined {
  const value = parts.timeZoneName;
  if (value === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return undefined;
  const magnitude = (Number(match[2]) * 60 + Number(match[3])) * 60_000;
  return match[1] === '-' ? -magnitude : magnitude;
}

/**
 * Convert a source wall-clock plus IANA zone without assuming a fixed offset.
 * Nonexistent and ambiguous DST wall-clocks are rejected rather than guessed.
 */
export function corporateActionLocalTimeToUtc(localDateTime: string, timeZone: string): string {
  const expected = localParts(localDateTime);
  const formatter = formatterFor(timeZone);
  const naiveEpoch = Date.UTC(
    expected[0], expected[1] - 1, expected[2], expected[3], expected[4], expected[5],
  );
  const possibleOffsets = new Set<number>();
  for (let deltaHours = -36; deltaHours <= 36; deltaHours += 6) {
    const offset = offsetMs(formattedParts(formatter, naiveEpoch + deltaHours * 3_600_000));
    if (offset !== undefined) possibleOffsets.add(offset);
  }
  const matches = [...possibleOffsets]
    .map((offset) => naiveEpoch - offset)
    .filter((candidate) => {
      const parts = formattedParts(formatter, candidate);
      return Number(parts.year) === expected[0]
        && Number(parts.month) === expected[1]
        && Number(parts.day) === expected[2]
        && Number(parts.hour) === expected[3]
        && Number(parts.minute) === expected[4]
        && Number(parts.second) === expected[5];
    });
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    throw new Error(unique.length === 0
      ? 'effective local time does not exist in the supplied timezone'
      : 'effective local time is ambiguous in the supplied timezone');
  }
  return new Date(unique[0]!).toISOString();
}

export function resolveCorporateActionEffectiveTime(
  input: CorporateActionEffectiveTimeInput,
): ResolvedCorporateActionEffectiveTime {
  const hasLocal = input.effectiveLocalDateTime !== undefined || input.effectiveTimeZone !== undefined;
  if (hasLocal && (!input.effectiveLocalDateTime || !input.effectiveTimeZone)) {
    throw new Error('effective local time requires both wall-clock and IANA timezone');
  }
  const derivedAt = hasLocal
    ? corporateActionLocalTimeToUtc(input.effectiveLocalDateTime!, input.effectiveTimeZone!)
    : undefined;
  const effectiveAt = input.effectiveAt
    ? exactUtcTimestamp(input.effectiveAt, 'effectiveAt')
    : derivedAt;
  if (effectiveAt && derivedAt && effectiveAt !== derivedAt) {
    throw new Error('effectiveAt does not match the supplied local wall-clock and timezone');
  }
  const effectiveDate = input.effectiveDate
    ? exactDate(input.effectiveDate, 'effectiveDate')
    : input.effectiveLocalDateTime?.slice(0, 10);
  const inferred: CorporateActionEffectiveTimePrecision = effectiveAt
    ? 'EXACT_TIMESTAMP'
    : effectiveDate
      ? 'DATE_ONLY'
      : 'UNKNOWN';
  if (input.effectiveTimePrecision && input.effectiveTimePrecision !== inferred) {
    throw new Error('effectiveTimePrecision contradicts the supplied effective-time fields');
  }
  return {
    precision: inferred,
    ...(effectiveDate ? { effectiveDate } : {}),
    ...(effectiveAt ? { effectiveAt } : {}),
    ...(input.effectiveLocalDateTime ? { effectiveLocalDateTime: input.effectiveLocalDateTime } : {}),
    ...(input.effectiveTimeZone ? { effectiveTimeZone: input.effectiveTimeZone } : {}),
  };
}

function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

export function formatCorporateActionSplit(
  actionType: Extract<CorporateActionType, 'STOCK_SPLIT' | 'REVERSE_SPLIT'>,
  ratio: CorporateActionSplitRatio,
): FormattedCorporateActionSplit {
  const { fromQuantity, toQuantity } = ratio;
  if (!Number.isFinite(fromQuantity) || !Number.isFinite(toQuantity)
    || fromQuantity <= 0 || toQuantity <= 0 || fromQuantity === toQuantity) {
    throw new Error('split ratio requires distinct finite positive old/new share quantities');
  }
  if (actionType === 'STOCK_SPLIT' && toQuantity <= fromQuantity) {
    throw new Error('forward split requires new shares greater than old shares');
  }
  if (actionType === 'REVERSE_SPLIT' && toQuantity >= fromQuantity) {
    throw new Error('reverse split requires new shares less than old shares');
  }
  const oldShares = quantity(fromQuantity);
  const newShares = quantity(toQuantity);
  return {
    ratioLabel: `${newShares}-for-${oldShares}`,
    conversionLabel: `${oldShares} old ${fromQuantity === 1 ? 'share' : 'shares'} → ${newShares} new ${toQuantity === 1 ? 'share' : 'shares'}`,
  };
}
