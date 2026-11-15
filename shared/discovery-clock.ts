/** Explicit instant comparison for discovery cutoff; no date-only coercion. Adapted from the owner-supplied DISCOVERY-0 draft. */
export function parseInstantNs(value: string): bigint {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match)
        throw new Error('Explicit ISO timestamp and timezone required');
    const [, y, mo, d, h, mi, s, fraction = '', zone = ''] = match;
    const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number) as [
        number,
        number,
        number,
        number,
        number,
        number
    ];
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        throw new Error('Invalid calendar instant');
    }
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error('Invalid calendar date');
    }
    let offsetMinutes = 0;
    if (zone !== 'Z') {
        const zh = Number(zone.slice(1, 3)), zm = Number(zone.slice(4, 6));
        if (zh > 23 || zm > 59)
            throw new Error('Invalid timezone offset');
        offsetMinutes = (zone[0] === '+' ? 1 : -1) * (zh * 60 + zm);
    }
    return BigInt(date.getTime() - offsetMinutes * 60000) * 1000000n
        + BigInt(fraction.padEnd(9, '0') || '0');
}
