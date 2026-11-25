// The field view only needs the country codes for its search text. The full command
// catalogue of the desktop app (and everything it imports) stays out of this build.
import codes from '../../shared/iso2-to-iso3.json';

export const ISO_CODES: string[] = Object.keys(codes).filter(code => /^[A-Z]{2}$/.test(code)).sort();
