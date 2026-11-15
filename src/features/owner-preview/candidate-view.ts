import type { CandidateLedger, CandidateReason, CandidateRevision, CandidateSlot } from '../../../shared/owner-candidate-contract';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.textContent = text; return n;
}
const labels = { quote: '가격', sec: '개별기업 SEC', fx: 'ECB 참고환산', macro: 'DGS10 거시 맥락' };
function labelReason(code: string, symbol: string, assetClass: string): string {
  if (code === 'INSTRUMENT_CLASS_UNVERIFIED') return '상품 분류가 공개 저장 근거에 없어 확인 보류';
  if (code === 'quote:CANONICAL_QUOTE_STALE') return '저장된 ' + symbol + ' 가격이 오래돼 현재 가격 검토 기준으로 사용 불가';
  if (code === 'sec:EVIDENCE_MISSING') return assetClass === 'UNKNOWN' ? '상품 분류 확인 전 SEC 적용 정책을 확정할 수 없음 · 같은 종목 근거 없음' : '필수 개별기업 SEC 근거 없음';
  return code;
}
function list(title: string, rows: string[]): HTMLElement {
  const box = el('section'); box.append(el('h3', title));
  const ul = el('ul'); for (const row of rows) ul.append(el('li', row));
  box.append(ul); return box;
}
function reasons(title: string, rows: CandidateReason[], none: string): HTMLElement {
  const box = el('section'); box.append(el('h3', title));
  if (!rows.length) { box.append(el('p', none)); return box; }
  for (const row of rows) {
    const p = el('div', row.fact + ' — ' + row.relevance);
    const detail = el('details'); detail.append(el('summary', '근거 연결 확인'));
    detail.append(el('p', 'canonical ID: ' + row.reference.canonicalId), el('p', 'fingerprint: ' + row.reference.fingerprint));
    p.append(detail); box.append(p);
  }
  return box;
}
function slotText(slot: CandidateSlot): string {
  return labels[slot.key] + ' · ' + slot.state + ' · ' + (slot.blocksOutcome ? '보류 원인' : slot.role === 'NOT_APPLICABLE' ? '이 정책에는 비적용' : '보조·선택 항목');
}
/** Presentation only; A/B never evaluate eligibility or change domain records. */
export function candidateView(ledger: CandidateLedger, symbol: string, layout: string): HTMLElement {
  const box = el('section'); box.className = 'card candidate-review';
  box.setAttribute('aria-label', '저장된 후보 검토 결과');
  const records = ledger.revisions.filter(r => r.snapshot.instrument.symbol === symbol);
  if (!records.length) {
    box.append(el('h2', symbol + ' · 저장된 검토 결과 없음'), el('p', '이 종목은 이번 최소 흐름에서 검사하지 않았습니다. 다른 종목의 결과를 대신 표시하지 않습니다.'));
    return box;
  }
  const select = el('select'); select.setAttribute('aria-label', '저장된 검토 revision');
  for (const record of records) {
    const option = el('option', 'revision ' + record.revision + ' · ' + record.snapshot.outcome);
    option.value = String(record.revision); select.append(option);
  }
  const content = el('div');
  const render = (record: CandidateRevision) => {
    const s = record.snapshot;
    content.replaceChildren(); box.dataset.candidateFingerprint = s.bundleFingerprint;
    box.dataset.candidateOutcome = s.outcome; box.dataset.evidenceMode = s.dataMode;
    box.dataset.instrument = s.instrument.symbol;
    content.append(el('h2', s.instrument.symbol + ' · ' + s.outcome + ' · ' + (s.outcome === 'NO_CANDIDATE' ? '추가 검토 보류' : '추가 검토 가능')));
    content.append(el('p', s.dataMode === 'SYNTHETIC_TEST' ? '합성 테스트 결과 · 실제 시장 판정 아님' : '실제 공개 저장 snapshot의 규칙 판정 · 실시간 조회 아님 · 매수·매도 추천 아님'));
    content.append(el('p', '기준시각 ' + s.cutoffAt + ' (UTC) · 상품 분류 ' + s.instrument.assetClass + ' · revision ' + record.revision));
    const blockers = list('왜 이 결과인가', s.blockers.length ? s.blockers.map(code => labelReason(code, s.instrument.symbol, s.instrument.assetClass)) : ['현재 규칙의 필수 근거를 충족했습니다. 투자 방향은 판단하지 않았습니다.']);
    const slots = el('section'); slots.append(el('h3', '사용한 근거와 제외·부족한 근거'));
    if (layout === 'B') {
      const table = el('table'); table.setAttribute('aria-label', '근거별 검토 상태');
      const head = el('tr'); for (const text of ['근거', '상태', '결과에 미친 영향']) head.append(el('th', text));
      const thead = el('thead'); thead.append(head); table.append(thead);
      const body = el('tbody');
      for (const slot of s.slots) {
        const tr = el('tr'); tr.dataset.slot = slot.key; tr.dataset.eligibility = slot.state;
        tr.append(el('td', labels[slot.key]), el('td', slot.state), el('td', slot.blocksOutcome ? '보류 원인' : slot.role === 'NOT_APPLICABLE' ? '비적용' : '보조·선택'));
        body.append(tr);
      }
      table.append(body); slots.append(table);
    } else {
      const ul = el('ul');
      for (const slot of s.slots) {
        const li = el('li', slotText(slot)); li.dataset.slot = slot.key; li.dataset.eligibility = slot.state; ul.append(li);
      }
      slots.append(ul);
    }
    if (layout === 'B') content.append(slots, blockers); else content.append(blockers, slots);
    content.append(reasons('검증을 통과한 근거의 용도', s.reasons, '적격 근거 없음'),
      reasons('반대 근거·해석 제한', s.counterevidence, '연결 가능한 적격 반대 근거 없음 · 반대 위험이 없다는 뜻은 아닙니다.'),
      list('다음에 확인할 조건', s.reconsiderWhen.length ? s.reconsiderWhen : ['기초 노출·공시·가격 의미를 추가 분석합니다.']),
      list('아직 모르는 것', s.unresolved));
    const details = el('details'); details.append(el('summary', '동일성·시점·보존 근거 펼치기'));
    details.append(el('p', 'rules: ' + s.rulesVersion), el('p', 'bundle fingerprint: ' + s.bundleFingerprint),
      el('p', 'requestedAt: ' + s.requestedAt), el('p', 'assembledAt: ' + s.assembledAt),
      el('p', '이전 revision: ' + (record.previousFingerprint ?? '없음')));
    if (s.classification) {
      const c = s.classification;
      details.append(el('p', '상품 분류 근거 · ' + c.eligibility + ' · ' + c.reason),
        el('p', 'EODHD 원본 General.Type: ' + (c.input.evidence?.General.Type ?? '없음')),
        el('p', '분류 fingerprint: ' + (c.materialFingerprint ?? '없음')),
        el('p', '저장 위치: ' + c.input.sourceKey),
        el('p', '읽은 시각: ' + c.input.capturedAt + ' (UTC) · 원본 metadata 최초 수집 시각은 미보존'),
        el('p', '공급자 metadata 업데이트일: ' + (c.input.evidence?.General.UpdatedAt ?? '미확인') + ' · 발표시각이나 최초 수집시각이 아닙니다.'),
        el('p', '현재 저장 자료를 읽어 확인한 분류입니다. 과거 당시의 지식을 증명하지 않습니다. 레버리지·방향·기초지수는 이 근거로 확인하지 않았습니다.'));
    }
    for (const slot of s.slots) details.append(el('p', labels[slot.key] + ' · ' + slot.scope + ' · ' + slot.role + ' · ' + slot.reason),
      el('p', 'canonical ID: ' + (slot.reference?.canonicalId ?? '없음') + ' · fingerprint: ' + (slot.reference?.fingerprint ?? '없음')));
    content.append(details);
  };
  select.value = String(records[records.length - 1]!.revision);
  select.onchange = () => render(records.find(r => String(r.revision) === select.value)!);
  box.append(el('p', '저장된 검토 이력 · 격리 preview artifact'), select, content);
  render(records[records.length - 1]!);
  return box;
}
