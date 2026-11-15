import type { DiscoveryReadOnlyInput } from './owner-discovery-contract';
import type { CanonicalSymbolSearchResult } from './symbol-search-contract';
/** Exact allowlisted fields of the existing EODHD fundamentals General object. */
export interface StoredEodhdClassification {
 General: { Code: string; Type: string; Name: string; Exchange: string;
 CurrencyCode: string; CountryName: string; UpdatedAt: string | null; ISIN: string | null };
}
export interface PublicClassificationInput extends DiscoveryReadOnlyInput<StoredEodhdClassification> {
 receiptScope: 'EXTRACTION_ONLY' | 'PROVIDER_READ_THROUGH';
}
export interface PublicClassificationSnapshot {
 input: PublicClassificationInput;
 canonical: CanonicalSymbolSearchResult | null;
 materialFingerprint: string | null;
 eligibility: 'VERIFIED_PROVIDER_TYPE' | 'EXCLUDED';
 reason: string;
 temporalScope: 'CURRENT_STORED_READBACK_NOT_HISTORICAL_PIT' | 'CURRENT_PROVIDER_READ_NOT_HISTORICAL_PIT';
}
