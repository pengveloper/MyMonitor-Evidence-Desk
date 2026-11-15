import type { SecProvenanceInspection } from '../../../shared/public-sec-provenance';
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; return n;
}
export function secProvenanceView(result?: SecProvenanceInspection): HTMLElement {
  const box = node('details'); box.className = 'sec-records';
  box.append(node('summary', '공시별 저장 발췌와 시각 확인'));
  if (!result || result.level !== 'REPLAY_MATCH' || !result.input) {
    box.append(node('p', 'cluster-level provenance only · 개별 연결 미확인 · ' + (result?.reason ?? 'RECORDS_MISSING')));
    return box;
  }
  const input = result.input, e = input.evidence;
  box.dataset.provenance = result.level;
  box.append(node('p', '공시별 signal 발췌 연결 확인 · 기존 cluster 재현 일치 · ' + result.state));
  box.append(node('p', '나중에 읽은 보존본의 내용 일치입니다. 과거 cluster의 불변 member receipt나 문장별 원문 위치가 아닙니다. 동일 문구가 여러 공시에 있어 출처를 하나로 단정하지 않습니다.'));
  const list = node('dl');
  for (const [label, value] of [
    ['SEC/news 조회 후 판정 기준시각 (discoveredAtMs)', new Date(e.discoveredAtMs).toISOString()],
    ['개별 레코드 snapshot 추출 (capturedAt)', input.capturedAt],
    ['원문 수집 / 최초 인지 / filingDate', 'MISSING · 기존 보존 signal에 없음'],
    ['보존 위치', input.sourceKey],
    ['원본 연결', 'SEC 인덱스 URL · 개별 document filename / 본문 위치 미보존'],
    ['레코드 내용 hash (이번 검사에서 계산)', result.contentHash ?? 'MISSING'],
    ['레코드 의미 fingerprint (이번 검사에서 계산)', result.materialFingerprint ?? 'MISSING'],
  ]) list.append(node('dt', label), node('dd', value));
  box.append(list);
  const accessions = [...new Set(e.signals.map(s => s.accessionNumber))];
  for (const accession of accessions) {
    const rows = e.signals.filter(s => s.accessionNumber === accession), first = rows[0]!;
    const filing = node('details'); filing.dataset.accession = accession;
    filing.append(node('summary', first.form + ' · ' + accession + ' · 저장 signal ' + rows.length + '건'));
    filing.append(node('p', 'SEC accepted time (timestampMs): ' + new Date(first.timestampMs).toISOString()));
    filing.append(node('p', '개별 retrieval time: MISSING · 추출/응답 조립시각으로 대체하지 않음'));
    const link = node('a', 'SEC 원문 인덱스 · ' + first.url); link.href = first.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; filing.append(link);
    for (const row of rows) {
      filing.append(node('h4', row.type), node('pre', row.evidenceExcerpt || '발췌 없음'));
    }
    box.append(filing);
  }
  box.append(node('p', '제목 번역은 기존 cluster ID에 연결된 저장 번역입니다. 개별 발췌 번역은 미연결이며 영어 원문을 유지합니다. 공시 본문 캐시는 검사 당시 없었고 재수집하지 않았습니다.'));
  return box;
}
