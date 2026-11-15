import type { OwnerSignalStory } from '../../shared/owner-intelligence-contract';

export function formatOwnerTime(value: string | null | undefined): string {
  if (!value) return '시각 미확인';
  // Trading-session dates are labels, not midnight instants.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '시각 미확인';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }).format(date) + ' KST';
}

export function ownerPriceDisplay(story: OwnerSignalStory, now = Date.now()): { text: string; detail: string } {
  const price = story.price.value;
  if (price === null || !Number.isFinite(price)) return { text: '가격 미확인', detail: '' };
  const original = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: price !== 0 && Math.abs(price) < 0.01 ? 6 : 2 }).format(price);
  if (story.price.currency !== 'USD') return { text: original + ' ' + story.price.currency, detail: '' };
  const usd = 'US$' + original;
  const fx = story.macroChannels?.find(row => row.id === 'macro-FX_USDKRW');
  const rate = fx?.value ? Number(fx.value) : NaN;
  const at = fx?.observedAt ? Date.parse(fx.observedAt) : NaN;
  if (!fx || !['AVAILABLE', 'STALE'].includes(fx.state) || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(at) || at > now || !fx.source?.trim()) {
    return { text: usd, detail: '원화 환산 대기 · 환율 또는 관측 시각 미확인' };
  }
  const stale = fx.state === 'STALE' || now - at > 120 * 3_600_000;
  const krw = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(price * rate);
  return {
    text: '약 ' + krw + ' (' + usd + ')',
    detail: '1 USD = ' + rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' KRW · ' +
      (fx.source || '출처 미확인') + ' · ' + formatOwnerTime(fx.observedAt) +
      (fx.source.includes('ECB') ? ' · 동일 관측일 EUR/KRW ÷ EUR/USD' : '') +
      (stale ? ' · 오래된 환율 · 참고용' : ' · 참고 환산') + ' · 거래 적용 환율과 다를 수 있음',
  };
}

/** Keep conversion provenance one tap away without crowding the decision. */
export function appendOwnerFxDetail(host: HTMLElement, detail: string): void {
  if (!detail) return;
  if (detail.startsWith('원화 환산 대기')) {
    const note = document.createElement('small'); note.textContent = '원화 환산 대기'; note.title = detail; host.append(note); return;
  }
  const details = document.createElement('details'); details.className = 'owner-fx-detail';
  const summary = document.createElement('summary');
  summary.textContent = detail.includes('오래된 환율') ? '오래된 환율 · 기준 보기' : '환산 기준';
  const body = document.createElement('small'); body.textContent = detail;
  details.append(summary, body); host.append(details);
}
