/** Existing stored ECB-derived owner FX reference. */
export interface OwnerFxReference {
  rate: number;
  observedAt: string;
  fetchedAt: string;
  source: string;
  url: string;
  basis: string;
}

export type OwnerFxStoragePath = 'CURRENT' | 'LAST_GOOD';
