import { secProvenanceView } from './sec-provenance-view';
import type { PublicDiscoverySnapshot } from '../../../shared/owner-discovery-contract';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; return n;
}

/** The same component and immutable artifact are used in both layouts. */
export function publicEvidenceView(snapshot: PublicDiscoverySnapshot): HTMLElement {
  const box = node('section'); box.className = 'card public-evidence';
  box.setAttribute('aria-label', '실제 공개 근거 snapshot');
  box.dataset.evidenceMode = snapshot.dataMode;
  if (snapshot.eligibility === 'EXCLUDED') {
    box.append(node('h2', '공개 근거 연결 보류'), node('p', snapshot.state + ' · ' + snapshot.reason), node('p', '검증 조건을 충족하지 않아 현재 근거로 표시하지 않습니다.')); return box;
  }
  box.append(node('h2', '실제 근거 연결됨 · ' + (snapshot.input.evidence?.symbol ?? '미확인') + ' SEC 보존 snapshot'));
  box.append(node('p', '이 카드는 CISS 공개 SEC 저장본입니다. 다른 종목의 후보 검토 근거로 사용하지 않습니다. 실제 규칙 판정은 별도 결과 카드에 표시하며 설계 샘플은 mock입니다. 추천·점수·순위는 생성하지 않습니다.'));
  box.append(node('p', '시점 고정 snapshot · 현재 자료 아님 · ' + snapshot.state + ' · ' + snapshot.eligibility));
  const e = snapshot.input.evidence, event = e?.events[0];
  if (!e || !event) { box.append(node('p', snapshot.reason)); return box; }
  const list = node('dl');
  for (const [label, value] of [
    ['분석 기준시각 (cutoffAt)', snapshot.cutoffAt],
    ['SEC 접수시각 · cluster 대표 (publishedAt)', event.publishedAt ?? '미확인'],
    ['기존 묶음 조립시각 (collectedAt)', e.collectedAt],
    ['snapshot 추출시각 (capturedAt)', snapshot.input.capturedAt],
    ['원문 개별 수집시각', '기존 OwnerEvent에 없음 · 미확인 (추출시각으로 대체하지 않음)'],
    ['evidence ID', event.id], ['기존 canonical bundle fingerprint', e.fingerprint],
    ['공개 내용 fingerprint', snapshot.materialFingerprint ?? '미확인'],
    ['공개 projection contentHash', snapshot.contentHash ?? '미확인'],
    ['저장 당시 SEC 상태 / 기준시각 평가', e.secState + ' / ' + snapshot.state],
    ['검증 결과', snapshot.reason],
  ]) { list.append(node('dt', label), node('dd', value)); }
  box.append(list);
  const more = node('details'); more.append(node('summary', '원문·출처·보존 한계 확인'));
  more.append(node('p', event.title), node('p', '저장 번역: ' + (event.titleKo ?? '없음') + ' · ' + event.translation));
  more.append(node('p', '기존 cluster 그대로: ' + event.duplicateCount + '개 signal 병합, ' + event.sources.length + '개 보존 링크. 발췌의 문장별 출처 매핑은 없으며 병합된 문구를 단일 공시의 연속 인용으로 해석하지 않습니다.'));
  const excerpt = node('pre', event.excerpt ?? '발췌 없음'); more.append(excerpt);
  for (const source of event.sources) {
    const a = node('a', source.name + ' · ' + (source.primary ? '1차 출처' : '2차 출처') + ' · ' + source.url);
    a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; more.append(a, node('br'));
  }
  more.append(node('p', '기존 tags 보존: ' + event.tags.join(', ')));
  more.append(node('p', 'ATM capacity와 실제 발행을 여기서 추론하지 않습니다. 원문·숫자·번역 상태는 저장본 그대로이며 새로 검증하거나 번역하지 않았습니다.'));
  more.append(node('p', 'Production 최초 인지·개별 원문 수집시각은 미확인. 이 추출을 과거 PIT receipt로 소급 사용하지 않습니다. OUTDATED는 분석 상태이며 이 화면에는 AI 분석이 없습니다.'));
  box.append(more, secProvenanceView(snapshot.secProvenance)); return box;
}
