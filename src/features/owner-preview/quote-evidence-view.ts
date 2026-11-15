import type { PublicQuoteDiscoverySnapshot } from '../../../shared/owner-discovery-contract';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; return n;
}

export function quoteEvidenceView(snapshot: PublicQuoteDiscoverySnapshot): HTMLElement {
  const box = node('section'); box.className = 'card public-quote-evidence';
  box.setAttribute('aria-label', '실제 SOXL 공개 가격 근거 snapshot');
  box.dataset.evidenceMode = snapshot.dataMode;
  box.dataset.marketFingerprint = snapshot.materialFingerprint ?? '';
  box.dataset.analysisId = snapshot.input.evidence?.market.analysisId ?? '';
  if (snapshot.eligibility === 'EXCLUDED') {
    box.append(node('h2', 'SOXL 가격 근거 연결 보류'), node('p', snapshot.state + ' · ' + snapshot.reason),
      node('p', '시점·세션·동일성 검증을 충족하지 않아 가격 근거로 표시하지 않습니다.'));
    return box;
  }
  const e = snapshot.input.evidence, m = e?.market;
  box.append(node('h2', '실제 공개 근거 연결됨 · SOXL 저장 가격 관측'));
  box.append(node('p', '이 카드만 저장된 공개 market projection입니다. 잔고·포지션·추천·점수·순위와 아래 판단 샘플은 실제 데이터가 아닙니다.'));
  box.append(node('p', '현재가·종가로 단정하지 않음 · ' + snapshot.state + ' · ' + snapshot.reason));
  if (!e || !m) { box.append(node('p', '저장 근거 없음')); return box; }
  const basis = m.priceBasis === 'DELAYED' ? (m.delayedMinutes ?? '지연분 미확인') + '분 지연 관측'
    : m.priceBasis === 'EOD' ? '완료된 정규장 일별 종가' : m.priceBasis ?? '가격 기준 미확인';
  const list = node('dl');
  for (const [label, value] of [
    ['저장 가격', m.price + ' ' + m.currency + ' · ' + basis],
    ['공급자 표시 등락률', m.changePercent === null ? '미확인' : m.changePercent + '% · 비교 기준 미저장'],
    ['가격 관측시각 (observedAt)', m.observedAt ?? '미확인'],
    ['MyMonitor 수집시각 (fetchedAt)', m.fetchedAt ?? '미확인'],
    ['canonical 조립시각 (collectedAt)', e.collectedAt],
    ['snapshot 추출시각 (capturedAt)', snapshot.input.capturedAt],
    ['후보 탐색 기준시각 (cutoffAt)', snapshot.cutoffAt],
    ['세션 / 장중 사용 가능', (m.session ?? 'UNKNOWN') + ' / ' + String(m.intradayUsable === true)],
    ['provider / freshness', m.provider + ' / ' + snapshot.state],
    ['source market / timezone', 'NOT STORED / NOT STORED · observedAt ISO instant 보존'],
    ['fallback / cache', '저장된 canonical projection / provider fallback 여부 NOT STORED'],
    ['기존 market analysisId', m.analysisId ?? '미확인'],
    ['기존 market fingerprint', snapshot.materialFingerprint ?? '미확인'],
    ['공개 projection contentHash', snapshot.contentHash ?? '미확인'],
  ]) { list.append(node('dt', label), node('dd', value)); }
  box.append(list);
  const detail = node('details'); detail.append(node('summary', '가격 의미·PIT·보존 한계 확인'));
  detail.append(node('p', '저장 시세 종류는 ' + basis + '입니다. CLOSED는 snapshot 조립 당시의 장 상태이며 observedAt의 거래 세션을 새로 추정한 값이 아닙니다.'));
  detail.append(node('p', 'previous close: NOT STORED · changePercent comparison basis: NOT STORED. 따라서 전일 종가 대비라고 바꾸어 말하지 않습니다.'));
  detail.append(node('p', 'daily history: NOT STORED · adjustment status: UNKNOWN. MA·RSI 등 파생값은 저장돼도 원 일봉·조정 이벤트 버전이 없어 이 preview의 PIT 가격 이력으로 사용하지 않습니다.'));
  detail.append(node('p', 'source URL: NOT STORED. provider identity만 보존되어 원자료 직접 링크를 만들지 않습니다.'));
  detail.append(node('p', 'fetchedAt만 달라지면 기존 market fingerprint는 유지되고, 가격·관측시각·세션 등 material field가 바뀌면 fingerprint 불일치로 제외합니다.'));
  box.append(detail); return box;
}
