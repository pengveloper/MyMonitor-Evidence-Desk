export type NarrativeScope = 'MARKET_CONTEXT_ONLY' | 'INSTRUMENT_CONTEXT';
/** No rejected prose or numeric lexeme is retained in the error. */
export class NumericProseRejection extends Error {
  readonly numericProseDetected = true;
  constructor(readonly field: string, readonly scope: NarrativeScope) {
    super('SEMANTIC_NUMERIC_PROSE_FORBIDDEN');
  }
}
export function assertQualitativeProse(text: string, field: string, scope: NarrativeScope) {
  if (/[0-9]/.test(text)) throw new NumericProseRejection(field, scope);
}
