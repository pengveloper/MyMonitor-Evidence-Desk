import type { SituationEvidence } from './situation-synthesis-model.ts';

interface EarthquakeObservation {
  id: string; place: string; magnitude: number; occurredAt: number; sourceUrl: string;
  source?: string; concernLevel?: string;
}
interface ConflictObservation {
  id: string; country: string; location: string; eventType: string; time: Date;
  fatalities: number; source: string;
}
export interface ExecutiveObservationInput {
  earthquakes?: readonly EarthquakeObservation[];
  conflicts?: readonly ConflictObservation[];
  earthquakeSourceFresh: boolean;
  conflictSourceFresh: boolean;
}
function observationTime(value: number): string | null {
  const date = new Date(value);
  return value > 0 && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
/** Uses already-loaded canonical events; no new fetches, keys, or source activation. */
export function executiveEventEvidence(input: ExecutiveObservationInput): SituationEvidence[] {
  const earthquakes = (input.earthquakes ?? []).filter((event) => Number.isFinite(event.magnitude) && event.magnitude >= 4.5).map((event): SituationEvidence => ({
    id: `world:earthquake:${event.id}`, category: 'WORLD', title: `규모 ${event.magnitude} 지진 · ${event.place}`,
    summary: `${event.place}에서 규모 ${event.magnitude} 지진이 관측됐습니다. 피해·공급망 영향은 별도 확인이 필요합니다.`,
    relevanceReason: '공식 지진 관측과 현지 피해·인프라 영향을 대조할 사건입니다.',
    observedAt: observationTime(event.occurredAt),
    source: { id: event.source || 'USGS', label: event.source || 'USGS', mode: input.earthquakeSourceFresh ? 'LIVE' : 'STALE', href: event.sourceUrl },
    freshness: input.earthquakeSourceFresh ? 'FRESH' : 'STALE', availability: input.earthquakeSourceFresh ? 'AVAILABLE' : 'DELAYED',
    evidenceRefs: [event.id], deepLink: event.sourceUrl || '#mapSection',
    context: { region: event.place, observationKind: 'EVENT', confirmed: true, impact: { magnitude: event.magnitude } },
    ...(event.concernLevel === 'high' ? { importance: { level: 'HIGH', basis: 'CANONICAL_SEVERITY' } as const } : {}),
    uncertainty: '규모는 피해 규모가 아니며 가격·기업 영향은 아직 확인되지 않았습니다.',
  }));
  const conflicts = (input.conflicts ?? []).map((event): SituationEvidence => ({
    id: `geopolitics:${event.id}`, category: 'GEOPOLITICS_SECURITY', title: `${event.country} · 분쟁 사건 관측`,
    summary: `${event.location}의 분쟁 사건이 기록됐습니다${Number.isFinite(event.fatalities) ? ` · 보고 사망자 ${event.fatalities}명` : ''}.`,
    relevanceReason: '지역 안보 상황과 독립 보도를 대조할 기록입니다. 단일 사건으로 위험 증가를 단정하지 않습니다.',
    observedAt: observationTime(event.time instanceof Date ? event.time.getTime() : Number.NaN),
    source: { id: 'ACLED', label: event.source || 'ACLED', mode: input.conflictSourceFresh ? 'LIVE' : 'STALE' },
    freshness: input.conflictSourceFresh ? 'FRESH' : 'STALE', availability: input.conflictSourceFresh ? 'AVAILABLE' : 'DELAYED',
    evidenceRefs: [event.id], deepLink: '#mapSection', context: {
      region: event.country,
      observationKind: 'EVENT',
      ...(Number.isFinite(event.fatalities) && event.fatalities >= 0 ? { impact: { casualties: event.fatalities } } : {}),
    },
    uncertainty: '보고 시차·수정 가능성이 있습니다. 전쟁 확대나 투자 영향을 뜻하지 않습니다.',
  }));
  return [...earthquakes, ...conflicts];
}
