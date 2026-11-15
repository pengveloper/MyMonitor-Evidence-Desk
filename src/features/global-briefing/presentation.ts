import { ISO_CODES } from '@/config/commands';
import type { BriefingEntry } from '../product-recovery/situation-synthesis-model';

const english = new Intl.DisplayNames(['en'], { type: 'region' });
const korean = new Intl.DisplayNames(['ko'], { type: 'region' });
const countryNames = ISO_CODES.map(code => ({ en: english.of(code)!, ko: korean.of(code)! }));

/** Search aliases only, not inferred event locations or translated article prose. */
export function regionSearchAliases(region: string): string {
  return countryNames.filter(({ en, ko }) => region.includes(ko)
    || new RegExp(`(^|[^a-z])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(region))
    .map(({ en, ko }) => `${en} ${ko}`).join(' ');
}

/** Format a known magnitude, never arbitrary numbers inside news or evidence. */
export function briefingPresentation(entry: BriefingEntry) {
  let title = entry.title, summary = entry.summary;
  const magnitude = entry.id.startsWith('world:earthquake:') ? entry.context?.impact?.magnitude : undefined;
  if (typeof magnitude === 'number' && Number.isFinite(magnitude)) {
    const raw = `규모 ${magnitude} 지진`, shown = `규모 ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(magnitude)} 지진`;
    title = title.replace(raw, shown); summary = summary.replace(raw, shown);
  }
  const rawTitle = entry.originalTitle === entry.title && /\p{L}/u.test(title) && !/[가-힣]/.test(title);
  const rawSummary = entry.originalSummary === entry.summary && /\p{L}/u.test(summary) && !/[가-힣]/.test(summary);
  const labels = [rawTitle ? '제목 원문 · 한국어 번역 미제공' : '', rawSummary ? '요약 원문 · 한국어 번역 미제공' : '',
    magnitude !== undefined && /[a-z]/i.test(entry.context?.region ?? '') ? '지역명 원문' : ''].filter(Boolean);
  if (!labels.length && entry.context?.translation?.status === 'TRANSLATED') labels.push('저장된 한국어 번역');
  return { title, summary, languageLabel: labels.join(' · ') };
}

export function briefingSearchText(entry: BriefingEntry): string {
  return [entry.summary, entry.originalTitle, entry.originalSummary, entry.context?.region,
    regionSearchAliases(entry.context?.region ?? ''), ...entry.context?.symbols ?? []].filter(Boolean).join(' ');
}

export interface BriefingSearchItem { id: string; title: string; subtitle: string; searchText?: string; activate: () => void; }
