import type { PublicFxDiscoverySnapshot } from '../../../shared/owner-discovery-contract';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; return n;
}

export function fxEvidenceView(snapshot: PublicFxDiscoverySnapshot): HTMLElement {
  const box = node('section'); box.className = 'card public-fx-evidence';
  box.setAttribute('aria-label', '실제 ECB FX 공개 근거 snapshot');
  box.dataset.evidenceMode = snapshot.dataMode;
  if (snapshot.eligibility === 'EXCLUDED') {
    box.append(node('h2', 'ECB FX 근거 연결 보류'), node('p', snapshot.state + ' · ' + snapshot.reason),
      node('p', '출처·시점·동일성 검증을 충족하지 않아 현재 근거로 표시하지 않습니다.'));
    return box;
  }
  const e = snapshot.input.evidence;
  box.append(node('h2', '실제 공개 근거 연결됨 · USD/KRW ECB 참고 환산'));
  box.append(node('p', '이 카드는 저장된 공개 FX reference입니다. 실제 규칙 판정은 별도 저장된 후보 검토 결과 카드에서 확인합니다. 설계 샘플로 표시한 판단·포지션은 mock이며 추천·점수·순위는 생성하지 않습니다.'));
  box.append(node('p', '실시간 환율 아님 · 파생 reference · ' + snapshot.state + ' · ' + snapshot.reason));
  if (!e) { box.append(node('p', '저장 근거 없음')); return box; }
  const list = node('dl');
  for (const [label, value] of [
    ['참고 환산값', '1 USD = ' + e.rate.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) + ' KRW · 파생값'],
    ['ECB 기준 관측일 (observedAt)', e.observedAt],
    ['MyMonitor 수집시각 (fetchedAt)', e.fetchedAt],
    ['snapshot 추출시각 (capturedAt)', snapshot.input.capturedAt],
    ['후보 탐색 기준시각 (cutoffAt)', snapshot.cutoffAt],
    ['출처 / 저장 경로', e.source + ' / ' + snapshot.input.storagePath],
    ['current key 상태', snapshot.input.currentKeyState],
    ['사실 fingerprint', snapshot.materialFingerprint ?? '미확인'],
    ['projection contentHash', snapshot.contentHash ?? '미확인'],
    ['읽기 검증 byte hash', snapshot.input.inspectionByteHash + ' · extraction-only, canonical ID 아님'],
    ['freshness', snapshot.state + ' · 기존 120시간 reference 규칙'],
  ]) { list.append(node('dt', label), node('dd', value)); }
  box.append(list);
  const detail = node('details'); detail.append(node('summary', '계산·출처·보존 한계 확인'));
  const source = node('a', e.source + ' 원자료 위치'); source.href = e.url; source.target = '_blank'; source.rel = 'noopener noreferrer';
  detail.append(source, node('p', e.basis));
  detail.append(node('p', '직접 관측값: EUR/USD, EUR/KRW · 저장된 파생값: USD/KRW. parser는 같은 ECB 기준일의 두 값을 요구합니다.'));
  detail.append(node('p', '원시 EUR/USD·EUR/KRW 값과 개별 레그 identity는 현재 저장되지 않았습니다. 따라서 이 snapshot은 계산 당시 동일 기준일 검사를 독립적으로 재현하지 않으며 직접 ECB USD/KRW 발표로 표시하지 않습니다.'));
  detail.append(node('p', 'observedAt은 ECB 기준일, fetchedAt은 MyMonitor 수집시각, capturedAt은 이번 읽기 전용 추출시각입니다. 재조회 시각을 새 환율 관측일로 바꾸지 않습니다.'));
  box.append(detail); return box;
}
