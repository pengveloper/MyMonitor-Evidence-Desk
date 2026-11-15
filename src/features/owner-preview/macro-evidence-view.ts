import type { PublicFredDiscoverySnapshot } from '../../../shared/owner-discovery-contract';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; return n;
}

export function macroEvidenceView(snapshot: PublicFredDiscoverySnapshot): HTMLElement {
  const box = node('section'); box.className = 'card public-macro-evidence';
  box.setAttribute('aria-label', '실제 DGS10 공개 거시 근거 snapshot');
  box.dataset.evidenceMode = snapshot.dataMode;
  box.dataset.macroFingerprint = snapshot.materialFingerprint ?? '';
  box.dataset.seriesId = snapshot.input.evidence?.series.seriesId ?? '';

  if (snapshot.eligibility === 'EXCLUDED') {
    box.append(node('h2', 'DGS10 거시 근거 연결 보류'), node('p', snapshot.state + ' · ' + snapshot.reason),
      node('p', '시점·결측·동일성 검증을 충족하지 않아 거시 근거로 표시하지 않습니다.'));
    return box;
  }

  const series = snapshot.input.evidence?.series;
  const observation = snapshot.observation;
  box.append(node('h2', '실제 공개 근거 연결됨 · DGS10 저장 관측'));
  box.append(node('p', '이 카드만 Production 화면에서 읽은 공개 DGS10 관측의 sanitized snapshot입니다. 후보·추천·점수·순위와 실제 보유 정보는 아닙니다.'));
  box.append(node('p', '실시간 금리 아님 · ' + snapshot.state + ' · ' + snapshot.reason));
  if (!series || !observation) { box.append(node('p', '저장 근거 없음')); return box; }

  const displayValue = series.units === 'Percent' ? observation.value + '%' : observation.value + ' ' + series.units;
  const fetchedAt = snapshot.input.seedMeta
    ? new Date(snapshot.input.seedMeta.fetchedAt).toISOString()
    : '이번 UI readback에서 미확인 · capturedAt으로 대체하지 않음';
  const list = node('dl');
  for (const [label, value] of [
    ['series / title', series.seriesId + ' / ' + series.title],
    ['관측값 / 원 단위', displayValue + ' / ' + series.units],
    ['observation date', observation.date + ' · timestamp 또는 release time 아님'],
    ['publication / release time', snapshot.coverage.publicationTime],
    ['MyMonitor fetchedAt', fetchedAt],
    ['snapshot capturedAt', snapshot.input.capturedAt],
    ['discovery cutoffAt', snapshot.cutoffAt],
    ['provider / storage key', 'FRED / ' + snapshot.input.sourceKey],
    ['frequency / freshness', series.frequency + ' / ' + snapshot.observationFreshness],
    ['seed liveness', snapshot.transportFreshness + ' · 기존 1500분 meta 계약'],
    ['historical PIT confidence', snapshot.provenanceLevel],
    ['vintage / realtime_start / realtime_end', 'NOT STORED / NOT STORED / NOT STORED'],
    ['fact fingerprint', snapshot.materialFingerprint ?? '미확인'],
    ['projection contentHash', snapshot.contentHash ?? '미확인'],
  ]) { list.append(node('dt', label), node('dd', value)); }
  box.append(list);

  const detail = node('details'); detail.append(node('summary', '거시 관측 의미·PIT·보존 한계 확인'));
  detail.append(node('p', '5.01의 원 단위는 Percent이며 0.0501 비율이나 501%로 바꾸지 않습니다. percentage-point 변화는 이 한 건으로 계산하지 않습니다.'));
  detail.append(node('p', 'observation date는 통계 관측일입니다. publication/release timestamp가 저장되지 않아 2026-09-18 자정에 시스템이 알았다고 주장하지 않습니다.'));
  detail.append(node('p', 'ALFRED vintage, realtime_start/end, firstObserved, immutable raw receipt가 없어 HISTORICAL_PIT_CONFIRMED로 승격하지 않습니다.'));
  detail.append(node('p', 'fetchedAt은 별도 seed-meta 키의 liveness clock입니다. 이번 화면 readback에는 포함되지 않아 freshness를 current로 승격하지 않았습니다.'));
  detail.append(node('p', '점(.)·blank·null은 0이 아닙니다. adapter는 실제 숫자 0만 관측값 0으로 보존합니다.'));
  detail.append(node('p', 'source URL·fallback state·주말/휴일을 아는 observation freshness 계약은 저장되지 않았습니다. 새 임의 기준을 만들지 않았습니다.'));
  box.append(detail);
  return box;
}
