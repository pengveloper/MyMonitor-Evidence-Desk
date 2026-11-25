import { executiveEventEvidence } from '../../src/features/product-recovery/executive-observation-adapter.ts';
import { buildSituationBriefing, type SituationEvidence } from '../../src/features/product-recovery/situation-synthesis-model.ts';
import type { BriefingAnchor, BriefingUpdate } from '../../src/features/global-briefing/model.ts';
import type { QuakeRecord } from '../shared/usgs.ts';

// Earthquake records become briefing entries through the same adapter the personal app uses for
// its already-loaded earthquakes. Nothing about damage, prices or companies is added here.

/** Shown as "high" only on what USGS itself published: magnitude 6.0+, a tsunami flag, or an orange/red PAGER alert. */
export const isHighConcern = (record: QuakeRecord) => record.magnitude >= 6 || record.tsunami || record.alert === 'orange' || record.alert === 'red';

const ALERT_KO: Record<string, string> = { green: '녹색', yellow: '황색', orange: '주황', red: '적색' };
function publishedFacts(record: QuakeRecord, source: string): string[] {
  return [
    record.depthKm === null ? '진원 깊이는 발표되지 않았습니다.' : `진원 깊이 ${record.depthKm}km로 발표됐습니다.`,
    record.tsunami ? `${source} 자료에 쓰나미 관련 표시가 있습니다. 실제 경보 여부는 해당 기관 발표로 확인해야 합니다.` : `${source} 자료에 쓰나미 관련 표시는 없습니다.`,
    ...(record.alert ? [`PAGER 경보 단계: ${ALERT_KO[record.alert] ?? record.alert}`] : []),
    record.reviewStatus === 'reviewed' ? '분석관이 검토한 값입니다.' : record.reviewStatus === 'automatic' ? '자동 산출 값이며 검토 뒤 규모와 위치가 바뀔 수 있습니다.' : '검토 상태는 발표되지 않았습니다.',
  ];
}

export interface BriefingInput {
  records: readonly QuakeRecord[];
  /** False when the values are stored ones and the provider could not be reached or the last success is old. */
  fresh: boolean;
  generatedAt: string;
  /** When the values were received from the provider; shown as the fetch time of every event. */
  fetchedAt: string | null;
  /** Extra evidence (synthetic scenario rows). Real modes pass none. */
  extra?: readonly SituationEvidence[];
  extraAnchors?: Readonly<Record<string, BriefingAnchor>>;
  scenario?: boolean;
  /** Source name shown on every event. Real modes leave the default. */
  sourceLabel?: string;
}

export function briefingFromRecords(input: BriefingInput): BriefingUpdate {
  const evidence = executiveEventEvidence({
    earthquakes: input.records.map(r => ({ id: r.id, place: r.place, magnitude: r.magnitude, occurredAt: r.occurredAt, sourceUrl: r.url, source: input.sourceLabel ?? 'USGS', ...(isHighConcern(r) ? { concernLevel: 'high' } : {}) })),
    earthquakeSourceFresh: input.fresh, conflictSourceFresh: false,
  });
  const model = buildSituationBriefing({ generatedAt: input.generatedAt, evidence: [...evidence, ...(input.extra ?? [])] });
  const byId = new Map(input.records.map(r => [`world:earthquake:${r.id}`, r]));
  const anchors: Record<string, BriefingAnchor> = { ...input.extraAnchors };
  for (const entry of model.entries) {
    const record = byId.get(entry.id); if (!record) continue;
    entry.details.mainChanges = publishedFacts(record, input.sourceLabel ?? 'USGS');
    anchors[entry.id] = { latitude: record.latitude, longitude: record.longitude, ...(input.fetchedAt ? { fetchedAt: input.fetchedAt } : {}) };
  }
  return { model, anchors, ...(input.scenario ? { scenario: true } : {}) };
}
