import type { MarketData } from '@/types';

/** Format only the observed quote unit; never infer currency from a country. */
export function formatMarketPrice(stock: Pick<MarketData, 'symbol' | 'currency' | 'instrumentType' | 'assetClass'>, value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const amount = value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  if (stock.instrumentType === 'INDEX' || stock.assetClass === 'INDEX' || stock.symbol.startsWith('^')) return amount + ' pt';
  const currency = stock.currency?.trim();
  // GBp and GBX are pence, not GBP pounds. Preserve the quoted denomination.
  if (currency === 'GBp' || currency === 'GBX') return amount + ' GBX';
  if (currency && /^[A-Z]{3}$/.test(currency)) return amount + ' ' + currency;
  return amount + ' (통화 미확인)';
}
