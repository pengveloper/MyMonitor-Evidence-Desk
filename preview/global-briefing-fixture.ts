import { buildSituationBriefing, type SituationEvidence } from '../src/features/product-recovery/situation-synthesis-model';
import type { BriefingUpdate } from '../src/features/global-briefing/model';

// Explicit design scenarios, never imported by the production app.
const observedAt = '2026-10-05T01:00:00.000Z';
const rows = [
  ['world:earthquake:scenario-taiwan', 'WORLD', '대만 동쪽 해역에서 지진 관측', '지진 관측을 피해 보고와 대조합니다. 반도체 생산 차질은 확인되지 않았습니다.', '자연재해 관측과 공급망 영향은 별도의 근거입니다.', 24, 122],
  ['scenario-maritime', 'LOGISTICS_INFRASTRUCTURE', '홍해 항로, 운항 변화를 확인할 때', '항로 우회 여부와 항만 공지를 대조하는 가상 시나리오입니다.', '운임 상승이나 공급 차질은 이 장면에서 입증되지 않았습니다.', 19, 40],
  ['scenario-energy', 'ENERGY_COMMODITIES', '에너지 공급 공지의 원문을 기다립니다', '공급 일정과 가격 움직임을 구분해 읽습니다. 현재 가격은 연결되지 않았습니다.', '공급 공지 하나로 유가 방향을 판단하지 않습니다.', 26, 51],
  ['scenario-geopolitics', 'GEOPOLITICS_SECURITY', '유럽 안보 협의, 발표와 실행을 구분', '공식 발표 후 실제 조치와 적용 범위를 확인할 필요가 있습니다.', '확인되지 않은 전망은 투자 판단의 근거가 아닙니다.', 50, 22],
  ['scenario-market', 'MARKET', '미국 시장의 마지막 관측값 확인', '휴장 중 마지막 관측과 세션 중 데이터 지연은 다르게 표시합니다.', '참고값을 실시간 가격으로 취급하지 않습니다.', 40.7, -74],
] as const;
export function globalBriefingFixture(state = 'normal'): BriefingUpdate {
  const evidence: SituationEvidence[] = rows.map(([id, category, title, summary, uncertainty]) => ({
    id, category, title, summary, uncertainty, relevanceReason: '디자인 검수용 가상 사건 · 실제 뉴스 아님',
    observedAt, source: { id: 'DESIGN_SCENARIO', label: '가상 시나리오 · 원문 미연결', mode: 'PUBLIC_SNAPSHOT' },
    freshness: state === 'stale' ? 'STALE' : 'UNKNOWN', evidenceRefs: [id], deepLink: '#briefingTimeline',
    availability: state === 'failed' ? 'UNAVAILABLE' : 'AVAILABLE',
    nextCheck: { label: '공식 관측과 피해 보고 대조', reason: uncertainty, deepLink: '#briefingTimeline' },
  }));
  return { scenario: true, model: buildSituationBriefing({ generatedAt: '2026-10-05T02:00:00.000Z', evidence: state === 'empty' ? [] : evidence }),
    anchors: Object.fromEntries(rows.map(([id, , , , , latitude, longitude]) => [id, { latitude, longitude, fetchedAt: '2026-10-05T01:10:00.000Z' }])) };
}

/** Additional regression scenario, opt-in; never represents an actual Fiji report. */
export function briefingPolishFixture(): BriefingUpdate {
  const fixture = globalBriefingFixture();
  const event = structuredClone(fixture.model.entries[0]!);
  event.id = 'world:earthquake:scenario-fiji';
  event.title = '규모 4.8869503562808 지진 · south of the Fiji Islands';
  event.summary = 'south of the Fiji Islands에서 규모 4.8869503562808 지진이 관측된 가상 시나리오입니다. 피해는 미확인입니다.';
  event.originalTitle = event.title; event.originalSummary = event.summary;
  event.context = { region: 'south of the Fiji Islands', impact: { magnitude: 4.8869503562808 } };
  event.evidenceRefs = [event.id];
  fixture.model.entries.push(event);
  fixture.anchors = { ...fixture.anchors, [event.id]: { latitude: -24, longitude: 179, fetchedAt: '2026-10-05T01:10:00.000Z' } };
  return fixture;
}
