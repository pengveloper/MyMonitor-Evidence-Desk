import type { SituationEvidence } from '../../src/features/product-recovery/situation-synthesis-model.ts';
import type { BriefingAnchor } from '../../src/features/global-briefing/model.ts';
import type { QuakeRecord } from '../shared/usgs.ts';

// Synthetic scenario. Every row is invented for trying the screens without any network or key.
// Nothing here is a real event, and no provider data is copied.
// Times are placed relative to the moment the scenario is opened, so "28 minutes ago" stays 28 minutes ago.
export const SYNTHETIC_SOURCE = '가상 관측 기관';

export const syntheticQuakes = (now: number): QuakeRecord[] => { const at = (minutesAgo: number) => now - minutesAgo * 60_000; return [
  { id: 'synthetic-east-sea', magnitude: 6.1, place: '가상 사건 · 동쪽 해역 82km', occurredAt: at(28), updatedAt: at(12), url: '',
    latitude: 23.8, longitude: 121.9, depthKm: 20, tsunami: false, alert: 'yellow', reviewStatus: 'automatic' },
  { id: 'synthetic-andes', magnitude: 4.7, place: '가상 사건 · 북부 내륙 40km', occurredAt: at(1040), updatedAt: at(1000), url: '',
    latitude: -22.9, longitude: -68.2, depthKm: 96.4, tsunami: false, alert: null, reviewStatus: 'reviewed' },
  { id: 'synthetic-aegean', magnitude: 5.2, place: '가상 사건 · 에게해 연안 15km', occurredAt: at(310), updatedAt: at(280), url: '',
    latitude: 37.9, longitude: 26.8, depthKm: 10, tsunami: false, alert: 'green', reviewStatus: 'reviewed' },
]; };

type Row = { id: string; category: SituationEvidence['category']; title: string; summary: string; uncertainty: string; observedAt: string; level: 'HIGH' | 'MEDIUM' | 'LOW';
  region: string; freshness: SituationEvidence['freshness']; source: string; at: [number, number]; next: string; signals?: SituationEvidence['signals'] };
const rows = (now: number): Row[] => { const at = (minutesAgo: number) => now - minutesAgo * 60_000; return [
  { id: 'synthetic:strait', category: 'LOGISTICS_INFRASTRUCTURE', title: '가상 사건 · 해협 항로, 일부 선사 우회 공지', summary: '일부 선사가 우회 항로를 쓴다고 공지했다는 가상 상황입니다.',
    uncertainty: '운임 변화 폭은 정해 두지 않았습니다.', observedAt: new Date(at(52)).toISOString(), level: 'MEDIUM', region: '가상 해협', freshness: 'FRESH', source: '가상 선사 공지', at: [19.5, 39.8],
    next: '항만 공지와 운항 기록 대조', signals: ['LOGISTICS_PRESSURE_UP'] },
  { id: 'synthetic:energy', category: 'ENERGY_COMMODITIES', title: '가상 사건 · 원유 재고 발표, 원문 갱신 대기', summary: '주간 재고 발표가 예정돼 있으나 원문이 아직 갱신되지 않았다는 가상 상황입니다.',
    uncertainty: '발표 전에는 방향을 판단하지 않습니다.', observedAt: new Date(at(130)).toISOString(), level: 'MEDIUM', region: '가상 지역', freshness: 'STALE', source: '가상 통계 기관', at: [29.7, -95.3],
    next: '원문 갱신 후 수치 확인', signals: ['ENERGY_PRICE_UP'] },
  { id: 'synthetic:talks', category: 'GEOPOLITICS_SECURITY', title: '가상 사건 · 안보 협의, 발표와 실행을 구분', summary: '공동 성명이 나왔다는 가상 상황입니다. 실제 조치와 적용 범위는 별도로 확인해야 합니다.',
    uncertainty: '성명만으로 조치 시점을 알 수 없습니다.', observedAt: new Date(at(300)).toISOString(), level: 'LOW', region: '가상 도시', freshness: 'FRESH', source: '가상 공동 성명', at: [50.85, 4.35],
    next: '후속 조치 발표 확인' },
]; };

export function syntheticExtra(now: number): { evidence: SituationEvidence[]; anchors: Record<string, BriefingAnchor> } {
  const list = rows(now), fetchedAt = new Date(now).toISOString();
  const evidence = list.map((r): SituationEvidence => ({
    id: r.id, category: r.category, title: r.title, summary: r.summary, uncertainty: r.uncertainty, relevanceReason: '화면을 써 보기 위한 가상 사건입니다. 실제 뉴스가 아닙니다.',
    observedAt: r.observedAt, source: { id: 'SYNTHETIC', label: r.source, mode: r.freshness === 'FRESH' ? 'LIVE' : 'PUBLIC_SNAPSHOT' }, freshness: r.freshness, evidenceRefs: [r.id],
    deepLink: '#briefingTimeline', availability: 'AVAILABLE', importance: { level: r.level, basis: 'CANONICAL_SEVERITY' }, ...(r.signals ? { signals: r.signals } : {}),
    context: { region: r.region }, nextCheck: { label: r.next, reason: r.uncertainty, deepLink: '#briefingTimeline' },
  }));
  return { evidence, anchors: Object.fromEntries(list.map(r => [r.id, { latitude: r.at[0], longitude: r.at[1], fetchedAt }])) };
}
