import type { BriefingEntry, SituationBriefingModel } from '../product-recovery/situation-synthesis-model';
import { briefingSearchText } from './presentation';

/** Presentation-only joins onto existing evidence. Missing provenance stays missing. */
export interface BriefingAnchor {
  latitude?: number;
  longitude?: number;
  fetchedAt?: string;
}
export interface BriefingUpdate {
  /** Synthetic development documents only; never canonical or owner data. */
  demoDocuments?: Readonly<Record<string, import('./demo-briefs').DemoDocument>>;
  model: SituationBriefingModel;
  anchors: Readonly<Record<string, BriefingAnchor>>;
  scenario?: boolean;
}
export const FILTERS = ['전체', '지정학', '자연재해', '물류·인프라', '에너지', '시장'] as const;
export type BriefingFilter = typeof FILTERS[number];
export function eventCategory(entry: BriefingEntry): BriefingFilter {
  if (entry.id.startsWith('world:earthquake:')) return '자연재해';
  if (entry.category === 'GEOPOLITICS_SECURITY') return '지정학';
  if (entry.category === 'LOGISTICS_INFRASTRUCTURE') return '물류·인프라';
  if (entry.category === 'ENERGY_COMMODITIES') return '에너지';
  if (entry.category === 'MARKET' || entry.category === 'MACRO') return '시장';
  return '전체';
}
export function eventCoordinates(anchor?: BriefingAnchor): [number, number] | null {
  if (!anchor || !Number.isFinite(anchor.latitude) || !Number.isFinite(anchor.longitude)
    || Math.abs(anchor.latitude!) > 90 || Math.abs(anchor.longitude!) > 180) return null;
  return [anchor.longitude!, anchor.latitude!];
}
export function briefingTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '미확인';
  // Date-only observations must not acquire an invented midnight/session.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} · 일별 기준일`;
  return `${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))} KST`;
}
export function sourceHref(value?: string): string | null {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function visibleEvents(update: BriefingUpdate | null, filter: BriefingFilter, query = ''): BriefingEntry[] {
  return (update?.model.entries ?? []).filter(entry => entry.category !== 'WATCHLIST' && entry.category !== 'DATA_QUALITY' && entry.category !== 'COMPANY_SEC')
    .filter(entry => filter === '전체' || eventCategory(entry) === filter)
    .filter(entry => `${entry.title} ${briefingSearchText(entry)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
}
